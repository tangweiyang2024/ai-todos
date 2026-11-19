import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Store } from '../src/domain.ts';

test('slow source preparation returns immediately, survives panel closure, and is opened only by an explicit action', async t => {
  // 阻塞真实服务的外部 RPC，启动接口必须在释放之前返回；不触及个人会话或 Wiki。
  const dir = mkdtempSync(join(tmpdir(), 'experience-async-')), wiki = join(dir, 'wiki');
  mkdirSync(wiki); writeFileSync(join(wiki, 'index.md'), '# 测试索引\n');
  const sourceId = randomUUID(), threadId = randomUUID(), released = join(dir, 'released'), opened = join(dir, 'opened');
  const seed = new Store(join(dir, 'ai-todos.sqlite'));
  seed.observe({ session_id: sourceId, hook_event_name: 'Stop', cwd: dir }); seed.close();
  writeFileSync(join(dir, 'codex'), `#!${process.execPath}
import { createInterface } from 'node:readline';import { existsSync,appendFileSync } from 'node:fs';
if(process.argv.includes('proxy'))process.exit(1);
if(process.argv.includes('exec')){let input='';for await(const c of process.stdin)input+=c;appendFileSync(${JSON.stringify(join(dir, 'exec'))},JSON.stringify({args:process.argv.slice(2),input})+'\\n');console.log(JSON.stringify({type:'thread.started',thread_id:${JSON.stringify(threadId)}}));console.log(JSON.stringify({type:'turn.started'}));while(!existsSync(${JSON.stringify(join(dir,'analysis-released'))}))await new Promise(r=>setTimeout(r,20));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'fixture候选'}}));console.log(JSON.stringify({type:'turn.completed'}));process.exit(0);}

createInterface({input:process.stdin}).on('line',async line=>{const m=JSON.parse(line);appendFileSync(${JSON.stringify(join(dir, 'rpc'))},line+'\\n');if(m.id===undefined)return;let r={};
if(m.method==='model/list')r={data:[{id:'test',model:'test',displayName:'Test',supportedReasoningEfforts:[{reasoningEffort:'high',description:'High'}]}],nextCursor:null};
if(m.method==='mcpServerStatus/list')r={data:[{name:'fixture'}],nextCursor:null};
if(m.method==='thread/read')r={thread:{id:m.params.threadId}};
if(m.method==='thread/items/list'){while(!existsSync(${JSON.stringify(released)}))await new Promise(r=>setTimeout(r,20));r={data:[{turnId:'source-turn',item:{id:'evidence',type:'agentMessage',text:'完整业务证据'}}],nextCursor:null};}
if(m.method==='thread/start')r={thread:{id:${JSON.stringify(threadId)},preview:'',cwd:m.params.cwd,ephemeral:false,updatedAt:Math.floor(Date.now()/1000),status:{type:'idle'}}};
if(m.method==='thread/name/set'&&!existsSync(${JSON.stringify(join(dir, 'name-allowed'))})){console.log(JSON.stringify({id:m.id,error:{code:-32000,message:'模拟命名失败'}}));return;}
if(m.method==='thread/turns/list')r={data:[],nextCursor:null};console.log(JSON.stringify({id:m.id,result:r}));});`, { mode: 0o755 });
  writeFileSync(join(dir, 'open'), `#!${process.execPath}\nimport{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(opened)},process.argv[2]);`, { mode: 0o755 });
  const socket = createServer(); await new Promise(r => socket.listen(0, '127.0.0.1', r));
  const port = socket.address().port; await new Promise(r => socket.close(r));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [resolve(process.env.AI_TODOS_TEST_SERVER || 'src/server.ts')], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, AI_TODOS_DATA_DIR: dir, AI_TODOS_PORT: String(port), AI_TODOS_WIKI_ROOT: wiki, AI_TODOS_VAULT_ROOT: dir }, stdio: 'ignore' });
  t.after(async () => { child.kill('SIGTERM'); await new Promise(r => child.exitCode !== null ? r() : child.once('close', r)); rmSync(dir, { recursive: true, force: true }); });
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + '/health')).ok) break; } catch {} await new Promise(r => setTimeout(r, 30)); }
  const page = await fetch(origin), cookie = page.headers.get('set-cookie').split(';')[0];
  const get = () => fetch(origin + '/api/state', { headers: { cookie } }).then(r => r.json());
  const initial = await get(), headers = { cookie, origin, 'content-type': 'application/json', 'x-csrf-token': initial.csrf };
  const post = (operation, data = {}) => fetch(`${origin}/api/wiki/${operation}`, { method: 'POST', headers, body: JSON.stringify({ sessionId: sourceId, ...data }), signal: AbortSignal.timeout(operation === 'prepare_capture' ? 5000 : 10000) });
  const configPost = data => fetch(origin+'/api/wiki/set_capture_model',{method:'POST',headers,body:JSON.stringify(data)});
  assert.notEqual((await post('prepare_capture')).status,200,'没有默认模型不能自动运行');
  assert.equal((await configPost({revision:0,modelSelection:{model:'missing',reasoningEffort:null}})).status,400);
  assert.equal((await configPost({revision:0,modelSelection:{model:'test',reasoningEffort:'high'}})).status,200);
  assert.equal((await configPost({revision:0,modelSelection:{model:'test',reasoningEffort:'high'}})).status,409);
  const catalog=await (await fetch(origin+'/api/wiki/models',{method:'POST',headers,body:'{}'})).json();
  assert.equal(catalog.capturePreference.selection.model,'test');
  const requestAt = performance.now(), response = await post('prepare_capture');
  assert.equal(response.status, 200, await response.clone().text());
  const first = await response.json(); assert.equal(first.job.status, 'preparing');
  t.diagnostic(`background acceptance ${Math.round(performance.now() - requestAt)}ms with source RPC still blocked`);
  assert.equal(existsSync(released), false); assert.equal(existsSync(opened), false);
  assert.equal((await (await post('prepare_capture')).json()).job.id, first.job.id);
  assert.equal((await get()).sessions[0].experiencePreparation.status, 'preparing');
  const rt = JSON.parse(readFileSync(join(dir, 'runtime.json'), 'utf8'));
  const bridge = (operation, data = {}) => fetch(origin + '/internal/wiki', { method: 'POST', headers: { authorization: 'Bearer ' + rt.token, 'content-type': 'application/json' }, body: JSON.stringify({ uiSessionId: randomUUID(), bridgeRevision: 1, action: { operation, sessionId: sourceId, ...data } }) });
  assert.equal((await (await bridge('prepare_capture')).json()).job.id, first.job.id);

  // 后续完全不需要浏览器参与；后台完成之后提醒仍未读，也不会自行打开窗口。
  writeFileSync(released, 'yes');
  let state;
  for (let i = 0; i < 150; i++) { state = await get(); if (state.sessions[0].experiencePreparation.status === 'failed') break; await new Promise(r => setTimeout(r, 30)); }
  assert.equal(state.sessions[0].experiencePreparation.status, 'failed');
  assert.equal(state.sessions[0].experiencePreparation.retryAllowed, true);
  assert.equal(state.sessions[0].experiencePreparation.checkpoint, undefined);
  writeFileSync(join(dir, 'name-allowed'), 'yes');
  const retry = await (await post('prepare_capture')).json();
  assert.notEqual(retry.job.id, first.job.id);
  for (let i = 0; i < 150; i++) { state = await get(); if (state.sessions[0].experiencePreparation.stage === 'extracting') break; await new Promise(r => setTimeout(r,30)); }
  assert.equal(state.sessions[0].experiencePreparation.status,'preparing');
  assert.equal(existsSync(opened),false);
  writeFileSync(join(dir,'analysis-released'),'yes');
  for (let i = 0; i < 150; i++) { state = await get(); if (state.sessions[0].experiencePreparation.status === 'ready') break; await new Promise(r => setTimeout(r, 30)); }
  const job = state.sessions[0].experiencePreparation;
  assert.equal(job.status, 'ready'); assert.equal(job.unread, true); assert.equal(existsSync(opened), false);
  assert.equal(state.sessions.length, 1); assert.equal(state.sessions[0].experience.threadId, threadId);
  assert.equal((await post('ack_capture', { jobId: randomUUID() })).status, 409);
  assert.equal((await bridge('ack_capture', { jobId: job.id })).status, 200);
  assert.equal((await get()).sessions[0].experiencePreparation.unread, false);
  assert.equal((await post('open_capture')).status, 200);
  assert.equal(new URL(readFileSync(opened, 'utf8')).pathname, `/${threadId}`);
  const calls = readFileSync(join(dir, 'rpc'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(calls.filter(c => c.method === 'thread/start').length, 1);
  assert.equal(calls.filter(c => c.method === 'thread/inject_items').length, 1);
  assert.ok(!calls.some(c => c.method === 'turn/start'));
  const executions=readFileSync(join(dir,'exec'),'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(executions.length,1); assert.ok(executions[0].args.includes('test'));
  assert.equal(new URL(readFileSync(opened,'utf8')).searchParams.has('prompt'),false);
  assert.equal(readFileSync(join(wiki, 'index.md'), 'utf8'), '# 测试索引\n');
});
