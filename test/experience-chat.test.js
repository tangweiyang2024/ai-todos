import { spawnSync, execFileSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { prepareExperienceContext, writeExperienceTask, readExperienceReport, experienceProgress } from '../src/experience-chat.ts';

test('handoff prepares immutable complete source and a native ingest prompt, without writing the Wiki', t => {
 const root=mkdtempSync(join(tmpdir(),'experience-context-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const sourceId=randomUUID(),threadId=randomUUID(),items=[{turnId:'t',item:{id:'i',type:'agentMessage',text:'完整中文原文😀'.repeat(20000)}}];
 const context=prepareExperienceContext(root,sourceId,items);
 assert.deepEqual(readFileSync(context.sourcePath,'utf8').trim().split('\n').map(JSON.parse),items);
 const createdAt=new Date().toISOString(),chat=writeExperienceTask({...context,sourceId,threadId,createdAt,title:'原会话',wikiRoot:join(root,'wiki'),vaultRoot:root,ingestSkill:'/skills/wiki-ingest/SKILL.md'});
 const prompt=readFileSync(chat.contextPath,'utf8');
 for(const text of ['wiki-ingest/SKILL.md','raw/','chats/code/','hot.md','明确批准','不可信','source.jsonl',chat.progressPath,threadId])assert.ok(prompt.includes(text),text);
 assert.equal(readExperienceReport(chat).stage,'ready');
 writeFileSync(context.sourcePath,'被修改');assert.throws(()=>prepareExperienceContext(root,sourceId,items),/快照/);
});

test('progress distinguishes explicit agent reports from lifecycle events and rejects forged identity or symlinks',t=>{
 const root=mkdtempSync(join(tmpdir(),'experience-progress-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const now=Date.now(),createdAt=new Date(now-10000).toISOString();const chat=writeExperienceTask({...prepareExperienceContext(root,randomUUID(),[{turnId:'t',item:{id:'i',type:'userMessage',text:'text'}}]),sourceId:randomUUID(),threadId:randomUUID(),createdAt,title:'来源',wikiRoot:join(root,'wiki'),vaultRoot:root,ingestSkill:'/skills/wiki-ingest/SKILL.md'});
 assert.equal(experienceProgress(chat,null,readExperienceReport(chat),now).status,'ready');
 const stopped={id:chat.threadId,cwd:root,observedState:'idle',observedAt:new Date(now-2000).toISOString(),event:'Stop',turnId:'turn',source:'codex-hook'};
 assert.equal(experienceProgress(chat,stopped,undefined,now).status,'paused');
 const complete={version:1,sourceId:chat.sourceId,threadId:chat.threadId,stage:'completed',summary:'已执行 ingest 并检查',updatedAt:new Date(now-1000).toISOString()};
 writeFileSync(chat.progressPath,JSON.stringify(complete));assert.equal(experienceProgress(chat,stopped,readExperienceReport(chat),now).status,'reported_complete');
 const active={...stopped,observedState:'running',event:'UserPromptSubmit',observedAt:new Date(now).toISOString()};
 assert.equal(experienceProgress(chat,active,readExperienceReport(chat),now).status,'running');
 writeFileSync(chat.progressPath,JSON.stringify({...complete,threadId:randomUUID()}));assert.equal(readExperienceReport(chat),undefined);
 rmSync(chat.progressPath);symlinkSync(chat.sourcePath,chat.progressPath);assert.equal(readExperienceReport(chat),undefined);
 rmSync(chat.progressPath);execFileSync('mkfifo',[chat.progressPath]);
 const probe=spawnSync(process.execPath,['--input-type=module','-e',`import{readExperienceReport}from ${JSON.stringify(new URL('../src/experience-chat.ts',import.meta.url).href)};if(readExperienceReport(${JSON.stringify(chat)})!==undefined)process.exit(2);`],{timeout:1000});assert.equal(probe.status,0,probe.error?.message);
});

test('capture instructions resolve local rules and distinguish the main ingest workflow from batch workers', t => {
 const root=mkdtempSync(join(tmpdir(),'experience-rules-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const sourceId=randomUUID(),threadId=randomUUID(),wikiRoot=join(root,'40-LLM-Wiki','wiki');
 const context=prepareExperienceContext(join(root,'private'),sourceId,[{turnId:'t',item:{id:'i',type:'agentMessage',text:'evidence'}}]);
 const chat=writeExperienceTask({...context,sourceId,threadId,createdAt:new Date().toISOString(),title:'来源',wikiRoot,vaultRoot:root,ingestSkill:'/plugin/skills/wiki-ingest/SKILL.md'});
 const prompt=readFileSync(chat.contextPath,'utf8');
 for(const path of [join(root,'AGENTS.md'),join(root,'CLAUDE.md'),join(root,'40-LLM-Wiki','AGENTS.md'),join(root,'40-LLM-Wiki','CLAUDE.md')])assert.ok(prompt.includes(path),path);
 for(const text of ['llm-wiki-ingest/SKILL.md','agents/wiki-ingest.md','知识库项目根目录','日志末尾追加','现存 manifest','已验证事实','用户转述','待评估方案','来源覆盖','不作为建页数量指标','不会自动取消审核','本轮只读','人读文档的锁','工具产生的持久配置','约束等价'])assert.ok(prompt.includes(text),text);
 assert.ok(prompt.indexOf('先读取本机规范')<prompt.indexOf('提取候选'));
 assert.ok(prompt.includes('wiki/chats/code/'));
});
