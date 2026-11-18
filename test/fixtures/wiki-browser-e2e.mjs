import { nativeReadLoopSource } from './native-read-loop.js';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Store } from '../../src/domain.ts';

// 准备独立数据和 Wiki，浏览器最终批准也只影响这些临时文件。
const dir=mkdtempSync(join(tmpdir(),'ai-todos-browser-e2e-')), root=join(dir,'wiki'), sessionId=randomUUID(), captureId=randomUUID();
for(const path of [root,join(root,'entities'),join(root,'concepts'),join(dir,'20领域/tools')])mkdirSync(path,{recursive:true});
writeFileSync(join(root,'index.md'),'# 测试索引\n\n- [[existing]]\n');
writeFileSync(join(root,'log.md'),'# 测试日志\n');
writeFileSync(join(root,'entities/existing.md'),'# 已有经验\n\n仅有旧版同步任务的记录。\n');
const store=new Store(join(dir,'ai-todos.sqlite'));
store.observe({session_id:sessionId,hook_event_name:'Stop',cwd:dir,turn_id:'fixture-turn'});
store.syncCodexThreads([{id:sessionId,title:'端到端测试：经验审核（隔离 Wiki）',preview:'模拟长会话和模型，真实 MCP 和服务。',cwd:dir,updatedAt:new Date().toISOString(),state:'idle'}]);store.close();
const primary={title:'后台任务断点恢复',conclusion:'后台任务分段保存成功结果，重试时先核对源快照。',scope:'本地长会话分析',evidence:'turn0/item0，text 原文范围 0..15000',unverified:'真实模型的质量和耗时另行验证。'};
const secondary={title:'未经验证的并发优化',conclusion:'提高并发可能缩短耗时。',scope:'待验证',evidence:'turn1/item1',unverified:'没有并发压测。'};
const comparison={summary:'建议新增后台任务恢复主题，关联已有同步任务记录。',scope:'本地长会话分析',evidence:'turn0/item0',unverified:'并发性能未验证。',relation:'已有 [[existing]] 仅涉及同步任务；没有完全重复记录。新经验适用范围不同，建议新增页面并双链关联。',changes:[],newNotes:[{wikiPath:'concepts/checkpoint.md',wikiContent:'---\ntags: [test, recovery]\nupdated: 2026-11-13\n---\n# 后台任务断点恢复\n\n**确认的结论**：分段保存成功结果，重试先核对源快照。\n\n| 情况 | 处理 |\n| --- | --- |\n| 快照相同 | 复用成功分段 |\n| 快照变化 | 重新分析 |\n\n相关：[[existing]]。\n',humanPath:'20领域/tools/后台任务断点恢复.md',humanContent:'# 后台任务断点恢复\n\n1. 保存成功分段。\n2. 重试前核对源快照。\n\n这是隔离测试内容。\n'}]};
// 仅替换会话和模型；MCP、后台任务、审核存储和文件写入使用真实实现。
const code=[
"import {createInterface} from 'node:readline';import {appendFileSync,writeFileSync,existsSync} from 'node:fs';",
"if(process.argv.includes('proxy'))process.exit(1);",
 nativeReadLoopSource('model-thread',undefined,false),
'const rpcLog='+JSON.stringify(join(dir,'model-rpc.jsonl'))+';',
'const primary='+JSON.stringify(primary)+',secondary='+JSON.stringify(secondary)+',comparison='+JSON.stringify(comparison)+';',
'const fixtureThread='+JSON.stringify({id:sessionId,name:'端到端测试：经验审核（隔离 Wiki）',preview:'模拟长会话和模型，真实 MCP 和服务。',cwd:dir,updatedAt:Math.floor(Date.now()/1000),status:{type:'idle'},ephemeral:false})+';',
'const captureThread='+JSON.stringify({id:captureId,name:'经验沉淀 · 端到端测试',preview:'',cwd:dir,updatedAt:Math.floor(Date.now()/1000),status:{type:'notLoaded'},ephemeral:false})+';',
'const captureFlag='+JSON.stringify(join(dir,'capture-created'))+';',
"createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(nativeReply(m))return;if(m.id===undefined)return;let r={};if(['thread/start','thread/inject_items','thread/name/set','thread/turns/list','turn/start'].includes(m.method))appendFileSync(rpcLog,JSON.stringify({method:m.method,model:m.params.model,effort:m.params.effort,configEffort:m.params.config?.model_reasoning_effort,params:m.params})+'\\n');",
"if(m.method==='thread/read')r={thread:{id:m.params.threadId}};",
"if(m.method==='thread/items/list'){const n=Number(m.params.cursor||0);r={data:[{turnId:'turn'+n,item:{id:'item'+n,type:'agentMessage',text:'分段测试内容。'.repeat(2200)}}],nextCursor:n<59?String(n+1):null}}",
"if(m.method==='model/list')r={data:[{id:'fast',model:'e2e-fast',displayName:'E2E Fast',defaultReasoningEffort:'low',supportedReasoningEfforts:[{reasoningEffort:'low',description:'Fast'}]},{id:'deep',model:'e2e-deep',displayName:'E2E Deep',defaultReasoningEffort:'high',supportedReasoningEfforts:[{reasoningEffort:'medium',description:'Medium'},{reasoningEffort:'high',description:'High'}]}],nextCursor:null};",
"if(m.method==='mcpServerStatus/list')r={data:[],nextCursor:null};if(['thread/start','thread/resume'].includes(m.method)){if(m.method==='thread/start'&&!m.params.baseInstructions){writeFileSync(captureFlag,'1');r={thread:captureThread};}else r={thread:{id:'model-thread'},model:m.params.model,reasoningEffort:m.params.config?.model_reasoning_effort};}if(m.method==='thread/turns/list')r={data:[],nextCursor:null};",
"if(m.method==='thread/list')r={data:[fixtureThread,...(existsSync(captureFlag)?[captureThread]:[])],nextCursor:null};if(m.method==='project/list')r={data:[],nextCursor:null};",
"if(m.method==='turn/start'){let value;if(m.params.outputSchema.properties.supported)value={supported:true,explanation:'原文支持'};else if(m.params.outputSchema.properties.paths)value={paths:['entities/existing.md'],humanPaths:[]};else if(m.params.outputSchema.properties.sessionSummary)value={sessionSummary:'本次会话完成了长会话读取、后台分析和断点恢复，并讨论了一项尚未验证的并发优化。',items:[primary,secondary]};else value=comparison;",
"nativeStart(m,value);return}console.log(JSON.stringify({id:m.id,result:r}))});"
].join('\n');
writeFileSync(join(dir,'codex'),'#!'+process.execPath+'\n'+code,{mode:0o755});
writeFileSync(join(dir,'open'),'#!'+process.execPath+"\nimport {writeFileSync} from 'node:fs';writeFileSync("+JSON.stringify(join(dir,'opened.txt'))+",process.argv[2]);",{mode:0o755});
const env={...process.env,PATH:dir+':'+process.env.PATH,AI_TODOS_DATA_DIR:dir,AI_TODOS_PORT:'18584',AI_TODOS_WIKI_ROOT:root,AI_TODOS_VAULT_ROOT:dir};
// 同时连接新旧 MCP，复现宿主保留旧工具 schema 时的兼容行为。
const fresh=new Client({name:'browser-e2e',version:'1'});
await fresh.connect(new StdioClientTransport({command:process.execPath,args:[resolve('src/mcp.ts')],env,stderr:'pipe'}));
const legacyPath=process.env.AI_TODOS_E2E_OLD_MCP;
const old=legacyPath?new Client({name:'browser-e2e-stale',version:'1'}):null;
if(old)await old.connect(new StdioClientTransport({command:process.execPath,args:[legacyPath],env,stderr:'pipe'}));
// 用轻量宿主转发实际 MCP 请求，让嵌入式界面可以在浏览器验收。
const resource=await fresh.readResource({uri:'ui://ai-todos/app.html'});
const app=resource.contents[0].text;
const host='<!doctype html><meta charset="utf-8"><title>ai-todos 隔离端到端测试</title><style>body{margin:0;font:13px system-ui}header{padding:8px;background:#eaf4ed;color:#315b3d}iframe{width:100%;height:95vh;border:0}</style><header>隔离测试：实际 MCP 和服务；模拟会话与模型；测试 Wiki</header><iframe src="/app.html"></iframe><script>addEventListener("message",async e=>{const m=e.data;if(!m||m.id===undefined)return;try{let result;if(m.method==="ui/initialize")result={protocolVersion:m.params.protocolVersion,hostInfo:{name:"e2e-host",version:"1"},hostCapabilities:{serverTools:{}},hostContext:{locale:"zh-CN"}};else if(m.method==="tools/call"){const r=await fetch("/bridge"+location.search,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(m.params)});result=await r.json()}else if(m.method==="ui/open-link")result={};else return;e.source.postMessage({jsonrpc:"2.0",id:m.id,result},"*")}catch(error){e.source.postMessage({jsonrpc:"2.0",id:m.id,error:{code:-32603,message:String(error.message||error)}},"*")}});</script>';
const server=createServer(async(req,res)=>{try{if(req.url.startsWith('/bridge')){let body='';for await(const chunk of req)body+=chunk;const call=JSON.parse(body);const client=req.url.includes('stale=1')&&old?old:fresh;const result=await client.callTool(call);res.setHeader('content-type','application/json');res.end(JSON.stringify(result));return}res.setHeader('content-type','text/html; charset=utf-8');res.end(req.url.startsWith('/app.html')?app:host)}catch(error){res.statusCode=500;res.end(JSON.stringify({error:String(error.message||error)}))}});
server.listen(18583,'127.0.0.1',()=>console.log(JSON.stringify({dir,root,sessionId,captureId,host:'http://127.0.0.1:18583/',local:'http://127.0.0.1:18584/'})));
let stopping=false;
// 关闭测试连接和服务，保留临时目录供验收后核查。
async function stop(){
  // 避免重复信号并发关闭同一连接。
  if(stopping)return;stopping=true;

  // 先断开 MCP，再停止其启动的本地后台服务。
  await fresh.close();await old?.close();try{const rt=JSON.parse(readFileSync(join(dir,'runtime.json'),'utf8'));await fetch(rt.origin+'/internal/stop',{method:'POST',headers:{authorization:'Bearer '+rt.token}})}catch{}server.close();}
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
