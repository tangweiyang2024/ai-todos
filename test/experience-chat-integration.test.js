import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { Store } from '../src/domain.ts';

test('browser and stable MCP bridge hand off to one chat, and trusted hooks project progress without running an agent',async t=>{
  // 服务与打开器完全隔离；使用正式入口和 hook，不调用真实模型或个人 Wiki。
  const dir=mkdtempSync(join(tmpdir(),'experience-api-')),root=join(dir,'wiki'),sourceId=randomUUID(),threadId=randomUUID();
  mkdirSync(root);writeFileSync(join(root,'index.md'),'# 测试索引\n');
  const seeded=new Store(join(dir,'ai-todos.sqlite'));seeded.observe({session_id:sourceId,hook_event_name:'Stop',cwd:dir});seeded.close();
  writeFileSync(join(dir,'codex'),`#!${process.execPath}\nimport{createInterface}from'node:readline';import{appendFileSync}from'node:fs';
if(process.argv.includes('proxy'))process.exit(1);
createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);appendFileSync(${JSON.stringify(join(dir,'rpc'))},line+'\\n');if(m.id===undefined)return;let r={};
if(m.method==='thread/read')r={thread:{id:m.params.threadId}};
if(m.method==='thread/items/list')r={data:[{turnId:'t',item:{id:'i',type:'agentMessage',text:'具体原文'}}],nextCursor:null};
if(m.method==='thread/start')r={thread:{id:${JSON.stringify(threadId)},preview:'',cwd:m.params.cwd,ephemeral:false,updatedAt:Math.floor(Date.now()/1000),status:{type:'idle'}}};
if(m.method==='thread/turns/list')r={data:[],nextCursor:null};
console.log(JSON.stringify({id:m.id,result:r}));});`,{mode:0o755});
  writeFileSync(join(dir,'open'),`#!${process.execPath}\nimport{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(join(dir,'opened'))},process.argv[2]);`,{mode:0o755});
  const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
  const origin=`http://127.0.0.1:${port}`,env={...process.env,PATH:`${dir}:${process.env.PATH}`,AI_TODOS_DATA_DIR:dir,AI_TODOS_PORT:String(port),AI_TODOS_WIKI_ROOT:root,AI_TODOS_VAULT_ROOT:dir};
  const child=spawn(process.execPath,[resolve(process.env.AI_TODOS_TEST_SERVER||'src/server.ts')],{env,stdio:'ignore'});
  t.after(async()=>{child.kill('SIGTERM');await new Promise(r=>child.exitCode!==null?r():child.once('close',r));rmSync(dir,{recursive:true,force:true});});
  for(let i=0;i<100;i++){try{if((await fetch(origin+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,30));}
  const page=await fetch(origin),cookie=page.headers.get('set-cookie').split(';')[0];const get=()=>fetch(origin+'/api/state',{headers:{cookie}}).then(r=>r.json());const initial=await get();
  const headers={cookie,origin,'content-type':'application/json','x-csrf-token':initial.csrf};
  const post=()=>fetch(origin+'/api/wiki/open_capture',{method:'POST',headers,body:JSON.stringify({sessionId:sourceId})});
  assert.equal((await fetch(origin+'/api/wiki/open_capture',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({sessionId:sourceId})})).status,403);

  // 重复入口共用聊天，提示词已预填但未生成模型轮次，旧审核器也没有参与。
  const pair=await Promise.all([post(),post()]);assert.ok(pair.every(r=>r.status===200));const [one,two]=await Promise.all(pair.map(r=>r.json()));assert.equal(one.chat.threadId,two.chat.threadId);
  let state=await get();assert.equal(state.sessions.length,1);assert.equal(state.sessions[0].experience.status,'ready');assert.equal(state.tasks.length,0);
  const rt=JSON.parse(readFileSync(join(dir,'runtime.json'),'utf8'));
  const bridge=await fetch(origin+'/internal/wiki',{method:'POST',headers:{authorization:'Bearer '+rt.token,'content-type':'application/json'},body:JSON.stringify({uiSessionId:randomUUID(),bridgeRevision:1,action:{operation:'open_capture',sessionId:sourceId}})});assert.equal(bridge.status,200);
  const calls=readFileSync(join(dir,'rpc'),'utf8').trim().split('\n').map(JSON.parse);assert.equal(calls.filter(c=>c.method==='thread/start').length,1);assert.ok(!calls.some(c=>c.method==='turn/start'));assert.equal(new URL(readFileSync(join(dir,'opened'),'utf8')).hostname,'threads');

  // 真实 hook 回报原生状态，明确阶段由会话文件回报，均只显示在源卡片。
  const hook=event=>spawnSync(process.execPath,[resolve(process.env.AI_TODOS_TEST_HOOK||'hooks/observe.ts')],{env,input:JSON.stringify({session_id:threadId,hook_event_name:event,cwd:dir,turn_id:'native-turn'}),encoding:'utf8'});
  const started=hook('UserPromptSubmit');assert.equal(started.status,0,started.stderr);assert.match(started.stdout,/经验沉淀聊天/);assert.doesNotMatch(started.stdout,/可用 ai_todos_snapshot 查询后绑定原任务/);
  state=await get();assert.equal(state.sessions[0].experience.status,'running');
  hook('Stop');state=await get();assert.equal(state.sessions[0].experience.status,'paused');
  writeFileSync(one.chat.progressPath,JSON.stringify({version:1,sourceId,threadId,stage:'awaiting_approval',summary:'等待用户批准 diff',updatedAt:new Date().toISOString()}));
  state=await get();assert.equal(state.sessions.length,1);assert.equal(state.sessions[0].experience.status,'waiting');assert.equal(state.sessions[0].experience.summary,'等待用户批准 diff');
  assert.equal(readFileSync(join(root,'index.md'),'utf8'),'# 测试索引\n');
});
