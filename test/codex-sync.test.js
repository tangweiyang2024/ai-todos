import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { Store } from '../src/domain.ts';
import { codexAction } from '../src/codex.ts';

test('sync reads live host WebSocket status, refreshes unchanged observations, and falls back to history', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-todos-sync-')), oldPath = process.env.PATH;
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  let now = Date.now();
  const store = new Store(join(dir, 'check.sqlite'), () => now);
  t.after(async () => { store.close(); process.env.PATH = oldPath; for (const client of server.clients) client.terminate(); await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
  const runningId = randomUUID(), idleId = randomUUID();
  const data = [{ id: runningId, name: '运行中', status: { type: 'active', activeFlags: [] } }, { id: idleId, name: '已停止', status: { type: 'idle' } }].map(thread => ({ ...thread, preview: '', cwd: dir, ephemeral: false, updatedAt: 1791705600 }));
  const rolloutId = randomUUID(), waitingId = randomUUID(), wrongId = randomUUID(), questionId = randomUUID(), bookkeepingId = randomUUID();
  for (const id of [rolloutId, waitingId, wrongId]) {
    const path = join(dir, `${id}.jsonl`);
    const records = [{ timestamp: new Date(now).toISOString(), type: 'session_meta', payload: { id: id === wrongId ? randomUUID() : id } }, { timestamp: new Date(now).toISOString(), type: 'event_msg', payload: { type: 'task_started', turn_id: 'rollout-turn' } }, { timestamp: new Date(now).toISOString(), type: 'response_item', payload: { type: 'custom_tool_call' } }];
    writeFileSync(path, records.map(record => JSON.stringify(record)).join('\n') + '\n');
    data.push({ id, name: '桌面会话', preview: '', cwd: dir, path, ephemeral: false, updatedAt: Math.floor(now / 1000), status: { type: 'notLoaded' } });
  }
  const questionPath = join(dir, `${questionId}.jsonl`), questionCall = 'call_pending_question';
  const questionEvents = [
    { timestamp: new Date(now).toISOString(), type: 'session_meta', payload: { id: questionId } },
    { timestamp: new Date(now).toISOString(), type: 'event_msg', payload: { type: 'task_started', turn_id: 'question-turn' } },
    { timestamp: new Date(now).toISOString(), type: 'response_item', payload: { type: 'function_call', name: 'request_user_input_async', call_id: questionCall, arguments: JSON.stringify({ questions: [{ title: 'One' }, { title: 'Two' }] }) } },
    { timestamp: new Date(now).toISOString(), type: 'response_item', payload: { type: 'function_call_output', call_id: questionCall, output: JSON.stringify({ accepted: true }) } },
    { timestamp: new Date(now).toISOString(), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '普通补充消息' }] } },
    { timestamp: new Date(now).toISOString(), type: 'response_item', payload: { type: 'custom_tool_call', name: 'exec', call_id: 'different-tool' } },
  ];
  writeFileSync(questionPath, questionEvents.map(event => JSON.stringify(event)).join('\n') + '\n');
  data.push({ id: questionId, name: '等待用户输入', preview: '', cwd: dir, path: questionPath, ephemeral: false, updatedAt: Math.floor(now / 1000), status: { type: 'notLoaded' } });
  const older = new Date(now - 360000).toISOString();
  const bookkeepingPath = join(dir, `${bookkeepingId}.jsonl`);
  writeFileSync(bookkeepingPath, [
    { timestamp: older, type: 'session_meta', payload: { id: bookkeepingId } },
    { timestamp: older, type: 'event_msg', payload: { type: 'task_started', turn_id: 'quiet-turn' } },
    { timestamp: new Date(now).toISOString(), type: 'event_msg', payload: { type: 'token_count' } },
  ].map(event => JSON.stringify(event)).join('\n') + '\n');
  data.push({ id: bookkeepingId, name: '无新活动', preview: '', cwd: dir, path: bookkeepingPath, ephemeral: false, updatedAt: Math.floor(now / 1000), status: { type: 'notLoaded' } });
  store.observe({ session_id: waitingId, hook_event_name: 'PermissionRequest', cwd: dir, turn_id: 'rollout-turn' });
  const requests = [];
  server.on('connection', socket => socket.on('message', raw => {
    const message = JSON.parse(raw.toString()); requests.push(message);
    if (message.id !== undefined) socket.send(JSON.stringify({ id: message.id, result: message.method === 'thread/list' ? { data, nextCursor: null } : {} }));
  }));
  writeFileSync(join(dir, 'codex'), `#!${process.execPath}
import { connect } from 'node:net';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
if (process.argv.includes('proxy')) {
  if (existsSync(${JSON.stringify(join(dir, 'host-unavailable'))})) process.exit(1);
  const socket = connect(${server.address().port}, '127.0.0.1');
  process.stdin.pipe(socket); socket.pipe(process.stdout);
} else {
  createInterface({ input: process.stdin }).on('line', line => {
    const message = JSON.parse(line);
    if (message.id !== undefined) console.log(JSON.stringify({ id: message.id, result: message.method === 'thread/list' ? { data: ${JSON.stringify(data)}, nextCursor: null } : {} }));
  });
}
`, { mode: 0o755 });
  process.env.PATH = `${dir}:${oldPath}`;
  assert.equal((await codexAction(store, { operation: 'sync_threads' })).transport, 'host');
  assert.equal(store.sessions().find(session => session.id === runningId).state, 'running');
  assert.equal(store.sessions().find(session => session.id === idleId).state, 'idle');
  assert.equal(store.sessions().find(session => session.id === rolloutId).state, 'running');
  assert.equal(store.sessions().find(session => session.id === rolloutId).source, 'codex-rollout');
  assert.equal(store.sessions().find(session => session.id === waitingId).state, 'waiting_approval');
  assert.equal(store.sessions().find(session => session.id === wrongId).state, 'unknown');
  assert.equal(store.sessions().find(session => session.id === bookkeepingId).stateConfidence, 'last_observed');
  const pendingQuestion = store.sessions().find(session => session.id === questionId);
  assert.equal(pendingQuestion.state, 'waiting_input');
  assert.equal(pendingQuestion.event, 'request_user_input_async');
  assert.equal(JSON.stringify(pendingQuestion).includes('普通补充消息'), false);
  now += 360000;
  await codexAction(store, { operation: 'sync_threads' });
  assert.equal(store.sessions().find(session => session.id === questionId).state, 'waiting_input');
  const reply = index => ({ timestamp: new Date(now).toISOString(), type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `<send_user_message_question_reply>${JSON.stringify([{ questionItemId: JSON.stringify(['request_user_input_async', questionCall, index]), answer: 'ok' }])}</send_user_message_question_reply>` }] } });
  appendFileSync(questionPath, JSON.stringify(reply(0)) + '\n');
  await codexAction(store, { operation: 'sync_threads' });
  assert.equal(store.sessions().find(session => session.id === questionId).state, 'waiting_input');
  appendFileSync(questionPath, JSON.stringify(reply(1)) + '\n');
  await codexAction(store, { operation: 'sync_threads' });
  assert.equal(store.sessions().find(session => session.id === questionId).state, 'running');
  now += 360000;
  assert.equal(store.sessions().find(session => session.id === runningId).state, 'unknown');
  await codexAction(store, { operation: 'sync_threads' });
  assert.equal(store.sessions().find(session => session.id === runningId).state, 'running');
  assert.equal(store.sessions().find(session => session.id === runningId).observedAt, new Date(now).toISOString());
  assert.equal(store.sessions().find(session => session.id === rolloutId).state, 'running');
  assert.equal(store.sessions().find(session => session.id === rolloutId).stateConfidence, 'last_observed');
  // A terminal record can be older than the recent-thread window after a disconnect.
  data.find(thread => thread.id === rolloutId).updatedAt = Math.floor(Date.now() / 1000) - 600;
  appendFileSync(join(dir, `${rolloutId}.jsonl`), JSON.stringify({ timestamp: new Date(now).toISOString(), type: 'event_msg', payload: { type: 'task_complete', turn_id: 'rollout-turn' } }) + '\n');
  await codexAction(store, { operation: 'sync_threads' });
  assert.equal(store.sessions().find(session => session.id === rolloutId).state, 'idle');
  assert.equal(store.sessions().find(session => session.id === rolloutId).confirmedAt, undefined);
  const stopped = store.sessions().find(session => session.id === rolloutId);
  store.confirmSession({ id: stopped.id, observedAt: stopped.observedAt, event: stopped.event, turnId: stopped.turnId, catalogUpdatedAt: stopped.catalogUpdatedAt, confirmed: true });
  data.find(thread => thread.id === rolloutId).updatedAt = Math.floor(Date.now() / 1000);
  appendFileSync(join(dir, `${rolloutId}.jsonl`), ['task_started', 'task_complete'].map(type => JSON.stringify({ timestamp: new Date(now).toISOString(), type: 'event_msg', payload: { type, turn_id: 'new-rollout-turn' } })).join('\n') + '\n');
  await codexAction(store, { operation: 'sync_threads' });
  assert.equal(store.sessions().find(session => session.id === rolloutId).confirmedAt, undefined);
  assert.equal(store.all('task').length, 0);
  assert.ok(!requests.some(message => message.method === 'turn/start'));
  const observedAt = store.sessions().find(session => session.id === runningId).observedAt;
  writeFileSync(join(dir, 'host-unavailable'), ''); now += 360000;
  assert.equal((await codexAction(store, { operation: 'sync_threads' })).transport, 'history');
  assert.equal(store.sessions().find(session => session.id === runningId).state, 'unknown');
  assert.equal(store.sessions().find(session => session.id === runningId).observedAt, observedAt);
});
