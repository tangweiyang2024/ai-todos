import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/domain.ts';
import { runExperienceExtraction } from '../src/experience-native-run.ts';

function fixture(t, events, exitCode = 0) {
  const dir = mkdtempSync(join(tmpdir(), 'native-capture-'));
  const store = new Store(join(dir, 'db')), sourceId = randomUUID(), threadId = randomUUID();
  const chat = { sourceId, threadId, title: 'fixture', createdAt: store.at(), sourcePath: join(dir, 'source'), sourceHash: 'hash', contextPath: join(dir, 'task.md'), progressPath: join(dir, 'progress.json'), wikiRoot: join(dir, 'wiki'), vaultRoot: dir };
  writeFileSync(chat.contextPath, 'fixture');
  writeFileSync(join(dir, 'codex'), `#!${process.execPath}\nimport{writeFileSync}from'node:fs';let input='';for await(const c of process.stdin)input+=c;writeFileSync(${JSON.stringify(join(dir, 'invocation'))},JSON.stringify({args:process.argv.slice(2),input}));for(const event of ${JSON.stringify(events(threadId))})console.log(JSON.stringify(event));process.exitCode=${exitCode};`, { mode: 0o755 });
  const oldPath = process.env.PATH; process.env.PATH = `${dir}:${oldPath}`;
  t.after(() => { process.env.PATH = oldPath; store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { store, chat, dir, selection: { model: 'fixture-model', reasoningEffort: 'high' } };
}
const success = id => [{type:'thread.started',thread_id:id},{type:'turn.started'},{type:'item.completed',item:{type:'agent_message',text:'经验候选，等待审核'}},{type:'turn.completed'}];

test('native first extraction submits selected model once, completes before review and disables external writes', async t => {
  const {store,chat,dir,selection} = fixture(t, success);
  await runExperienceExtraction(store, chat, selection, { disabledMcpServers: ['example-service'] });
  const sent = JSON.parse(readFileSync(join(dir,'invocation'),'utf8'));
  assert.ok(sent.args.includes('resume')); assert.ok(sent.args.includes(chat.threadId));
  assert.equal(sent.args[sent.args.indexOf('--sandbox')+1], 'read-only');
  assert.equal(sent.args[sent.args.indexOf('--model')+1], selection.model);
  assert.ok(sent.args.includes('model_reasoning_effort="high"'));
  assert.ok(sent.args.includes('mcp_servers.example-service.enabled=false'));
  assert.ok(sent.input.includes(chat.contextPath)); assert.ok(sent.input.includes('不得写入'));
  assert.equal(store.meta(`experience.initial.${chat.threadId}`, null).status, 'completed');
  assert.equal(JSON.parse(readFileSync(chat.progressPath,'utf8')).stage, 'reviewing');
  writeFileSync(join(dir,'invocation'),'unchanged');
  await runExperienceExtraction(store,chat,selection,{});
  assert.equal(readFileSync(join(dir,'invocation'),'utf8'),'unchanged');
});

test('dispatch uncertainty survives restart and cannot submit a second initial turn', async t => {
  const {store,chat,selection} = fixture(t, success);
  store.setMeta(`experience.initial.${chat.threadId}`, {status:'dispatching',modelSelection:selection});
  await assert.rejects(runExperienceExtraction(store,chat,selection,{}), /原会话|核对/);
});

test('a failed or mismatched native turn never produces a ready review report', async t => {
  const {store,chat,selection} = fixture(t, () => success(randomUUID()));
  await assert.rejects(runExperienceExtraction(store,chat,selection,{}), /会话/);
  assert.notEqual(store.meta(`experience.initial.${chat.threadId}`,null).status,'completed');
});

test('a native failed turn or empty successful process never announces candidates ready', async t => {
  const {store,chat,selection} = fixture(t, id => [{type:'thread.started',thread_id:id},{type:'turn.started'},{type:'turn.failed',error:{message:'fixture failure'}}]);
  await assert.rejects(runExperienceExtraction(store,chat,selection,{}), /失败/);
  assert.equal(store.meta(`experience.initial.${chat.threadId}`,null).status,'failed');
});

test('cancellation stops the native process and preserves an inspectable non-retryable dispatch', async t => {
  const {store,chat,selection,dir} = fixture(t, success);
  writeFileSync(join(dir,'codex'), `#!${process.execPath}\nconsole.log(JSON.stringify({type:'thread.started',thread_id:${JSON.stringify(chat.threadId)}}));console.log(JSON.stringify({type:'turn.started'}));setInterval(()=>{},1000);`, {mode:0o755});
  const controller = new AbortController();
  const pending = runExperienceExtraction(store,chat,selection,{signal:controller.signal});
  for(let i=0;i<100;i++) { if(store.meta(`experience.initial.${chat.threadId}`,null)?.status==='running') break; await new Promise(r=>setTimeout(r,10)); }
  assert.equal(store.meta(`experience.initial.${chat.threadId}`,null).status,'running');
  controller.abort(); await assert.rejects(pending,/中断/);
  await assert.rejects(runExperienceExtraction(store,chat,selection,{}),/核对/);
});

test('unsupported MCP config paths fail before dispatch rather than leaving an enabled external tool', async t => {
  const {store,chat,selection}=fixture(t,success);
  await assert.rejects(runExperienceExtraction(store,chat,selection,{disabledMcpServers:['example.service']}),/MCP 名称/);
  assert.equal(store.meta(`experience.initial.${chat.threadId}`,null),null);
});

test('a process exiting successfully without a completed agent response is not a ready result', async t => {
  const {store,chat,selection}=fixture(t,id=>[{type:'thread.started',thread_id:id},{type:'turn.started'},{type:'turn.completed'}]);
  await assert.rejects(runExperienceExtraction(store,chat,selection,{}),/完整/);
  assert.equal(store.meta(`experience.initial.${chat.threadId}`,null).status,'failed');
});
