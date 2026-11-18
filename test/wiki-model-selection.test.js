import { nativeReadLoopSource } from './fixtures/native-read-loop.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { Store } from '../src/domain.ts';

test('selected model and effort reach every stage, remain pinned during comparison, and never silently fall back', async t => {
  // 准备隔离服务和可记录模型参数的替身，测试不得使用个人 Wiki。
  const dir=mkdtempSync(join(tmpdir(),'wiki-model-api-')), root=join(dir,'wiki'), sessionId=randomUUID();
  mkdirSync(root);writeFileSync(join(root,'index.md'),'# Index\n');writeFileSync(join(root,'log.md'),'# Log\n');
  const store=new Store(join(dir,'ai-todos.sqlite'));store.observe({session_id:sessionId,hook_event_name:'Stop',cwd:dir,turn_id:'t'});store.close();
  const catalog=[{id:'a',model:'model-a',displayName:'Model A',defaultReasoningEffort:'medium',supportedReasoningEfforts:[{reasoningEffort:'medium',description:''},{reasoningEffort:'high',description:''}],isDefault:true},{id:'b',model:'model-b',displayName:'Model B',defaultReasoningEffort:'low',supportedReasoningEfforts:[{reasoningEffort:'low',description:''}],isDefault:false}];
  writeFileSync(join(dir,'codex'),`#!${process.execPath}\nimport {createInterface} from 'node:readline';import {appendFileSync,existsSync} from 'node:fs';
if(process.argv.includes('proxy'))process.exit(1);
${nativeReadLoopSource('analysis',undefined,false)}

const catalog=${JSON.stringify(catalog)};createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(nativeReply(m))return;if(m.id===undefined)return;appendFileSync(${JSON.stringify(join(dir,'rpc.jsonl'))},JSON.stringify(m)+'\\n');let r={};
if(m.method==='model/list'){if(existsSync(${JSON.stringify(join(dir,'slow-catalog'))})){setTimeout(()=>console.log(JSON.stringify({id:m.id,result:{data:catalog,nextCursor:null}})),1000);return;}r={data:catalog,nextCursor:null};}
if(m.method==='thread/read')r={thread:{id:m.params.threadId}};
if(m.method==='thread/items/list')r={data:[{turnId:'t',item:{id:'i',type:'agentMessage',text:'具体业务规则：状态为 frozen 时拒绝重复扣减，已验证。'}}],nextCursor:null};
if(m.method==='mcpServerStatus/list')r={data:[],nextCursor:null};
if(m.method==='thread/start')r={thread:{id:'analysis'},model:existsSync(${JSON.stringify(join(dir,'wrong-model'))})?'wrong-model':m.params.model,reasoningEffort:m.params.config?.model_reasoning_effort};
if(m.method==='turn/start'){if(existsSync(${JSON.stringify(join(dir,'stuck-comparison'))})&&!m.params.outputSchema.properties.sessionSummary){console.log(JSON.stringify({id:m.id,result:{turn:{id:'stuck-turn'}}}));return;}const p=m.params.outputSchema.properties;const value=p.supported?{supported:true,explanation:'支持'}:p.paths?{paths:[],humanPaths:[]}:p.sessionSummary?{sessionSummary:'检查冻结状态的重复扣减规则。',items:[{title:'冻结状态拒绝重复扣减',conclusion:'frozen 时拒绝重复扣减',scope:'业务规则',evidence:'t/i',unverified:''}]}:{summary:'无变更',scope:'规则',evidence:'t/i',unverified:'',relation:'无相关页',changes:[],newNotes:[]};nativeStart(m,value);return;}console.log(JSON.stringify({id:m.id,result:r}));});`,{mode:0o755});
  const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
  const origin=`http://127.0.0.1:${port}`, child=spawn(process.execPath,[resolve(process.env.AI_TODOS_TEST_SERVER || 'src/server.ts')],{env:{...process.env,PATH:`${dir}:${process.env.PATH}`,AI_TODOS_DATA_DIR:dir,AI_TODOS_WIKI_ROOT:root,AI_TODOS_VAULT_ROOT:dir,AI_TODOS_PORT:String(port)},stdio:'ignore'});
  t.after(()=>{child.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});});
  for(let i=0;i<100;i++){try{if((await fetch(origin+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,40));}
  const page=await fetch(origin),cookie=page.headers.get('set-cookie').split(';')[0],state=await(await fetch(origin+'/api/state',{headers:{cookie}})).json();
  const post=async(operation,data={})=>{const res=await fetch(origin+'/api/wiki/'+operation,{method:'POST',headers:{cookie,origin,'content-type':'application/json','x-csrf-token':state.csrf},body:JSON.stringify(data)});return{status:res.status,body:await res.json()};};
  const waitJob=async()=>{for(let i=0;i<150;i++){const{body}=await post('progress',{sessionId});if(body.job?.status!=='running')return body.job;await new Promise(r=>setTimeout(r,30));}assert.fail('job did not finish');};

  // 目录来自真实桥接响应；拒绝目录以外模型及该模型不支持的推理强度。
  assert.notEqual((await post('start',{sessionId})).status,200);
  const models=await post('models');assert.equal(models.status,200,JSON.stringify(models.body));assert.equal(models.body.models.length,2);
  const a={model:'model-a',reasoningEffort:'high'},b={model:'model-b',reasoningEffort:'low'};
  assert.notEqual((await post('start',{sessionId,modelSelection:{...a,model:'missing'}})).status,200);
  assert.notEqual((await post('start',{sessionId,modelSelection:{...b,reasoningEffort:'high'}})).status,200);
  assert.equal((await post('progress',{sessionId})).body.job,null);

  // 原生工具循环使用用户选定的参数，运行中不得换模型。
  assert.equal((await post('start',{sessionId,modelSelection:a})).status,200);
  assert.notEqual((await post('start',{sessionId,modelSelection:b})).status,200);
  const first=await waitJob();assert.equal(first.status,'completed',JSON.stringify(first));
  let record=(await post('list',{sessionId})).body.records.find(r=>r.id===first.recordId);assert.deepEqual(record.modelSelection,a);
  let calls=readFileSync(join(dir,'rpc.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  for(const c of calls.filter(x=>x.method==='thread/start')){assert.equal(c.params.model,a.model);assert.equal(c.params.config.model_reasoning_effort,a.reasoningEffort);}
  for(const c of calls.filter(x=>x.method==='turn/start')){assert.equal(c.params.model,a.model);assert.equal(c.params.effort,a.reasoningEffort);}
  assert.deepEqual((await post('models')).body.preference,a);

  // 另一次选择更新偏好，但旧候选的 Wiki 对照仍沿用原分析模型。
  assert.equal((await post('start',{sessionId,modelSelection:b})).status,200);assert.equal((await waitJob()).status,'completed');assert.deepEqual((await post('models')).body.preference,b);
  record=(await post('update',{id:record.id,revision:record.revision,data:{...record.data,workflow:{...record.data.workflow,items:record.data.workflow.items.map(x=>({...x,decision:'confirmed'}))}}})).body.record;
  // 模型目录尚未响应时也可以取消，不得在取消返回后再启动后台模型。
  writeFileSync(join(dir,'slow-catalog'),'1');
  const beforeCatalog=readFileSync(join(dir,'rpc.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  const waitingCatalog=post('compare',{id:record.id,revision:record.revision});
  for(let i=0;i<100;i++){
    const after=readFileSync(join(dir,'rpc.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
    if(after.filter(x=>x.method==='model/list').length>beforeCatalog.filter(x=>x.method==='model/list').length)break;
    await new Promise(r=>setTimeout(r,10));
  }
  await post('cancel',{sessionId});const cancelledCatalog=await waitingCatalog;assert.notEqual(cancelledCatalog.status,200);assert.match(cancelledCatalog.body.error,/取消/);
  const afterCatalog=readFileSync(join(dir,'rpc.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(afterCatalog.filter(x=>x.method==='thread/start').length,beforeCatalog.filter(x=>x.method==='thread/start').length);
  unlinkSync(join(dir,'slow-catalog'));
  writeFileSync(join(dir,'stuck-comparison'),'1');
  const stopped=post('compare',{id:record.id,revision:record.revision});
  for(let i=0;i<100;i++){
    const log=readFileSync(join(dir,'rpc.jsonl'),'utf8');
    if(log.includes('outputSchema')&&log.split('\n').some(line=>line&&JSON.parse(line).method==='turn/start'&&JSON.parse(line).params.outputSchema.properties.paths))break;
    await new Promise(r=>setTimeout(r,20));
  }
  await post('cancel',{sessionId});const cancelled=await stopped;assert.notEqual(cancelled.status,200);assert.match(cancelled.body.error,/取消/);
  assert.ok(readFileSync(join(dir,'rpc.jsonl'),'utf8').includes('turn/interrupt'));
  unlinkSync(join(dir,'stuck-comparison'));
  const catalogsBefore=readFileSync(join(dir,'rpc.jsonl'),'utf8').trim().split('\n').map(JSON.parse).filter(x=>x.method==='model/list').length;
  const pair=await Promise.all([post('compare',{id:record.id,revision:record.revision}),post('compare',{id:record.id,revision:record.revision})]);const compared=pair[0];assert.equal(pair[1].status,200,JSON.stringify(pair[1].body));assert.equal(pair[0].body.record.revision,pair[1].body.record.revision);assert.equal(compared.status,200,JSON.stringify(compared.body));assert.deepEqual(compared.body.record.comparisonModelSelection,a);assert.equal(readFileSync(join(dir,'rpc.jsonl'),'utf8').trim().split('\n').map(JSON.parse).filter(x=>x.method==='model/list').length-catalogsBefore,1);
  calls=readFileSync(join(dir,'rpc.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.equal(calls.filter(x=>x.method==='thread/start').at(-1).params.model,a.model);

  // 服务返回不同实际模型时失败，不能以请求的模型名伪装成成功。
  writeFileSync(join(dir,'wrong-model'),'1');await post('start',{sessionId,modelSelection:b});const mismatch=await waitJob();assert.equal(mismatch.status,'failed');assert.match(mismatch.error,/模型/);
  assert.equal((await post('list',{sessionId})).body.records.length,2);assert.ok(!existsSync(join(root,'concepts/new.md')));
});
