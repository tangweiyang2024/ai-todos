import { createServer as netServer } from 'node:net';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Store } from '../../src/domain.ts';

// 浏览器只接触隔离数据；模型事件用门闩控制，以检查完成前不能显示审核弹窗。
const dir=mkdtempSync(join(tmpdir(),'capture-auto-browser-')), wiki=join(dir,'wiki');mkdirSync(wiki);writeFileSync(join(wiki,'index.md'),'# Fixture wiki\n');
const sourceId=randomUUID(), threadId=randomUUID(), at=Math.floor(Date.now()/1000);
const store=new Store(join(dir,'ai-todos.sqlite'));
store.observe({session_id:sourceId,hook_event_name:'Stop',cwd:dir,turn_id:'fixture-source'});
store.setMeta(`session.summary.${sourceId}`,{text:'隔离测试：原生后台提取默认模型与人工审核',partial:false,sourceUpdatedAt:new Date(at*1000).toISOString()});store.close();
writeFileSync(join(dir,'codex'),`#!${process.execPath}
import{createInterface}from'node:readline';import{existsSync,appendFileSync}from'node:fs';
if(process.argv.includes('proxy'))process.exit(1);
if(process.argv.includes('exec')){let input='';for await(const c of process.stdin)input+=c;appendFileSync(${JSON.stringify(join(dir,'executions'))},JSON.stringify({args:process.argv.slice(2),input})+'\\n');console.log(JSON.stringify({type:'thread.started',thread_id:${JSON.stringify(threadId)}}));console.log(JSON.stringify({type:'turn.started'}));while(!existsSync(${JSON.stringify(join(dir,'release'))}))await new Promise(r=>setTimeout(r,40));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'fixture经验候选'}}));console.log(JSON.stringify({type:'turn.completed'}));process.exit(0);}
createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id===undefined)return;let r={};if(m.method==='model/list')r={data:[{id:'fixture-model',model:'fixture-model',displayName:'Fixture Model',defaultReasoningEffort:'high',supportedReasoningEfforts:[{reasoningEffort:'low',description:'Low'},{reasoningEffort:'high',description:'High'}],isDefault:true}],nextCursor:null};if(m.method==='project/list'||m.method==='mcpServerStatus/list')r={data:[],nextCursor:null};if(m.method==='thread/list')r={data:[{id:${JSON.stringify(sourceId)},name:'后台经验提取（隔离测试）',preview:'测试',cwd:${JSON.stringify(dir)},ephemeral:false,updatedAt:${at},status:{type:'idle'}}],nextCursor:null};if(m.method==='thread/read')r={thread:{id:m.params.threadId}};if(m.method==='thread/items/list')r={data:[{turnId:'fixture-source',item:{id:'evidence',type:'agentMessage',text:'根因是读取超时后重复派发首轮任务，采用持久化派发标记避免重复执行。'}}],nextCursor:null};if(m.method==='thread/turns/list')r={data:[],nextCursor:null};if(m.method==='thread/start')r={thread:{id:${JSON.stringify(threadId)},preview:'',cwd:m.params.cwd,ephemeral:false,updatedAt:${at},status:{type:'idle'}}};console.log(JSON.stringify({id:m.id,result:r}));});`,{mode:0o755});
writeFileSync(join(dir,'open'),`#!${process.execPath}\nimport{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(join(dir,'opened'))},process.argv[2]);`,{mode:0o755});
const socket=netServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const child=spawn(process.execPath,[resolve(process.env.AI_TODOS_TEST_SERVER||'plugins/ai-todos/src/server.js')],{env:{...process.env,PATH:`${dir}:${process.env.PATH}`,AI_TODOS_DATA_DIR:dir,AI_TODOS_PORT:String(port),AI_TODOS_WIKI_ROOT:wiki,AI_TODOS_VAULT_ROOT:dir},stdio:'ignore'});
process.on('SIGTERM',()=>{child.kill('SIGTERM');process.exit(0)});
for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
const result={dir,sourceId,threadId,origin:`http://127.0.0.1:${port}`};writeFileSync('/private/tmp/ai-todos-capture-browser.json',JSON.stringify(result));console.log(JSON.stringify(result));
