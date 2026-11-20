import type { WikiAgentState } from './wiki-agent-state.ts';
import { wikiAgentVersion } from './wiki-agent-source.ts';
import type { IncomingMessage, ServerResponse, OutgoingHttpHeaders } from 'node:http';
import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, chmodSync, unlinkSync } from 'node:fs';
import { Store, DomainError, errorPayload } from './domain.ts';
import { codexAction, extractWikiExperience, generateSessionSummary, listWikiModels, openExperienceChat, prepareExperienceChat, startExperienceExtraction } from './codex.ts';
import { ExperiencePreparations } from './experience-preparation.ts';
import { selectSummaryCandidates } from './session-summary.ts';
import { WikiExperience } from './wiki-experience.ts';
import { sameWikiModel, validateWikiModel } from './wiki-models.ts';
import type { WikiModelSelection } from './wiki-models.ts';
import type { WikiPreview, ExperienceRecord } from './wiki-experience.ts';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { wikiActionSchema, wikiUiSchema } from './wiki-action-schema.ts';
import { dbPath, dataDir, runtimePath, port, origin } from './paths.ts';
import pkg from '../package.json' with { type: 'json' };

const store = new Store(dbPath);
chmodSync(dbPath, 0o600);
const token = randomBytes(32).toString('hex');
const sessions = new Map<string, { csrf: string; expires: number }>();
const wikiTickets = new Map<string, { owner: string; preview: WikiPreview; expires: number }>();
const wikiJobs = new Map<string, Promise<ExperienceRecord>>();
const wikiJobControllers = new Map<string, AbortController>();
const wikiComparisons = new Map<string, { sessionId: string; revision: number; modelSelection: WikiModelSelection; controller: AbortController; pending: Promise<ExperienceRecord> }>();
let wikiStore: WikiExperience | undefined;
const wikiRoot = resolve(process.env.AI_TODOS_WIKI_ROOT || join(homedir(), 'Documents/Obsidian Vault/40-LLM-Wiki/wiki'));
const vaultRoot = process.env.AI_TODOS_VAULT_ROOT ? resolve(process.env.AI_TODOS_VAULT_ROOT) :
  basename(dirname(wikiRoot)) === '40-LLM-Wiki' ? dirname(dirname(wikiRoot)) : undefined;
let experiencePreparations: ExperiencePreparations;
function wiki() {
  // 首次访问时恢复中断的写入，恢复失败时不缓存不可用的连接。
  if (!wikiStore) {
    const next = new WikiExperience(dbPath, wikiRoot, vaultRoot);
    try { next.recover(); } catch (error) { next.close(); throw error; }
    wikiStore = next;
  }
  return wikiStore;
}
const summaryAttempts = new Map<string, number>();
let summaryRun: { controller: AbortController; pending: Promise<void> } | undefined;
let stoppingSummaries = false;
const requestedSummaries = new Set<string>();
/** 串行生成近期会话概要，并在读取期间会话变化时丢弃过期结果。 */
function scheduleSessionSummary(requestedId?: string) {
  if (requestedId) requestedSummaries.add(requestedId);
  if (stoppingSummaries || summaryRun) return;
  const sessions = store.sessions();
  for (const id of requestedSummaries) {
    const item = sessions.find(session => session.id === id);
    if (!item?.catalogUpdatedAt || ['running', 'queued'].includes(item.state)) requestedSummaries.delete(id);
  }
  const requested = [...requestedSummaries].map(id => sessions.find(item => item.id === id)).find(Boolean);
  const days = store.settings().sessionMaxAgeDays || 7;
  const candidates = selectSummaryCandidates(sessions, days);
  const session = requested || candidates.find(item => Date.now() - (summaryAttempts.get(item.id) ?? 0) > 3600000);
  if (requested) requestedSummaries.delete(requested.id);
  if (!session?.catalogUpdatedAt) return;
  const sourceUpdatedAt = session.catalogUpdatedAt;
  const controller = new AbortController();
  summaryAttempts.set(session.id, Date.now());
  const pending = generateSessionSummary(store, session.id, controller.signal).then(summary => {
    // 同步或新活动改变版本时，旧内容不能标为最新概要。
    const current = store.sessions().find(item => item.id === session.id);
    if (current?.catalogUpdatedAt === sourceUpdatedAt && !['running', 'queued'].includes(current.state)) {
      store.setMeta(`session.summary.${session.id}`, { ...summary, sourceUpdatedAt });
    }
    store.setMeta(`session.summary-status.${session.id}`, '');
    summaryAttempts.delete(session.id);
  }).catch(() => {
    store.setMeta(`session.summary-status.${session.id}`, stoppingSummaries ? '' : 'failed');
  }).finally(() => { summaryRun = undefined; if (!stoppingSummaries && requestedSummaries.size) scheduleSessionSummary(); });
  summaryRun = { controller, pending };
}
/** 同步后调度概要，不能让后台生成延迟会话同步。 */
async function runCodexAction(input: unknown) {
  const result = await codexAction(store, input);
  if (input && typeof input === 'object' && 'operation' in input) {
    if (input.operation === 'sync_threads') scheduleSessionSummary();
    if (input.operation === 'summarize_session' && 'id' in input && typeof input.id === 'string') {
      const target = store.sessions().find(session => session.id === input.id);
      if (!target?.catalogUpdatedAt || ['running', 'queued'].includes(target.state)) throw new Error('会话不存在、更新时间未知或正在运行，暂时无法生成概要');
      scheduleSessionSummary(input.id);
    }
  }
  return result;
}
// 原生任务保存来源摘要、线程关联和活动，重试时先核对原会话快照。
function startWikiAnalysis(sessionId: string, modelSelection?: WikiModelSelection) {
  // 正在运行的任务使用已固定的配置，重入请求不能暗中换模型。
  const existing = wikiJobs.get(sessionId);
  if (existing) {
    if (!sameWikiModel(wiki().latestAnalysis(sessionId)?.modelSelection, modelSelection)) throw new Error('分析进行中，请先取消再更换模型');
    return existing;
  }

  // 任务和用户偏好一起落盘；后续模型调用只读取这份任务配置。
  const job = wiki().startAnalysis(sessionId, modelSelection, wikiAgentVersion);
  const controller = new AbortController();
  wikiJobControllers.set(sessionId, controller);

  // 后台线程独立于弹窗生命周期；失败保留实际线程和活动供显式恢复。
  const pending = extractWikiExperience(store, sessionId, wikiRoot, vaultRoot, undefined, {
    id: job.id,
    begin: (hash, total) => wiki().beginNativeAnalysis(job.id, hash, total),
    state: agent => { wiki().updateAnalysis(job.id, { agent }); },
    progress: (completed, total) => { wiki().updateAnalysis(job.id, { completed, total, phase: 'agent' }); },
  }, controller.signal, job.modelSelection).then(data => wiki().completeAnalysis(job.id, data)).catch(error => {
    wiki().updateAnalysis(job.id, { status: 'failed', error: error instanceof Error ? error.message : String(error) });
    throw error;
  });
  wikiJobs.set(sessionId, pending);
  void pending.finally(() => { wikiJobs.delete(sessionId); wikiJobControllers.delete(sessionId); }).catch(() => {});
  return pending;
}
/** 对同一审核版本只启动一份 Wiki 对照；重试新建线程，避免混入已变化页面的旧上下文。 */
function startWikiComparison(record: ExperienceRecord, requested: WikiModelSelection) {
  // 并发界面复用相同执行；不同版本或模型不能并发恢复同一份整理资料。
  const existing = wikiComparisons.get(record.id);
  if (existing) {
    if (existing.revision !== record.revision || !sameWikiModel(existing.modelSelection, requested)) throw new Error('Wiki 对照进行中，请等待或取消后重试');
    return existing.pending;
  }

  // 每次对照读取最新页面；失败轨迹单独留存，不复用可能过时的 Wiki 上下文。
  const taskId = `comparison-${record.id}-${record.revision}-${randomUUID()}`;
  const key = `wiki.comparison.${taskId}`;
  let run: { snapshotHash?: string; agent?: WikiAgentState } = {};
  const controller = new AbortController();
  const pending = (async () => {
    // 模型目录查询也属于可取消的单运行边界，不能在登记控制器之前等待。
    const selected = validateWikiModel(await listWikiModels(controller.signal), requested);
    if (controller.signal.aborted) throw new Error('Wiki 对照已取消');
    const current = wiki().get(record.id);
    if (current.revision !== record.revision || current.status !== 'pending') throw new Error('候选版本或状态已变化，请重新审核');

    // 当前页面只读取一次并交给专用 Agent，保存时仍校验人工审核版本。
    const comparison = await extractWikiExperience(store, record.sessionId, wikiRoot, vaultRoot, record.data.workflow!, {
      id: taskId,
      begin: snapshotHash => { run = { snapshotHash }; store.setMeta(key, run); return undefined; },
      state: agent => { run = { ...run, agent }; store.setMeta(key, run); },
      progress: () => {},
    }, controller.signal, selected);
    return wiki().saveComparison(record.id, record.revision, comparison, selected, run.agent);
  })();
  wikiComparisons.set(record.id, { sessionId: record.sessionId, revision: record.revision, modelSelection: requested, controller, pending });
  void pending.finally(() => wikiComparisons.delete(record.id)).catch(() => {});
  return pending;
}
/** 处理人工界面的经验操作；只有同一界面取得的预览票据可以批准。 */
async function wikiAction(raw: unknown, owner: string) {
  // 目录查询只读取账户可用模型和本地偏好，不修改全局配置。
  const input = wikiActionSchema.parse(raw);
  // 归档复用稳定 UI 信封，避开旧 MCP 工具定义；显示版本与人工边界仍由 Store 校验。
  if (input.operation === 'archive_session') return store.confirmSession(input.confirmation);
  // 发起与重试分别定位新记录和原断点，共享浏览器及嵌入面板的校验入口。
  if (input.operation === 'prepare_capture') {
    if (!vaultRoot) throw new Error('请配置 AI_TODOS_VAULT_ROOT 后再准备沉淀会话');
    const preference = store.meta<{ revision: number; selection: WikiModelSelection | null }>('experience.modelPreference', { revision: 0, selection: null });
    if (!preference.selection) throw new Error('请先在设置中保存沉淀默认模型');
    const request = input.recordId ? { recordId: input.recordId, focus: input.focus } : undefined;
    return experiencePreparations.start(input.sessionId, preference.selection, request);
  }
  if (input.operation === 'retry_capture') return experiencePreparations.retry(input.sessionId, input.recordId);
  if (input.operation === 'ack_capture') return experiencePreparations.acknowledge(input.sessionId, input.jobId);
  if (input.operation === 'open_capture') {
    if (!vaultRoot) throw new Error('请配置 AI_TODOS_VAULT_ROOT 后再打开沉淀会话');
    // 历史入口仅跳转到选中的聊天；旧版单按钮沿用最近一次准备状态。
    if (input.recordId) return openExperienceChat(store, input.sessionId, wikiRoot, vaultRoot, input.recordId);
    const job = store.experienceRecords(input.sessionId)[0]?.preparation;
    if (job && job.status !== 'ready' && !(job.status === 'failed' && job.stage === 'extracting')) throw new Error(job.error || '沉淀会话还在后台准备，请稍后进入');
    return openExperienceChat(store, input.sessionId, wikiRoot, vaultRoot);
  }
  if (input.operation === 'models') return { models: await listWikiModels(), preference: wiki().modelPreference(), capturePreference: store.meta('experience.modelPreference', { revision: 0, selection: null }) };
  if (input.operation === 'set_capture_model') {
    // 验证账户当前支持的模型，再检查版本，防止慢目录查询覆盖另一窗口已保存的选择。
    const selection = validateWikiModel(await listWikiModels(), input.modelSelection);
    const current = store.meta('experience.modelPreference', { revision: 0, selection: null });
    if (current.revision !== input.revision) throw Object.assign(new Error('默认模型设置已变化，请刷新后重试'), { status: 409 });
    return { capturePreference: store.setMeta('experience.modelPreference', { revision: current.revision + 1, selection }) };
  }

  // 读取与生成仅允许指向已观察或宿主同步的会话。
  if (input.operation === 'list' || input.operation === 'generate' || input.operation === 'start' || input.operation === 'progress' || input.operation === 'cancel') {
    if (!store.sessions().some(item => item.id === input.sessionId)) throw new Error('会话不存在，请先同步会话列表');
    if (input.operation === 'list') return { records: wiki().list(input.sessionId) };
    if (input.operation === 'cancel') {
      wikiJobControllers.get(input.sessionId)?.abort();
      for (const comparison of wikiComparisons.values()) if (comparison.sessionId === input.sessionId) comparison.controller.abort();
      return { job: wiki().latestAnalysis(input.sessionId) };
    }
    if (input.operation === 'progress') {
      let job = wiki().latestAnalysis(input.sessionId);
      if (job?.status === 'running' && !wikiJobs.has(input.sessionId)) job = wiki().updateAnalysis(job.id, { status: 'failed', error: '分析已中断，请重试恢复后台会话；原文变化会新建分析线程' });
      return { job };
    }
    // 启动前确认模型和强度仍可用，不向后台提交无法执行的配置。
    const requested = input.modelSelection ?? wiki().latestAnalysis(input.sessionId)?.modelSelection ?? wiki().modelPreference();
    if (!requested) throw new Error('请先选择分析模型和推理强度');
    const selected = validateWikiModel(await listWikiModels(), requested);
    const pending = startWikiAnalysis(input.sessionId, selected);
    if (input.operation === 'start') return { job: wiki().latestAnalysis(input.sessionId) };
    return { record: await pending };
  }

  // 保存或拒绝使用界面实际读取的候选版本。
  if (input.operation === 'update') return { record: wiki().update(input.id, input.revision, input.data) };
  if (input.operation === 'reject') return { record: wiki().reject(input.id, input.revision, input.note) };

  // 仅将用户确认的经验送去 Wiki 对照；并发修改会使分析结果失效。
  if (input.operation === 'compare') {
    if (!vaultRoot) throw new Error('请配置 AI_TODOS_VAULT_ROOT 后再对照 Wiki');
    const record = wiki().get(input.id);
    const flow = record.data.workflow;
    if (record.revision !== input.revision || record.status !== 'pending' || !flow || flow.stage !== 'review' || flow.items.some(item => item.decision === 'pending') || !flow.items.some(item => item.decision === 'confirmed')) throw new Error('请先逐项确认，并至少保留一项经验');
    // 对照沿用本候选的模型，不能因用户后来更换偏好而暗中切换。
    if (record.modelSelection && input.modelSelection && !sameWikiModel(record.modelSelection, input.modelSelection)) throw new Error('本记录已固定分析模型，请重新提取后更换模型');
    const requested = record.modelSelection ?? input.modelSelection;
    if (!requested) throw new Error('请先选择分析模型和推理强度');
    return { record: await startWikiComparison(record, requested) };
  }

  // 预览票据绑定界面及完整差异；跨界面请求不得消费有效票据。
  if (input.operation === 'preview') {
    const preview = wiki().prepare(input.id, input.revision);
    const ticket = randomBytes(24).toString('hex');
    wikiTickets.set(ticket, { owner, preview, expires: Date.now() + 1800000 });
    return { ticket, preview };
  }
  const saved = wikiTickets.get(input.ticket);
  if (!saved || saved.owner !== owner || saved.expires < Date.now()) throw new Error('审核已过期，请重新预览');
  wikiTickets.delete(input.ticket);
  return { record: wiki().approve(saved.preview) };
}
/** 打开指定候选的本地审核页；该操作本身不批准或写入 Wiki。 */
async function openWikiReview(id: string, revision: number) {
  // 先校验候选的当前版本，避免把用户引向不同的审核对象。
  const record = wiki().get(id);
  if (record.revision !== revision || record.status !== 'pending') throw new Error('候选版本或状态已变化，请重新审核');
  const url = new URL(origin);
  url.hash = `experience=${record.sessionId}&record=${record.id}&revision=${record.revision}`;

  // 通过本机默认浏览器打开，最终批准仍由本地会话和 CSRF 校验保护。
  const [command, args] = process.platform === 'darwin' ? ['open', [url.toString()]] :
    process.platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url.toString()]] : ['xdg-open', [url.toString()]];
  try { await promisify(execFile)(command, args, { timeout: 10000 }); }
  catch { throw new Error(`无法打开本地审核页面，请手动访问 ${url}`); }
  return { url: url.toString() };
}
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
async function body(req: IncomingMessage, limit = 128000) {
  // 限制请求体大小，避免候选内容耗尽本地服务内存。
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new DomainError('errors.tooLarge', 413); chunks.push(chunk); }
  // 仅接受明确声明的 JSON 请求。
  if (!req.headers['content-type']?.startsWith('application/json')) throw new DomainError('errors.jsonRequired', 415);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const server = createServer(async (req, res) => {
  try {
    // 仅接受本机目标地址，内部接口使用单独的服务令牌。
    if (req.headers.host !== `127.0.0.1:${port}`) return send(res, 403, errorPayload(new DomainError('errors.loopbackOnly')));
    const path = new URL(req.url!, origin).pathname;
    if (stopping) return send(res, 503, { name: 'ai-todos', stopping: true, error: '服务正在关闭' }, { Connection: 'close' });
    if (path === '/health' && req.method === 'GET') return send(res, 200, { name: 'ai-todos', version: pkg.version });
    if (path.startsWith('/internal/')) {
      if (!same(req.headers.authorization, `Bearer ${token}`)) return send(res, 401, errorPayload(new DomainError('errors.unauthorized')));
      if (path === '/internal/ping') return send(res, 200, { ok: true, wikiUiRevision: 10 });
      if (path === '/internal/state') return send(res, 200, store.snapshot());
      if (path === '/internal/task' && req.method === 'POST') {
        const input = await body(req); return send(res, 200, { task: store.get('task', input.id), history: store.taskHistory(input.id) });
      }
      if (path === '/internal/command' && req.method === 'POST') return send(res, 200, store.command(await body(req), 'model'));
      if (path === '/internal/codex' && req.method === 'POST') return send(res, 200, await runCodexAction(await body(req)));
      if (path === '/internal/session-confirm' && req.method === 'POST') return send(res, 200, store.confirmSession(await body(req)));
      if (path === '/internal/task-complete' && req.method === 'POST') return send(res, 200, store.completeTask(await body(req)));
      if (path === '/internal/wiki' && req.method === 'POST') {
        const input = wikiUiSchema.parse(await body(req, 2500000));
        if (input.action.operation === 'open_review') return send(res, 200, await openWikiReview(input.action.id, input.action.revision));
        const result = await wikiAction(input.action, `app:${input.uiSessionId}`);
        return send(res, 200, input.action.operation === 'list' ? { ...result, connectionOutdated: input.bridgeRevision !== 1 } : result);
      }
      if (path === '/internal/stop' && req.method === 'POST') { send(res, 200, { stopped: true }); setImmediate(shutdown); return; }
      return send(res, 404, errorPayload(new DomainError('errors.routeMissing')));
    }
    // 浏览器接口要求同源、已创建的会话和 CSRF 票据。
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
    if (path === '/api/codex' && req.method === 'POST') return send(res, 200, await runCodexAction(await body(req)));
    if (path === '/api/session-confirm' && req.method === 'POST') return send(res, 200, store.confirmSession(await body(req)));
    if (path === '/api/task-complete' && req.method === 'POST') return send(res, 200, store.completeTask(await body(req)));
    // 浏览器和嵌入式界面共用同一审核逻辑，但票据不能跨界面使用。
    if (path.startsWith('/api/wiki/') && req.method === 'POST') {
      const operation = path.slice('/api/wiki/'.length);
      const payload = await body(req, operation === 'update' ? 2500000 : 128000);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('请求格式无效');
      return send(res, 200, await wikiAction({ ...payload, operation }, `browser:${cookieId!}`));
    }
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
  for (const [key, value] of wikiTickets) if (value.expires < Date.now()) wikiTickets.delete(key);
  for (const [key, value] of reviews) if (value.expires < Date.now()) reviews.delete(key);
}, 15000);
let stopping = false;
const startupDeadline = Date.now() + 4000;
function listen() {
  if (!stopping) server.listen(port, '127.0.0.1');
}
server.on('error', async (error: NodeJS.ErrnoException) => {
  // 升级客户端可能在旧实例取消原生提取期间启动新进程，仅等候正在退出的实例。
  if (error.code === 'EADDRINUSE' && Date.now() < startupDeadline && !stopping) {
    const response = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(300) }).catch(() => undefined);
    const health = response?.status === 503 ? await response.json().catch(() => undefined) : undefined;
    if (stopping) return;
    if (!response || (health?.name === 'ai-todos' && health.stopping === true)) {
      setTimeout(listen, 100);
      return;
    }
  }

  // 正常运行的服务拥有该端口，竞争者退出，不恢复数据库中的活动任务。
  if (stopping) return;
  clearInterval(timer);
  store.close();
  console.error(error.message);
  process.exitCode = 1;
});
server.on('listening', () => {
  // 成功独占端口才可恢复中断任务，避免并行启动者修改实际运行中的记录。
  experiencePreparations = new ExperiencePreparations(store, async (sourceId, options) => {
    if (!vaultRoot) throw new Error('请配置 AI_TODOS_VAULT_ROOT 后再准备沉淀会话');
    return (await prepareExperienceChat(store, sourceId, wikiRoot, vaultRoot, options)).chat;
  }, (chat, options) => startExperienceExtraction(store, chat, options));

  // 恢复结束后发布连接信息，新请求可以安全读取状态。
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  writeFileSync(runtimePath, JSON.stringify({ pid: process.pid, origin, token }), { mode: 0o600 });
  chmodSync(runtimePath, 0o600);
  console.error(`ai-todos listening at ${origin}`);
});
listen();

async function shutdown() {
  // 拒绝新请求并取消后台任务，保持监听直到本次沉淀断点落盘。
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  stoppingSummaries = true;
  summaryRun?.controller.abort();
  const preparationStopped = experiencePreparations?.stop();
  for (const controller of wikiJobControllers.values()) controller.abort();
  for (const comparison of wikiComparisons.values()) comparison.controller.abort();

  // 交出端口后，新实例可以恢复记录；现有请求和其他后台任务结束后再关闭数据库。
  await preparationStopped;
  server.close(() => {
    void Promise.allSettled([...wikiJobs.values(), ...[...wikiComparisons.values()].map(run => run.pending), ...(summaryRun ? [summaryRun.pending] : [])]).then(() => {
      try { if (JSON.parse(readFileSync(runtimePath, 'utf8')).token === token) unlinkSync(runtimePath); } catch {}
      wikiStore?.close(); store.close();
    });
  });
  server.closeIdleConnections();
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
