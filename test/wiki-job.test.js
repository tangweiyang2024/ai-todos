import { test } from 'node:test'; import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'; import {join} from 'node:path'; import {tmpdir} from 'node:os'; import {randomUUID} from 'node:crypto';
import { WikiExperience } from '../src/wiki-experience.ts';
test('checkpointed analysis resumes only for the identical snapshot and persists across restart', t => {
 const dir=mkdtempSync(join(tmpdir(),'wiki-job-')); t.after(()=>rmSync(dir,{recursive:true,force:true})); mkdirSync(join(dir,'wiki')); let db=new WikiExperience(join(dir,'db'),join(dir,'wiki')); const session=randomUUID();
 const job=db.startAnalysis(session); db.beginAnalysis(job.id,'a'.repeat(64),2); db.saveAnalysisChunk(job.id,0,{sessionSummary:'one',items:[]}); db.close();
 db=new WikiExperience(join(dir,'db'),join(dir,'wiki')); t.after(()=>db.close()); assert.equal(db.analysisChunk(job.id,0).sessionSummary,'one');
 db.beginAnalysis(job.id,'a'.repeat(64),2); assert.ok(db.analysisChunk(job.id,0));
 db.beginAnalysis(job.id,'b'.repeat(64),2); assert.equal(db.analysisChunk(job.id,0),undefined);
});

test('model choice persists on jobs and candidates, and a different model never reuses failed checkpoints', t => {
 const dir=mkdtempSync(join(tmpdir(),'wiki-model-job-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));mkdirSync(join(dir,'wiki'));
 let db=new WikiExperience(join(dir,'db'),join(dir,'wiki'));
 const session=randomUUID(),first={model:'model-a',reasoningEffort:'high'},second={model:'model-b',reasoningEffort:'low'};
 const job=db.startAnalysis(session,first);assert.deepEqual(job.modelSelection,first);
 db.beginAnalysis(job.id,'a'.repeat(64),1);db.saveAnalysisChunk(job.id,0,{sessionSummary:'cached',items:[]});db.updateAnalysis(job.id,{status:'failed',error:'interrupted'});
 assert.equal(db.startAnalysis(session,first).id,job.id);db.updateAnalysis(job.id,{status:'failed'});
 const other=db.startAnalysis(session,second);assert.notEqual(other.id,job.id);assert.equal(db.analysisChunk(other.id,0),undefined);
 const record=db.completeAnalysis(other.id,{summary:'',scope:'',evidence:'',unverified:'',relation:'',reviewNote:'',changes:[],sources:[],workflow:{sessionSummary:'test',stage:'review',items:[]}});
 assert.deepEqual(record.modelSelection,second);db.close();
 db=new WikiExperience(join(dir,'db'),join(dir,'wiki'));t.after(()=>db.close());assert.deepEqual(db.get(record.id).modelSelection,second);assert.deepEqual(db.modelPreference(),second);
});

test('native jobs persist thread recovery only for the same snapshot, model and engine', t => {
 const dir=mkdtempSync(join(tmpdir(),'wiki-native-job-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));mkdirSync(join(dir,'wiki'));
 let db=new WikiExperience(join(dir,'db'),join(dir,'wiki'));const id=randomUUID(),model={model:'a',reasoningEffort:'low'};
 const legacy=db.startAnalysis(id,model);db.updateAnalysis(legacy.id,{status:'failed'});
 const job=db.startAnalysis(id,model,'native-codex-v1');assert.notEqual(job.id,legacy.id);
 db.beginNativeAnalysis(job.id,'a'.repeat(64),3);const agent={threadId:'native-thread',startedAt:'2026-11-16T00:00:00Z',lastActivityAt:'2026-11-16T00:01:00Z',lastEvent:'tool',toolCalls:2,compactions:0,attempt:1};
 db.updateAnalysis(job.id,{agent,status:'failed'});db.close();db=new WikiExperience(join(dir,'db'),join(dir,'wiki'));t.after(()=>db.close());
 assert.equal(db.startAnalysis(id,model,'native-codex-v1').id,job.id);
 assert.deepEqual(db.beginNativeAnalysis(job.id,'a'.repeat(64),3),agent);
 assert.equal(db.beginNativeAnalysis(job.id,'b'.repeat(64),3),undefined);assert.equal(db.latestAnalysis(id).agent,undefined);
});
