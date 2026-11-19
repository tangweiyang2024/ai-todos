import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/domain.ts';
import { ExperiencePreparations } from '../src/experience-preparation.ts';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'experience-preparation-')), path = join(dir, 'db');
  const store = new Store(path), sourceId = randomUUID(), threadId = randomUUID();
  store.observe({ session_id: sourceId, hook_event_name: 'Stop', cwd: dir });
  const chat = { sourceId, threadId, title: '后台准备', createdAt: store.at(), sourcePath: join(dir, 'source'), sourceHash: 'hash', contextPath: join(dir, 'task'), progressPath: join(dir, 'progress'), wikiRoot: dir, vaultRoot: dir };
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { store, sourceId, chat, path };
}
async function settled(store, sourceId) {
  for (let i = 0; i < 50; i++) {
    const job = store.meta(`experience.preparation.${sourceId}`, null);
    if (job?.status !== 'preparing') return job;
    await new Promise(r => setTimeout(r, 5));
  }
  assert.fail('准备任务未结束');
}

test('a failed preparation reuses its persisted checkpoint and a stale notice cannot acknowledge the retry', async t => {
  const { store, sourceId, chat } = fixture(t);
  let attempts = 0;
  const manager = new ExperiencePreparations(store, async (id, options) => {
    assert.equal(id, sourceId); attempts++;
    if (attempts === 1) { options.onStage('seeding', chat); throw new Error('命名暂时失败'); }
    assert.equal(options.resume.threadId, chat.threadId);
    return chat;
  });
  const first = manager.start(sourceId).job;
  assert.equal(manager.start(sourceId).job.id, first.id);
  const failed = await settled(store, sourceId);
  assert.equal(failed.status, 'failed'); assert.equal(failed.retryAllowed, true);
  assert.equal(store.sessions()[0].experiencePreparation.checkpoint, undefined);
  const retried = manager.start(sourceId).job;
  assert.notEqual(first.id, retried.id);
  await settled(store, sourceId);
  assert.equal(attempts, 2); assert.equal(store.sessions()[0].experiencePreparation.unread, true);
  assert.throws(() => manager.acknowledge(sourceId, first.id), { status: 409 });
  manager.acknowledge(sourceId, retried.id);
  assert.equal(store.sessions()[0].experiencePreparation.unread, false);
  assert.equal(manager.start(sourceId).job.id, retried.id);
  await manager.stop();
});

test('restart preserves ready notices, marks interrupted reads retryable, and blocks ambiguous creation retries', async t => {
  const { store, sourceId, chat, path } = fixture(t);
  const manager = new ExperiencePreparations(store, async () => chat);
  manager.start(sourceId); const ready = await settled(store, sourceId);
  const reopened = new Store(path);
  try {
    new ExperiencePreparations(reopened, async () => { throw new Error('不应自动准备'); });
    assert.equal(reopened.sessions()[0].experiencePreparation.unread, true);
    reopened.setMeta(`experience.preparation.${sourceId}`, { ...ready, status: 'preparing', stage: 'reading', unread: false });
    // 删除成功关联，模拟另一份尚未创建线程的中断任务。
    reopened.db.prepare('DELETE FROM meta WHERE key=?').run(`experience.chat.${sourceId}`);
    const resumed = new ExperiencePreparations(reopened, async () => chat);
    assert.equal(reopened.sessions()[0].experiencePreparation.retryAllowed, true);
    assert.equal(reopened.sessions()[0].experiencePreparation.status, 'failed');
    reopened.setMeta(`experience.preparation.${sourceId}`, { ...ready, status: 'preparing', stage: 'creating', unread: false });
    const uncertain = new ExperiencePreparations(reopened, async () => chat);
    assert.equal(reopened.sessions()[0].experiencePreparation.retryAllowed, false);
    assert.throws(() => uncertain.start(sourceId), /核对/);
    await resumed.stop(); await uncertain.stop();
  } finally { reopened.close(); }
  await manager.stop();
});

test('shutdown cannot report ready when a dependency resolves after cancellation', async t => {
  const { store, sourceId, chat } = fixture(t);
  const manager = new ExperiencePreparations(store, async (_id, { signal }) => new Promise(resolve => {
    signal.addEventListener('abort', () => resolve(chat), { once: true });
  }));
  manager.start(sourceId);
  await new Promise(r => setTimeout(r, 0));
  await manager.stop();
  assert.equal(store.sessions()[0].experiencePreparation.status, 'failed');
  assert.equal(store.sessions()[0].experiencePreparation.unread, false);
});

test('automatic capture is not ready until native extraction completes and pins the chosen default', async t => {
  const { store, sourceId, chat } = fixture(t);
  let finish, calls = 0;
  const selected = { model: 'test-model', reasoningEffort: 'high' };
  const manager = new ExperiencePreparations(store, async () => chat, async (_chat, options) => {
    calls++; assert.deepEqual(options.modelSelection, selected);
    await new Promise(resolve => { finish = resolve; });
  });
  manager.start(sourceId, selected);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(store.sessions()[0].experiencePreparation.stage, 'extracting');
  assert.equal(store.sessions()[0].experiencePreparation.status, 'preparing');
  assert.equal(manager.start(sourceId, {model:'other', reasoningEffort:null}).job.modelSelection.model,'test-model');
  finish(); await settled(store, sourceId);
  assert.equal(store.sessions()[0].experiencePreparation.unread,true);
  assert.equal(calls,1); await manager.stop();
});

test('restart during extraction never misreports an existing prepared chat as completed', async t => {
  const { store, sourceId, chat } = fixture(t);
  store.registerExperienceChat(chat);
  store.setMeta(`experience.preparation.${sourceId}`, { id: randomUUID(), sourceId, status:'preparing', stage:'extracting', createdAt:store.at(),updatedAt:store.at(),unread:false,retryAllowed:true,timings:{},checkpoint:chat,modelSelection:{model:'test',reasoningEffort:null} });
  store.setMeta(`experience.initial.${chat.threadId}`, {status:'running'});
  const manager = new ExperiencePreparations(store, async () => chat, async () => assert.fail('不得重发'));
  assert.equal(store.sessions()[0].experiencePreparation.status,'failed');
  assert.equal(store.sessions()[0].experiencePreparation.retryAllowed,false);
  await manager.stop();
});

test('restart after seeding an automatic capture does not claim extraction is complete', async t => {
  const {store,sourceId,chat}=fixture(t);store.registerExperienceChat(chat);
  store.setMeta(`experience.preparation.${sourceId}`,{id:randomUUID(),sourceId,status:'preparing',stage:'seeding',createdAt:store.at(),updatedAt:store.at(),unread:false,retryAllowed:true,timings:{},checkpoint:chat,modelSelection:{model:'test',reasoningEffort:null}});
  const manager=new ExperiencePreparations(store,async()=>chat,async()=>{});
  assert.equal(store.sessions()[0].experiencePreparation.status,'failed');
  assert.equal(store.sessions()[0].experiencePreparation.unread,false);
  assert.equal(store.sessions()[0].experiencePreparation.retryAllowed,true);
  await manager.stop();
});

test('reusing an already started native conversation does not announce a fresh extraction result', async t => {
  const {store,sourceId,chat}=fixture(t);
  const manager=new ExperiencePreparations(store,async()=>chat,async()=> 'reused');
  manager.start(sourceId,{model:'test',reasoningEffort:null});const result=await settled(store,sourceId);
  assert.equal(result.status,'ready');assert.equal(result.unread,false);
  await manager.stop();
});
