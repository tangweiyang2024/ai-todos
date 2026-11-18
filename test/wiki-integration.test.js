import { nativeReadLoopSource } from './fixtures/native-read-loop.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { Store } from '../src/domain.ts';

async function port() { const server=createServer(); await new Promise(r=>server.listen(0,'127.0.0.1',r)); const result=server.address().port; await new Promise(r=>server.close(r)); return result; }
test('browser review is required to apply the exact preview; stale Wiki and replay fail', async t => {
  const dir=mkdtempSync(join(tmpdir(),'wiki-web-')), root=join(dir,'wiki'), node=process.execPath, sessionId=randomUUID();
  mkdirSync(root); mkdirSync(join(root,'entities')); mkdirSync(join(root,'concepts')); mkdirSync(join(dir,'20领域','tools'), { recursive:true }); writeFileSync(join(root,'index.md'),'[[kcard]]\n'); writeFileSync(join(root,'log.md'),'# Log\n'); writeFileSync(join(root,'entities/kcard.md'),'# Kcard\n旧内容\n');
  const store=new Store(join(dir,'ai-todos.sqlite')); store.observe({session_id:sessionId,hook_event_name:'Stop',cwd:dir,turn_id:'turn'}); store.close();
  writeFileSync(join(dir,'codex'), `#!${node}\nimport { createInterface } from 'node:readline';\nif (process.argv.includes('proxy')) process.exit(1);
${nativeReadLoopSource('model-thread')}
\nlet count=0; createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(nativeReply(m))return;if(m.id===undefined)return;let result={};if(m.method==='thread/read') result={thread:{id:m.params.threadId}};if(m.method==='thread/items/list') result={data:[{turnId:'t',item:{type:'agentMessage',id:'i',text:'证据'}}],nextCursor:null};if(m.method==='mcpServerStatus/list')result={data:[],nextCursor:null};if(m.method==='thread/start')result={thread:{id:'model-thread'},model:m.params.model,reasoningEffort:m.params.config?.model_reasoning_effort};if(m.method==='turn/start'){count++;const value=m.params.outputSchema.properties.supported?{supported:true,explanation:'支持'}:m.params.outputSchema.properties.sessionSummary?{sessionSummary:'会话做了什么',items:[{title:'经验一',conclusion:'结论',scope:'范围',evidence:'t/i',unverified:''}]}:count===1?{paths:['entities/kcard.md']}:{summary:'新经验',scope:'范围',evidence:'t/i',unverified:'待核实',relation:'相关',changes:[{path:'entities/kcard.md',content:'# Kcard\\n旧内容\\n新经验\\n'}],newNotes:[{wikiPath:'concepts/new.md',wikiContent:'---\\ntags: [example]\\nupdated: 2026-11-13\\n---\\n# 新经验\\n[[index]]\\n',humanPath:'20领域/tools/new.md',humanContent:'# 新经验\\n说明\\n'}]};nativeStart(m,value);return}console.log(JSON.stringify({id:m.id,result}))});`,{mode:0o755});
  const p=await port(), origin=`http://127.0.0.1:${p}`, child=spawn(node,[resolve(process.env.AI_TODOS_TEST_SERVER || 'src/server.ts')],{env:{...process.env,PATH:`${dir}:${process.env.PATH}`,AI_TODOS_PORT:String(p),AI_TODOS_DATA_DIR:dir,AI_TODOS_WIKI_ROOT:root,AI_TODOS_VAULT_ROOT:dir},stdio:'ignore'});
  t.after(()=>{child.kill('SIGTERM');rmSync(dir,{recursive:true,force:true})});
  let ready=false;for(let n=0;n<100;n++){try{if((await fetch(origin+'/health')).ok){ready=true;break}}catch{} await new Promise(r=>setTimeout(r,50))}assert.ok(ready,'server started');
  const page=await fetch(origin),cookie=page.headers.get('set-cookie').split(';')[0], state=await (await fetch(origin+'/api/state',{headers:{cookie}})).json();
  const headers={cookie,origin,'x-csrf-token':state.csrf,'content-type':'application/json'};
  const post=async (path, data, hdr=headers)=>{const response=await fetch(`${origin}/api/wiki/${path}`,{method:'POST',headers:hdr,body:JSON.stringify(data)});return {status:response.status,body:await response.json()}};
  const made=await post('start',{sessionId,modelSelection:{model:'test-model',reasoningEffort:'low'}}); assert.equal(made.status,200,JSON.stringify(made.body)); assert.equal(made.body.job.status,'running');
  let job;
  for(let n=0;n<100;n++){const response=await post('progress',{sessionId});assert.equal(response.status,200);job=response.body.job;if(job.status!=='running')break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(job.status,'completed',JSON.stringify(job));
  const listed=await post('list',{sessionId}); let record=listed.body.records.find(item=>item.id===job.recordId); assert.ok(record);
  assert.equal(readFileSync(join(root,'entities/kcard.md'),'utf8'),'# Kcard\n旧内容\n');
  const saved=await post('update',{id:record.id,revision:record.revision,data:{...record.data,reviewNote:'我的意见',workflow:{...record.data.workflow,items:record.data.workflow.items.map(item=>({...item,decision:'confirmed',note:'保留'}))}}});assert.equal(saved.status,200,JSON.stringify(saved.body));record=saved.body.record;
  const compared=await post('compare',{id:record.id,revision:record.revision});assert.equal(compared.status,200,JSON.stringify(compared.body));record=compared.body.record;
  let reviewed=await post('preview',{id:record.id,revision:record.revision});assert.equal(reviewed.status,200);assert.equal(reviewed.body.preview.files.length,5);
  const noCsrf=await post('approve',{ticket:reviewed.body.ticket},{cookie,origin,'content-type':'application/json'});assert.equal(noCsrf.status,403);
  writeFileSync(join(root,'entities/kcard.md'),'外部修改');const stale=await post('approve',{ticket:reviewed.body.ticket});assert.notEqual(stale.status,200);assert.equal(readFileSync(join(root,'entities/kcard.md'),'utf8'),'外部修改');
  writeFileSync(join(root,'entities/kcard.md'),'# Kcard\n旧内容\n');reviewed=await post('preview',{id:record.id,revision:record.revision});const done=await post('approve',{ticket:reviewed.body.ticket});assert.equal(done.status,200,JSON.stringify(done.body));assert.equal(done.body.record.data.reviewNote,'我的意见');assert.match(readFileSync(join(root,'entities/kcard.md'),'utf8'),/新经验/);assert.match(readFileSync(join(root,'log.md'),'utf8'),/新经验/);assert.match(readFileSync(join(root,'concepts/new.md'),'utf8'),/新经验/);assert.match(readFileSync(join(dir,'20领域/tools/new.md'),'utf8'),/新经验/);assert.match(readFileSync(join(root,'index.md'),'utf8'),/concepts\/new/);
  assert.notEqual((await post('approve',{ticket:reviewed.body.ticket})).status,200);
});
