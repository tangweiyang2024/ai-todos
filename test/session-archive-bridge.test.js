import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Store, sessionConfirmSchema } from '../src/domain.ts';

test('the stable app bridge archives interrupted sessions even when the old confirmation tool rejects archive', async t => {
  // 真实 MCP、服务和 SQLite 使用隔离数据；普通旧工具仍保留原有严格边界。
  const dir = mkdtempSync(join(tmpdir(), 'archive-bridge-')), id = randomUUID(), store = new Store(join(dir, 'ai-todos.sqlite'));
  store.observe({ session_id: id, hook_event_name: 'Interrupt', cwd: dir, turn_id: 'interrupted-turn' });
  const task = store.create('task', { title: '绑定任务不可被自动验收' });
  store.command({ action: 'bind', id: task.id, revision: task.revision, sessionId: id });
  const s = store.sessions()[0], input = { id, observedAt: s.observedAt, event: s.event, turnId: s.turnId ?? null, catalogUpdatedAt: s.catalogUpdatedAt ?? null, confirmed: true, archive: true };
  store.close();
  assert.equal(sessionConfirmSchema.omit({ archive: true }).safeParse(input).success, false);
  const socket = createServer(); await new Promise(r => socket.listen(0, '127.0.0.1', r)); const port = socket.address().port; await new Promise(r => socket.close(r));
  const client = new Client({ name: 'archive-bridge-test', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve(process.env.AI_TODOS_TEST_MCP || 'src/mcp.ts')], env: { ...process.env, AI_TODOS_DATA_DIR: dir, AI_TODOS_PORT: String(port) }, stderr: 'ignore' }));
  t.after(async () => {
    const rt = JSON.parse(readFileSync(join(dir, 'runtime.json'), 'utf8'));
    await fetch(rt.origin + '/internal/stop', { method: 'POST', headers: { authorization: 'Bearer ' + rt.token } });
    await client.close(); rmSync(dir, { recursive: true, force: true });
  });

  // 新动作放入既有稳定信封；只改变会话展示，不放宽任务验收和版本校验。
  const call = confirmation => client.callTool({ name: 'ai_todos_wiki', arguments: { uiSessionId: randomUUID(), action: { operation: 'archive_session', confirmation } } });
  const result = await call(input);
  assert.ok(!result.isError, JSON.stringify(result.structuredContent));
  assert.equal(result.structuredContent.archiveConfirmed, true);
  const stale = await call({ ...input, observedAt: '2000-01-01T00:00:00.000Z' });
  assert.equal(stale.isError, true); assert.equal(stale.structuredContent.code, 'errors.staleSession');
  const invalid = await call({ ...input, archive: undefined }); assert.equal(invalid.isError, true);
  const check = new Store(join(dir, 'ai-todos.sqlite'));
  try { assert.equal(check.get('task', task.id).state, task.state); assert.equal(check.sessions()[0].archiveConfirmed, true); }
  finally { check.close(); }
});
