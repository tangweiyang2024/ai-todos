import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readWikiModels, validateWikiModel } from '../src/wiki-models.ts';
import { selectionForWikiModel } from '../ui/wiki-model-selection.ts';

const model=(name,efforts=['medium','ultra'])=>({id:name,model:name,displayName:name,defaultReasoningEffort:efforts[0]??null,supportedReasoningEfforts:efforts.map(reasoningEffort=>({reasoningEffort,description:''}))});

test('model catalog reads all pages and rejects repeated cursors', async () => {
  const calls=[];
  const models=await readWikiModels(async(method,params)=>{calls.push(params);assert.equal(method,'model/list');return params.cursor?{data:[model('second')],nextCursor:null}:{data:[model('first')],nextCursor:'next'};});
  assert.deepEqual(models.map(x=>x.model),['first','second']);assert.equal(calls[0].includeHidden,false);
  await assert.rejects(readWikiModels(async()=>({data:[],nextCursor:'loop'})),/分页异常/);
});

test('reasoning options follow the selected model rather than a fixed enum or another model', () => {
  const a=model('a'),b=model('b',['low']),plain=model('plain',[]);
  assert.deepEqual(selectionForWikiModel(a,{model:'other',reasoningEffort:'ultra'}),{model:'a',reasoningEffort:'ultra'});
  assert.deepEqual(selectionForWikiModel(b,{model:'a',reasoningEffort:'ultra'}),{model:'b',reasoningEffort:'low'});
  assert.deepEqual(validateWikiModel([a],{model:'a',reasoningEffort:'ultra'}),{model:'a',reasoningEffort:'ultra'});
  assert.throws(()=>validateWikiModel([b],{model:'b',reasoningEffort:'high'}),/推理强度/);
  assert.throws(()=>validateWikiModel([a],{model:'missing',reasoningEffort:'ultra'}),/不可用/);
  assert.deepEqual(selectionForWikiModel(plain,null),{model:'plain',reasoningEffort:null});
  assert.deepEqual(validateWikiModel([plain],{model:'plain',reasoningEffort:null}),{model:'plain',reasoningEffort:null});
});
