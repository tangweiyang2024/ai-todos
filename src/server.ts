import type { IncomingMessage, ServerResponse, OutgoingHttpHeaders } from 'node:http';
import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, chmodSync, unlinkSync } from 'node:fs';
import { Store, DomainError, errorPayload } from './domain.ts';
import { codexAction } from './codex.ts';
import { dbPath, dataDir, runtimePath, port, origin } from './paths.ts';
import pkg from '../package.json' with { type: 'json' };

const store = new Store(dbPath);
chmodSync(dbPath, 0o600);
const token = randomBytes(32).toString('hex');
const sessions = new Map<string, { csrf: string; expires: number }>();
const reviews = new Map<string, { cookieId: string; id: string; revision: number; expires: number }>();
let html;
try { html = readFileSync(new URL('../dist/app.html', import.meta.url), 'utf8').replaceAll('__AI_TODOS_ORIGIN__', origin); }
catch { throw new Error('UI missing. Run npm run build before starting ai-todos.'); }
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
const scriptHash = createHash('sha256').update(script || '').digest('base64');
const security = {
  'Content-Security-Policy': `default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store',
};
function send(res: ServerResponse, status: number, value: unknown, headers: OutgoingHttpHeaders = {}) {
  res.writeHead(status, { ...security, 'Content-Type': typeof value === 'string' ? 'text/html; charset=utf-8' : 'application/json', ...headers });
  res.end(typeof value === 'string' ? value : JSON.stringify(value));
}
function same(a: unknown, b: string) { return typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
async function body(req: IncomingMessage) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 128000) throw new DomainError('errors.tooLarge', 413); chunks.push(chunk); }
  if (!req.headers['content-type']?.startsWith('application/json')) throw new DomainError('errors.jsonRequired', 415);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const server = createServer(async (req, res) => {
  try {
    if (req.headers.host !== `127.0.0.1:${port}`) return send(res, 403, errorPayload(new DomainError('errors.loopbackOnly')));
    const path = new URL(req.url!, origin).pathname;
    if (path === '/health' && req.method === 'GET') return send(res, 200, { name: 'ai-todos', version: pkg.version });
    if (path.startsWith('/internal/')) {
      if (!same(req.headers.authorization, `Bearer ${token}`)) return send(res, 401, errorPayload(new DomainError('errors.unauthorized')));
      if (path === '/internal/ping') return send(res, 200, { ok: true });
      if (path === '/internal/state') return send(res, 200, store.snapshot());
      if (path === '/internal/task' && req.method === 'POST') {
        const input = await body(req); return send(res, 200, { task: store.get('task', input.id), history: store.taskHistory(input.id) });
      }
      if (path === '/internal/command' && req.method === 'POST') return send(res, 200, store.command(await body(req), 'model'));
      if (path === '/internal/codex' && req.method === 'POST') return send(res, 200, await codexAction(store, await body(req)));
      if (path === '/internal/session-confirm' && req.method === 'POST') return send(res, 200, store.confirmSession(await body(req)));
      if (path === '/internal/task-complete' && req.method === 'POST') return send(res, 200, store.completeTask(await body(req)));
      if (path === '/internal/stop' && req.method === 'POST') { send(res, 200, { stopped: true }); setImmediate(shutdown); return; }
      return send(res, 404, errorPayload(new DomainError('errors.routeMissing')));
    }
    if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== origin)) return send(res, 403, errorPayload(new DomainError('errors.crossSite')));
    if (path === '/' && req.method === 'GET') {
      const cookieId = randomBytes(24).toString('hex');
      sessions.set(cookieId, { csrf: randomBytes(24).toString('hex'), expires: Date.now() + 86400000 });
      return send(res, 200, html, { 'Set-Cookie': `ai_todos=${cookieId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400` });
    }
    if (path === '/favicon.ico') return send(res, 204, '');
    const cookieId = req.headers.cookie?.match(/(?:^|;\s*)ai_todos=([a-f0-9]+)(?:;|$)/)?.[1];
    const session = sessions.get(cookieId ?? '');
    if (!session || session.expires < Date.now()) return send(res, 401, errorPayload(new DomainError('errors.reopenApp')));
    if (req.method === 'POST' && (req.headers.origin !== origin || !same(req.headers['x-csrf-token'], session.csrf))) return send(res, 403, errorPayload(new DomainError('errors.invalidUiRequest')));
    if (path === '/api/state' && req.method === 'GET') return send(res, 200, { ...store.snapshot(), csrf: session.csrf });
    if (path === '/api/task' && req.method === 'POST') {
      const input = await body(req); return send(res, 200, { task: store.get('task', input.id), history: store.taskHistory(input.id) });
    }
    if (path === '/api/command' && req.method === 'POST') return send(res, 200, store.command(await body(req), 'human'));
    if (path === '/api/codex' && req.method === 'POST') return send(res, 200, await codexAction(store, await body(req)));
    if (path === '/api/session-confirm' && req.method === 'POST') return send(res, 200, store.confirmSession(await body(req)));
    if (path === '/api/task-complete' && req.method === 'POST') return send(res, 200, store.completeTask(await body(req)));
    if (path === '/api/review-ticket' && req.method === 'POST') {
      const { id, revision } = await body(req); const task = store.get('task', id); store.check(task, revision);
      if (task.state !== 'awaiting_acceptance') return send(res, 400, errorPayload(new DomainError('errors.deliveryRequired')));
      const ticket = randomBytes(24).toString('hex');
      reviews.set(ticket, { cookieId: cookieId!, id, revision, expires: Date.now() + 1800000 });
      return send(res, 200, { ticket, task });
    }
    if (path === '/api/review' && req.method === 'POST') {
      const input = await body(req); const ticket = reviews.get(input.ticket);
      if (!ticket || ticket.cookieId !== cookieId || ticket.id !== input.id || ticket.revision !== input.revision || ticket.expires < Date.now()) return send(res, 409, errorPayload(new DomainError('errors.expiredReview')));
      const { ticket: ignored, ...review } = input;
      const result = store.review(review); reviews.delete(input.ticket);
      return send(res, 200, result);
    }
    return send(res, 404, errorPayload(new DomainError('errors.routeMissing')));
  } catch (error) { send(res, error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : 400, errorPayload(error)); }
});
const timer = setInterval(() => {
  for (const [key, value] of sessions) if (value.expires < Date.now()) sessions.delete(key);
  for (const [key, value] of reviews) if (value.expires < Date.now()) reviews.delete(key);
}, 15000);
server.on('error', error => { clearInterval(timer); store.close(); console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  writeFileSync(runtimePath, JSON.stringify({ pid: process.pid, origin, token }), { mode: 0o600 });
  chmodSync(runtimePath, 0o600);
  console.error(`ai-todos listening at ${origin}`);
});
function shutdown() {
  clearInterval(timer);
  server.close(() => {
    try { if (JSON.parse(readFileSync(runtimePath, 'utf8')).token === token) unlinkSync(runtimePath); } catch {}
    store.close();
  });
  server.closeIdleConnections();
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
