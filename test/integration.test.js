import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawnSync } from 'node:child_process';

async function freePort() { const s = createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p; }

test('real STDIO tools/resource, local daemon, browser security, reviewed revision, packaged entry and trusted hook', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-todos-integration-')); const port = await freePort(); const origin = `http://127.0.0.1:${port}`;
  const sessionId = randomUUID();
  const thread = { id: sessionId, name: '宿主创建的会话', preview: '', cwd: '/tmp/check', ephemeral: false, updatedAt: Math.floor(Date.now() / 1000), status: { type: 'notLoaded' } };
  writeFileSync(join(dir, 'codex'), `#!${process.execPath}\nimport { createInterface } from 'node:readline';
createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line);
  if (message.id !== undefined) console.log(JSON.stringify({ id: message.id, result: message.method === 'thread/list' ? { data: [${JSON.stringify(thread)}], nextCursor: null } : {} }));
});\n`, { mode: 0o755 });
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, AI_TODOS_DATA_DIR: dir, AI_TODOS_PORT: String(port) };
  const oldToken = randomUUID(); let oldStopped = false;
  const oldService = createHttpServer((req, res) => {
    if (req.url === '/health') { res.end(JSON.stringify({ name: 'ai-todos', version: '0.1.3' })); return; }
    if (req.headers.authorization !== `Bearer ${oldToken}`) { res.writeHead(401); res.end(); return; }
    if (req.url === '/internal/ping') { res.end(JSON.stringify({ ok: true })); return; }
    if (req.url === '/internal/stop') { oldStopped = true; res.setHeader('connection', 'close'); res.end(JSON.stringify({ ok: true })); oldService.close(); oldService.closeIdleConnections(); return; }
    res.writeHead(404); res.end();
  });
  await new Promise(resolve => oldService.listen(port, '127.0.0.1', resolve));
  t.after(() => oldService.close());
  writeFileSync(join(dir, 'runtime.json'), JSON.stringify({ origin, token: oldToken }));
  const client = new Client({ name: 'integration-check', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('src/mcp.ts')], env, stderr: 'pipe' });
  let stderr = ''; transport.stderr?.on('data', d => { stderr += d; });
  t.after(async () => {
    await client.close();
    try { const r = JSON.parse(readFileSync(join(dir, 'runtime.json'), 'utf8')); await fetch(`${origin}/internal/stop`, { method: 'POST', headers: { authorization: `Bearer ${r.token}` } }); } catch {}
    await new Promise(r => setTimeout(r, 100)); rmSync(dir, { recursive: true, force: true });
  });
  await client.connect(transport);
  assert.equal(oldStopped, true);
  assert.equal((await fetch(`${origin}/health`).then(response => response.json())).version, JSON.parse(readFileSync('package.json', 'utf8')).version);
  const tools = await client.listTools(); assert.equal(tools.tools.length, 8);
  assert.equal(tools.tools.find(tool => tool.name === 'ai_todos_snapshot').inputSchema.properties.syncThreads.type, 'boolean');
  assert.deepEqual(tools.tools.find(tool => tool.name === 'ai_todos_confirm_session')._meta.ui.visibility, ['app']);
  assert.deepEqual(tools.tools.find(tool => tool.name === 'ai_todos_complete_task')._meta.ui.visibility, ['app']);
  assert.ok(!tools.tools.some(t => /accept|review/.test(t.name)));
  const open = tools.tools.find(t => t.name === 'ai_todos_open'); assert.deepEqual(open._meta['openai/ui'].entrypoints, [{ type: 'global' }, { type: 'thread' }]);
  const resources = await client.listResources(); assert.equal(resources.resources[0].uri, 'ui://ai-todos/app.html');
  const resource = await client.readResource({ uri: 'ui://ai-todos/app.html' }); assert.equal(resource.contents[0].mimeType, 'text/html;profile=mcp-app'); assert.ok(resource.contents[0].text.includes(origin));
  assert.deepEqual(resource.contents[0]._meta['openai/ui'].availableDisplayModes, ['inline', 'fullscreen']);
  const opened = await client.callTool({ name: 'ai_todos_open', arguments: {} }); assert.equal(opened.structuredContent.browserUrl, origin); assert.equal(opened.structuredContent.tasks, undefined);
  const command = async c => {
    const result = await client.callTool({ name: 'ai_todos_manage', arguments: { command: c } });
    assert.ok(!result.isError, result.content?.[0]?.text); return result.structuredContent;
  };
  let task = await command({ action: 'create', kind: 'task', requestId: randomUUID(), data: { title: '协议检查', criteria: '有实际证据' } });
  const staleCommand = await client.callTool({ name: 'ai_todos_manage', arguments: { command: { action: 'update', kind: 'task', id: task.id, revision: task.revision + 1, data: { title: '不可覆盖' } } } });
  assert.equal(staleCommand.isError, true);
  assert.equal(staleCommand.structuredContent.code, 'errors.staleRevision');
  assert.match(staleCommand.content[0].text, /数据已更新/);
  const workspace = await client.callTool({ name: 'ai_todos_workspace', arguments: {} });
  assert.ok(!workspace.isError);
  assert.equal(workspace.structuredContent.tasks[0].id, task.id);
  assert.ok(workspace.content[0].text.length < 100);
  const full = await client.callTool({ name: 'ai_todos_snapshot', arguments: {} });
  assert.deepEqual(workspace.structuredContent.tasks, full.structuredContent.tasks);
  assert.deepEqual(workspace.structuredContent.sessions, full.structuredContent.sessions);
  const synced = await client.callTool({ name: 'ai_todos_snapshot', arguments: { syncThreads: true } });
  assert.ok(!synced.isError, synced.content?.[0]?.text);
  assert.equal(synced.structuredContent.sessions.find(session => session.id === sessionId).title, thread.name);
  const hook = spawnSync(process.execPath, ['hooks/observe.ts'], { env, input: JSON.stringify({ session_id: sessionId, hook_event_name: 'UserPromptSubmit', cwd: '/tmp/check', turn_id: 'test-turn' }), encoding: 'utf8' });
  assert.equal(hook.status, 0); assert.ok(JSON.parse(hook.stdout).hookSpecificOutput.additionalContext.includes(sessionId));
  assert.ok(!JSON.parse(hook.stdout).hookSpecificOutput.additionalContext.includes(task.id));
  task = await command({ action: 'bind', id: task.id, revision: task.revision, sessionId });
  for (const path of ['hooks/observe.ts', 'plugins/ai-todos/hooks/observe.js']) {
    for (const event of ['SessionStart', 'UserPromptSubmit']) {
      const boundHook = spawnSync(process.execPath, [path], { env, input: JSON.stringify({ session_id: sessionId, hook_event_name: event, cwd: '/tmp/check', turn_id: 'test-turn' }), encoding: 'utf8' });
      assert.equal(boundHook.status, 0);
      const context = JSON.parse(boundHook.stdout).hookSpecificOutput.additionalContext;
      assert.ok(context.includes(sessionId)); assert.ok(context.includes(`taskId=${task.id}`));
      assert.match(context, /ai_todos_task.*复用已有绑定/);
      assert.ok(!context.includes(task.title)); assert.ok(!context.includes(task.criteria));
    }
  }
  assert.equal((await client.callTool({ name: 'ai_todos_task', arguments: { id: task.id } })).structuredContent.task.revision, task.revision);
  task = await command({ action: 'transition', id: task.id, revision: task.revision, state: 'ready' });
  task = await command({ action: 'transition', id: task.id, revision: task.revision, state: 'executing' });
  task = await command({ action: 'submit', id: task.id, revision: task.revision, summary: '协议真实调用成功', evidence: [{ label: '测试证据', uri: '/tmp/check.txt' }] });
  assert.equal((await client.callTool({ name: 'ai_todos_task', arguments: { id: task.id } })).structuredContent.task.state, 'awaiting_acceptance');
  const page = await fetch(origin); const cookie = page.headers.get('set-cookie').split(';')[0];
  assert.match(page.headers.get('content-security-policy'), /script-src 'sha256-/); assert.match(await page.text(), /<title>Todos<\/title>/);
  assert.equal((await fetch(`${origin}/api/state`)).status, 401);
  assert.equal((await fetch(`${origin}/api/state`, { headers: { cookie, origin: 'https://evil.example' } })).status, 403);
  const snapshot = await (await fetch(`${origin}/api/state`, { headers: { cookie } })).json();
  const headers = { cookie, origin, 'x-csrf-token': snapshot.csrf, 'content-type': 'application/json' };
  const post = async (path, input) => fetch(`${origin}/api/${path}`, { method: 'POST', headers, body: JSON.stringify(input) });
  const staleResponse = await post('command', { action: 'update', kind: 'task', id: task.id, revision: task.revision + 1, data: { title: '不可覆盖' } });
  assert.equal(staleResponse.status, 409);
  assert.equal((await staleResponse.json()).code, 'errors.staleRevision');
  const invalidSettings = await post('command', { action: 'settings', revision: snapshot.settings.revision, data: { reminders: true, followUpMinutes: 0, reviewTime: null, timezone: 'Invalid/TimeZone' } });
  assert.equal(invalidSettings.status, 400);
  const validation = await invalidSettings.json();
  assert.match(validation.messages.en, /Invalid time zone/);
  assert.match(validation.messages['zh-CN'], /时区无效/);
  assert.equal((await fetch(`${origin}/api/command`, { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await fetch(`${origin}/internal/state`)).status, 401);
  const manual = await command({ action: 'create', kind: 'task', requestId: randomUUID(), data: { title: '空白标准人工完成' } });
  const completion = { id: manual.id, revision: manual.revision, confirmed: true };
  assert.equal((await fetch(`${origin}/api/task-complete`, { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify(completion) })).status, 403);
  assert.equal((await post('task-complete', { ...completion, confirmed: false })).status, 400);
  assert.equal((await post('task-complete', { ...completion, revision: completion.revision + 1 })).status, 409);
  const completed = await post('task-complete', completion);
  assert.equal(completed.status, 200);
  assert.equal((await completed.json()).state, 'accepted');
  assert.equal((await post('task-complete', completion)).status, 409);
  const ticket = await (await post('review-ticket', { id: task.id, revision: task.revision })).json();
  assert.ok(ticket.ticket); const input = { ticket: ticket.ticket, id: task.id, revision: task.revision, decision: 'reject', confirmed: true, reviewer: 'Test human fixture', note: '验证退回' };
  assert.equal((await post('review', { ...input, note: '' })).status, 400);
  const accepted = await post('review', input); assert.equal(accepted.status, 200); task = await accepted.json();
  assert.equal((await post('review', input)).status, 409);
  task = await command({ action: 'transition', id: task.id, revision: task.revision, state: 'executing' });
  task = await command({ action: 'submit', id: task.id, revision: task.revision, summary: '修订交付', evidence: [{ label: '证据', uri: '/tmp/check.txt' }] });
  assert.equal((await post('review-ticket', { id: task.id, revision: ticket.task.revision })).status, 409);
  const packaged = new Client({ name: 'packaged-entry-check', version: '1' });
  await packaged.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('plugins/ai-todos/src/mcp.js')], env, stderr: 'pipe' }));
  try { const result = await packaged.callTool({ name: 'ai_todos_snapshot', arguments: {} }); assert.equal(result.structuredContent.tasks.find(item => item.id === task.id).state, task.state); } finally { await packaged.close(); }
  assert.doesNotMatch(stderr, /TypeError|SyntaxError|ReferenceError/);
});
