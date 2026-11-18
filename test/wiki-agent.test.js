import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { withWikiAgent } from '../src/wiki-agent.ts';

function fixture(t, mode='normal') {
 const dir=mkdtempSync(join(tmpdir(),'native-runner-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const command=join(dir,'codex.mjs'),log=join(dir,'calls');
 writeFileSync(command,`#!${process.execPath}\nimport {createInterface} from 'node:readline';import{appendFileSync}from'node:fs';
const send=m=>console.log(JSON.stringify(m));const mode=${JSON.stringify(mode)};let tid='background-thread';
createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);appendFileSync(${JSON.stringify(log)},line+'\\n');
if(m.id==='call'){send({method:'item/completed',params:{threadId:tid,turnId:'turn',item:{type:'agentMessage',text:JSON.stringify({ok:m.result.success})}}});send({method:'turn/completed',params:{threadId:tid,turn:{id:'turn',status:'completed'}}});return;}
if(m.id===undefined)return;let result={};if(m.method==='mcpServerStatus/list')result={data:[{name:'inherited'}],nextCursor:null};
if(['thread/start','thread/resume'].includes(m.method))result={thread:{id:tid},model:mode==='wrong'?'wrong':m.params.model,reasoningEffort:m.params.config.model_reasoning_effort};
if(m.method==='turn/start'){send({id:m.id,result:{turn:{id:'turn'}}});if(mode==='stuck')return;send({method:'item/tool/call',id:'call',params:{threadId:tid,turnId:'turn',tool:mode==='forbidden'?'write_file':'read_source',namespace:null,arguments:{page:0}}});return;}
if(m.method==='thread/compact/start')send({method:'thread/compacted',params:{threadId:tid}});
send({id:m.id,result});});`,{mode:0o755});
 execFileSync(process.execPath,['--check',command],{stdio:'inherit'});
 return {dir,command,calls:()=>readFileSync(log,'utf8').trim().split('\n').map(JSON.parse)};
}
const modelSelection={model:'test-model',reasoningEffort:'low'};

test('native runner handles readonly dynamic tool loop, effective model, compaction and durable resume',async t=>{
 const f=fixture(t),states=[],registered=[];
 const options={cwd:f.dir,command:f.command,modelSelection,onState:s=>states.push(s),registerThread:id=>registered.push(id),tools:[{name:'read_source',description:'read',inputSchema:{type:'object',properties:{page:{type:'integer'}},required:['page'],additionalProperties:false},call:args=>({evidence:args.page})}]};
 const result=await withWikiAgent(options,async agent=>{const out=await agent.ask('read source',{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false});await agent.compact();return out;});
 assert.deepEqual(result,{ok:true});assert.equal(registered[0],'background-thread');assert.ok(states.some(s=>s.toolCalls===1));assert.ok(states.some(s=>s.compactions===1));
 await withWikiAgent({...options,resume:states.at(-1)},agent=>agent.ask('continue',{type:'object'}));
 const calls=f.calls();assert.equal(calls.filter(c=>c.method==='thread/start').length,1);assert.equal(calls.filter(c=>c.method==='thread/resume').length,1);
 const start=calls.find(c=>c.method==='thread/start').params;assert.equal(start.ephemeral,false);assert.equal(start.sandbox,'read-only');assert.equal(start.config.mcp_servers.inherited.enabled,false);assert.equal(start.dynamicTools[0].name,'read_source');
 assert.ok(calls.filter(c=>c.method==='turn/start').every(c=>c.params.effort==='low'&&c.params.sandboxPolicy.networkAccess===false));
});

test('native runner rejects model mismatch and unauthorized tool calls',async t=>{
 for(const mode of ['wrong','forbidden']){
  const f=fixture(t,mode);await assert.rejects(withWikiAgent({cwd:f.dir,command:f.command,modelSelection,tools:[]},agent=>agent.ask('go',{type:'object'})),mode==='wrong'?/模型/:/工具/);
 }
});

test('cancelling native work sends turn interrupt and does not return a candidate',async t=>{
 const f=fixture(t,'stuck'),controller=new AbortController();
 await assert.rejects(withWikiAgent({cwd:f.dir,command:f.command,modelSelection,tools:[],signal:controller.signal,onState:s=>{if(s.turnId)setTimeout(()=>controller.abort(),20)}},agent=>agent.ask('wait',{type:'object'})),/取消/);
 assert.ok(f.calls().some(c=>c.method==='turn/interrupt'&&c.params.turnId==='turn'));
});

test('native idle timeout is separate from the total task budget and reports the thread',async t=>{
 const f=fixture(t,'stuck');
 // 先用真实 I/O 建立轮次，再推进空闲时钟，避免并行测试的进程启动耗时影响断言。
 t.mock.timers.enable({apis:['Date','setTimeout','setInterval'],now:Date.now()});
 await assert.rejects(withWikiAgent({cwd:f.dir,command:f.command,modelSelection,tools:[],idleTimeoutMs:800,budgetMs:3000,onState:state=>{
  if(state.lastEvent==='turn/started'&&state.turnId)t.mock.timers.tick(801);
 }},agent=>agent.ask('wait',{type:'object'})),/无活动.*background-thread/);
});
