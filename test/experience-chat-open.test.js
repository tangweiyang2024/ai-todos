import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

test('open handoff creates one reusable hidden conversation, prefills a prompt, and never starts inference',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'experience-open-'));const oldPath=process.env.PATH;
 process.env.AI_TODOS_DATA_DIR=dir;process.env.PATH=`${dir}:${oldPath}`;
 t.after(()=>{process.env.PATH=oldPath;delete process.env.AI_TODOS_DATA_DIR;rmSync(dir,{recursive:true,force:true});});
 const { Store }=await import('../src/domain.ts');const { openExperienceChat, prepareExperienceChat, codexAction }=await import('../src/codex.ts');
 const wiki=join(dir,'vault','40-LLM-Wiki','wiki');mkdirSync(wiki,{recursive:true});writeFileSync(join(wiki,'index.md'),'# Index');
 const db=join(dir,'db'),store=new Store(db),sourceId=randomUUID(),captureId=randomUUID(),log=join(dir,'rpc.jsonl'),opened=join(dir,'opened');
 t.after(()=>store.close());store.observe({session_id:sourceId,hook_event_name:'Stop',cwd:dir});
 writeFileSync(join(dir,'codex'),`#!${process.execPath}\nimport{createInterface}from'node:readline';import{appendFileSync,existsSync,readFileSync}from'node:fs';
if(process.argv.includes('proxy'))process.exit(1);
createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);appendFileSync(${JSON.stringify(log)},line+'\\n');if(m.id===undefined)return;let r={};
if(m.method==='thread/read')r={thread:{id:m.params.threadId}};
if(m.method==='thread/items/list')r={data:[{turnId:'t',item:{id:'i',type:'agentMessage',text:existsSync(${JSON.stringify(join(dir,'source-update'))})?'维护人补充了生产角色':'原始业务结论'}}],nextCursor:null};
if(m.method==='thread/start')r={thread:{id:existsSync(${JSON.stringify(join(dir,'next-thread'))})?readFileSync(${JSON.stringify(join(dir,'next-thread'))},'utf8'):${JSON.stringify(captureId)},preview:'',cwd:m.params.cwd,ephemeral:false,updatedAt:1794815000,status:{type:'idle'}}};
if(m.method==='thread/turns/list')r={data:existsSync(${JSON.stringify(join(dir,'started'))})?[{id:'turn'}]:[],nextCursor:null};
if(m.method==='thread/list')r={data:[{id:${JSON.stringify(captureId)},name:'经验沉淀',preview:'',cwd:${JSON.stringify(join(dir,'vault'))},ephemeral:false,updatedAt:Math.floor(Date.now()/1000)+1,status:{type:'active'}}],nextCursor:null};
console.log(JSON.stringify({id:m.id,result:r}));});`,{mode:0o755});
 const opener=process.platform==='darwin'?'open':'xdg-open';writeFileSync(join(dir,opener),`#!${process.execPath}\nimport{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(opened)},process.argv[2]);`,{mode:0o755});
 const [one,two]=await Promise.all([openExperienceChat(store,sourceId,wiki,join(dir,'vault')),openExperienceChat(store,sourceId,wiki,join(dir,'vault'))]);
 assert.equal(one.chat.threadId,captureId);assert.equal(two.chat.threadId,captureId);
 let calls=readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);assert.equal(calls.filter(c=>c.method==='thread/start').length,1);assert.equal(calls.filter(c=>c.method==='thread/inject_items').length,1);assert.ok(!calls.some(c=>c.method==='turn/start'));
 assert.equal(calls.filter(c=>c.method==='thread/turns/list').length,0,'新创建的沉淀聊天无需再次连接 Codex 查询空轮次');
 const link=new URL(readFileSync(opened,'utf8'));assert.equal(link.hostname,'threads');assert.equal(link.pathname,`/${captureId}`);assert.ok(link.searchParams.get('prompt').includes(one.chat.contextPath));
 assert.ok(store.sessions().every(s=>s.id!==captureId));assert.equal(store.sessions().find(s=>s.id===sourceId).experience.status,'ready');
 store.observe({session_id:captureId,hook_event_name:'UserPromptSubmit',cwd:join(dir,'vault'),turn_id:'t'});
 assert.equal(store.sessions().find(s=>s.id===sourceId).experience.status,'running');
 store.observe({session_id:captureId,hook_event_name:'Stop',cwd:join(dir,'vault'),turn_id:'t'});
 assert.equal(store.sessions().find(s=>s.id===sourceId).experience.status,'paused');
 const reopened=new Store(db);try{writeFileSync(join(dir,'started'),'yes');await openExperienceChat(reopened,sourceId,wiki,join(dir,'vault'));assert.equal(new URL(readFileSync(opened,'utf8')).searchParams.get('prompt'),null);}finally{reopened.close();}
 await codexAction(store,{operation:'sync_threads'});assert.ok(!store.sessions().some(s=>s.id===captureId));assert.equal(store.sessions().find(s=>s.id===sourceId).experience.status,'paused');
 store.syncCodexThreads([{id:captureId,title:'经验沉淀',cwd:join(dir,'vault'),state:'running',updatedAt:new Date(Date.now()+1000).toISOString()}],false);assert.equal(store.sessions().find(s=>s.id===sourceId).experience.status,'running');
 await assert.rejects(openExperienceChat(store,captureId,wiki,join(dir,'vault')),/会话不存在|同步/);
 const reportAt=Date.now()+2000;store.now=()=>reportAt;
 writeFileSync(one.chat.progressPath,JSON.stringify({version:1,sourceId,threadId:captureId,stage:'completed',summary:'会话明确报告完成',updatedAt:new Date(reportAt).toISOString()}));
 assert.equal(store.sessions().find(s=>s.id===sourceId).experience.status,'reported_complete');
 store.now=()=>reportAt+1000;store.observe({session_id:captureId,hook_event_name:'UserPromptSubmit',cwd:join(dir,'vault'),turn_id:'next-turn'});
 store.now=()=>reportAt+2000;store.observe({session_id:captureId,hook_event_name:'Stop',cwd:join(dir,'vault'),turn_id:'next-turn'});
 assert.equal(store.sessions().find(s=>s.id===sourceId).experience.status,'paused');
 // 同一轮等待批准后继续运行，不得把较晚的宿主观察误认成新一轮。
 const syncSame=(state,offset)=>store.syncCodexThreads([{id:captureId,title:'沉淀',cwd:join(dir,'vault'),state,updatedAt:new Date(reportAt+offset).toISOString(),observation:{source:'codex-app-server',event:'thread/list',turnId:'same-turn',observedAt:new Date(reportAt+offset).toISOString()}}],false);
 syncSame('waiting_approval',3000);
 writeFileSync(one.chat.progressPath,JSON.stringify({version:1,sourceId,threadId:captureId,stage:'completed',summary:'同轮完成',updatedAt:new Date(reportAt+4000).toISOString()}));
 syncSame('running',5000);syncSame('idle',6000);
 assert.equal(store.sessions().find(s=>s.id===sourceId).experience.status,'reported_complete');
 calls=readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);assert.equal(calls.filter(c=>c.method==='thread/start').length,1);assert.ok(calls.filter(c=>c.method==='thread/inject_items').every(c=>c.params.threadId===captureId));

 // 新记录读取最新全文，同一提交共用新的聊天，历史跳转即使原聊天尚无轮次也不预填。
 const recordId = randomUUID(), nextThread = randomUUID(), focus = '只记录准确角色名';
 writeFileSync(join(dir, 'next-thread'), nextThread);
 writeFileSync(join(dir, 'source-update'), 'changed');
 const captured = [];
 const options = { recordId, focus, previousSourcePath: one.chat.sourcePath, onSourceSnapshot: snapshot => captured.push(snapshot) };
 const [fresh, duplicate] = await Promise.all([
   prepareExperienceChat(store, sourceId, wiki, join(dir, 'vault'), options),
   prepareExperienceChat(store, sourceId, wiki, join(dir, 'vault'), options),
 ]);
 assert.equal(fresh.chat.threadId, nextThread);
 assert.equal(duplicate.chat.threadId, nextThread);
 assert.equal(captured.length, 1);
 assert.equal(captured[0].sourceCapturedAt, fresh.chat.sourceCapturedAt);
 assert.notEqual(fresh.chat.sourceHash, one.chat.sourceHash);
 assert.match(readFileSync(fresh.chat.sourcePath, 'utf8'), /维护人补充了生产角色/);
 assert.doesNotMatch(readFileSync(one.chat.sourcePath, 'utf8'), /维护人补充了生产角色/);
 const instructions = readFileSync(fresh.chat.contextPath, 'utf8');
 assert.ok(instructions.includes(focus));
 assert.ok(instructions.includes(one.chat.sourcePath));
 const afterCreate = readFileSync(log, 'utf8');
 const current = await openExperienceChat(store, sourceId, wiki, join(dir, 'vault'), recordId);
 assert.equal(current.prefilled, false);
 assert.equal(readFileSync(opened, 'utf8'), `codex://threads/${nextThread}`);
 await openExperienceChat(store, sourceId, wiki, join(dir, 'vault'), sourceId);
 assert.equal(readFileSync(opened, 'utf8'), `codex://threads/${captureId}`);
 await assert.rejects(openExperienceChat(store, sourceId, wiki, join(dir, 'vault'), randomUUID()), /记录/);
 assert.equal(readFileSync(log, 'utf8'), afterCreate, '查看历史记录应直接跳转，不发起 RPC');

 // 已取得快照后连接失败，重试沿用原始来源；下一次独立提交仍可读取变化后的全文。
 const retryId = randomUUID(), retryThread = randomUUID();
 let fixedSource;
 await assert.rejects(prepareExperienceChat(store, sourceId, wiki, join(dir, 'vault'), {
   recordId: retryId,
   onSourceSnapshot: snapshot => { fixedSource = snapshot; },
   onStage: stage => { if (stage === 'connecting') throw new Error('模拟连接失败'); },
 }), /连接失败/);
 rmSync(join(dir, 'source-update'));
 writeFileSync(join(dir, 'next-thread'), retryThread);
 const beforeRetry = readFileSync(log, 'utf8');
 const fixed = await prepareExperienceChat(store, sourceId, wiki, join(dir, 'vault'), {
   recordId: retryId, sourceSnapshot: fixedSource,
 });
 assert.equal(fixed.chat.threadId, retryThread);
 assert.equal(fixed.chat.sourceHash, fresh.chat.sourceHash);
 assert.equal(fixed.chat.sourceCapturedAt, fixedSource.sourceCapturedAt);
 const retryCalls = readFileSync(log, 'utf8').slice(beforeRetry.length).trim().split('\n').map(JSON.parse);
 assert.ok(!retryCalls.some(call => call.method === 'thread/read'), '恢复读取断点不能重新拉原会话');

 // 宿主错误返回已有聊天时，不能向历史记录注入、改名或归档。
 writeFileSync(join(dir, 'next-thread'), captureId);
 const beforeCollision = readFileSync(log, 'utf8');
 await assert.rejects(prepareExperienceChat(store, sourceId, wiki, join(dir, 'vault'), { recordId: randomUUID() }), /已关联/);
 const collisionCalls = readFileSync(log, 'utf8').slice(beforeCollision.length).trim().split('\n').map(JSON.parse);
 assert.ok(!collisionCalls.some(call => ['thread/inject_items', 'thread/name/set', 'thread/archive'].includes(call.method)));

 // 旧版同步打开也可能抢先开始准备；新旧面板同时发起时要避免并行建聊。
 const anotherSource = randomUUID();
 store.observe({ session_id: anotherSource, hook_event_name: 'Stop', cwd: dir });
 writeFileSync(join(dir, 'next-thread'), randomUUID());
 const legacyPending = prepareExperienceChat(store, anotherSource, wiki, join(dir, 'vault'));
 await assert.rejects(prepareExperienceChat(store, anotherSource, wiki, join(dir, 'vault'), { recordId: randomUUID() }), /正在准备/);
 await legacyPending;
 assert.equal(readFileSync(join(wiki,'index.md'),'utf8'),'# Index');
});
