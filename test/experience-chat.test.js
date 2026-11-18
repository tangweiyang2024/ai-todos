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
