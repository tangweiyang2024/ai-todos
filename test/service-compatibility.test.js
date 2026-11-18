import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('older clients do not stop a compatible newer service', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'wiki-compat-')); let stops = 0;
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/health') return res.end(JSON.stringify({ name: 'ai-todos', version: '0.1.23' }));
    if (req.url === '/internal/ping') return res.end(JSON.stringify({ ok: true, wikiUiRevision: 8 }));
    if (req.url === '/internal/stop') { stops++; res.statusCode = 503; return res.end('{}'); }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });
  const port = server.address().port;
  writeFileSync(join(dir, 'runtime.json'), JSON.stringify({ origin: `http://127.0.0.1:${port}`, token: 'fixture' }));
  const child = spawn(process.execPath, ['--input-type=module', '-e', `import {ensureService} from ${JSON.stringify(resolve('src/service-client.ts'))}; await ensureService();`], { env: { ...process.env, AI_TODOS_DATA_DIR: dir, AI_TODOS_PORT: String(port) }, stdio: 'ignore' });
  const code = await new Promise(resolve => child.on('exit', resolve));
  assert.equal(stops, 0); assert.equal(code, 0);
});
