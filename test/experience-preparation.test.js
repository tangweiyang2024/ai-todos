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

async function waitRecord(store, sourceId, recordId) {
  for (let i = 0; i < 100; i++) {
    const record = store.sessions().find(s => s.id === sourceId).experienceRecords?.find(r => r.id === recordId);
    if (record && record.preparation?.status !== 'preparing') return record;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.fail('指定沉淀记录未结束');
}

test('each accepted capture has its own notice, thread, focus and immutable source reference', async t => {
  const { store, sourceId, chat, path } = fixture(t);
  const firstId = randomUUID(), secondId = randomUUID();
  let created = 0;
  const manager = new ExperiencePreparations(store, async (_id, options) => {
    created++;
    if (options.recordId === secondId) assert.equal(options.previousSourcePath, chat.sourcePath);
    return { ...chat, threadId: options.recordId, sourceCapturedAt: '2026-11-20T01:00:00.000Z' };
  });
  const first = manager.start(sourceId, undefined, { recordId: firstId, focus: '维护人' }).job;
  assert.equal(manager.start(sourceId, undefined, { recordId: firstId }).job.id, first.id);
  assert.throws(() => manager.start(sourceId, undefined, { recordId: secondId }), { status: 409 });
  await waitRecord(store, sourceId, firstId);
  manager.start(sourceId, undefined, { recordId: secondId });
  await waitRecord(store, sourceId, secondId);
  manager.acknowledge(sourceId, first.id);
  assert.equal(manager.start(sourceId, undefined, { recordId: firstId }).job.id, first.id);
  assert.equal(created, 2);

  const reopened = new Store(path);
  try {
    const [source] = reopened.sessions();
    assert.deepEqual(source.experienceRecords.map(r => [r.id, r.focus, r.experience.threadId, r.preparation.unread]), [
      [secondId, undefined, secondId, true], [firstId, '维护人', firstId, false],
    ]);
    assert.equal(source.experienceRecords[1].sourceCapturedAt, '2026-11-20T01:00:00.000Z');
    assert.equal(reopened.experienceChatForThread(firstId).threadId, firstId);
    assert.equal(reopened.experienceRecordChat(sourceId, secondId).threadId, secondId);
    assert.equal(reopened.experienceRecordChat(randomUUID(), secondId), null);
    for (const threadId of [firstId, secondId]) reopened.observe({ session_id: threadId, hook_event_name: 'Stop', cwd: chat.vaultRoot });
    assert.deepEqual(reopened.sessions().map(s => s.id), [sourceId]);
  } finally { reopened.close(); }
  await manager.stop();
});

test('a record retry retains the original snapshot, selection and focus after another capture', async t => {
  const { store, sourceId, chat } = fixture(t);
  const recordId = randomUUID(), anotherId = randomUUID();
  const snapshot = { sourcePath: chat.sourcePath, sourceHash: 'original', sourceCapturedAt: store.at() };
  const selected = { model: 'model-a', reasoningEffort: 'high' };
  let attempts = 0;
  const manager = new ExperiencePreparations(store, async (_id, options) => {
    if (options.recordId === recordId && ++attempts === 1) {
      options.onSourceSnapshot(snapshot);
      options.onStage('connecting');
      throw new Error('connection failed');
    }
    if (options.recordId === recordId) {
      assert.deepEqual(options.sourceSnapshot, snapshot);
      assert.deepEqual(options.modelSelection, selected);
      assert.equal(options.focus, '工具用法');
      assert.equal(options.previousSourcePath, undefined);
    }
    return { ...chat, threadId: options.recordId };
  });
  const failed = manager.start(sourceId, selected, { recordId, focus: '工具用法' }).job;
  const record = await waitRecord(store, sourceId, recordId);
  assert.equal(record.preparation.status, 'failed');
  assert.equal(record.sourceCapturedAt, snapshot.sourceCapturedAt);
  assert.equal(JSON.stringify(record).includes(snapshot.sourcePath), false);
  assert.equal(manager.start(sourceId, undefined, { recordId }).job.id, failed.id);
  manager.start(sourceId, undefined, { recordId: anotherId });
  await waitRecord(store, sourceId, anotherId);
  const retry = manager.retry(sourceId, recordId).job;
  assert.notEqual(retry.id, failed.id);
  assert.equal((await waitRecord(store, sourceId, recordId)).preparation.status, 'ready');
  assert.equal(store.sessions()[0].experienceRecords[0].id, anotherId);
  assert.equal(attempts, 2);
  await manager.stop();
});

test('legacy preparation and chat appear as one stable record through retries and restart', async t => {
  const { store, sourceId, chat, path } = fixture(t);
  assert.deepEqual(store.sessions()[0].experienceRecords, []);
  store.registerExperienceChat(chat);
  const oldRecord = store.sessions()[0].experienceRecords[0];
  assert.equal(oldRecord.experience.threadId, chat.threadId);
  assert.equal(oldRecord.preparation, undefined);
  const manager = new ExperiencePreparations(store, async (_id, options) => options.recordId ? { ...chat, threadId: options.recordId } : chat);
  const oldJob = manager.start(sourceId).job;
  await waitRecord(store, sourceId, oldRecord.id);
  const nextId = randomUUID();
  manager.start(sourceId, undefined, { recordId: nextId });
  await waitRecord(store, sourceId, nextId);
  const reopened = new Store(path);
  try {
    const restored = new ExperiencePreparations(reopened, async () => assert.fail('不得自动重发'));
    assert.deepEqual(reopened.sessions()[0].experienceRecords.map(r => r.id), [nextId, oldRecord.id]);
    assert.equal(reopened.experienceRecordChat(sourceId, oldRecord.id).threadId, chat.threadId);
    restored.acknowledge(sourceId, oldJob.id);
    assert.equal(reopened.sessions()[0].experienceRecords[1].preparation.unread, false);
    assert.equal(restored.start(sourceId).job.id, reopened.sessions()[0].experienceRecords[0].preparation.id);
    await restored.stop();
  } finally { reopened.close(); }
  await manager.stop();
});

test('a valid submission ID equal to the source ID works when there is no legacy record', async t => {
  const { store, sourceId, chat } = fixture(t);
  const manager = new ExperiencePreparations(store, async () => chat);
  manager.start(sourceId, undefined, { recordId: sourceId });
  await waitRecord(store, sourceId, sourceId);
  assert.equal(store.experienceRecordChat(sourceId, sourceId).threadId, chat.threadId);
  assert.equal(store.sessions()[0].experienceRecords.length, 1);
  await manager.stop();
});

test('a thread or record binding cannot be reassigned to a different capture', async t => {
  const { store, sourceId, chat } = fixture(t);
  const firstId = randomUUID(), nextId = randomUUID();
  store.registerExperienceChat(chat, firstId);
  store.registerExperienceChat(chat, firstId);
  assert.throws(() => store.registerExperienceChat(chat, nextId), /关联/);
  assert.throws(() => store.registerExperienceChat({ ...chat, threadId: randomUUID() }, firstId), /关联/);
  assert.equal(store.experienceRecordChat(sourceId, nextId), null);
  assert.equal(store.experienceRecordChat(sourceId, firstId).threadId, chat.threadId);
});

test('retrying a legacy preparation without a stored model uses the saved capture model', async t => {
  const { store, sourceId, chat } = fixture(t);
  const selection = { model: 'saved-default', reasoningEffort: 'high' };
  store.setMeta('experience.modelPreference', { revision: 1, selection });
  store.setMeta(`experience.preparation.${sourceId}`, {
    id: randomUUID(), sourceId, status: 'failed', stage: 'seeding', createdAt: store.at(), updatedAt: store.at(),
    unread: false, retryAllowed: true, timings: {}, checkpoint: chat,
  });
  const manager = new ExperiencePreparations(store, async (_id, options) => options.resume, async (_chat, options) => {
    assert.deepEqual(options.modelSelection, selection);
  });
  manager.retry(sourceId, sourceId);
  const record = await waitRecord(store, sourceId, sourceId);
  assert.equal(record.preparation.status, 'ready');
  assert.deepEqual(record.preparation.modelSelection, selection);
  await manager.stop();
});

test('restart restores an extracting legacy checkpoint without retrying its uncertain native turn', async t => {
  const { store, sourceId, chat } = fixture(t);
  // 旧数据只保留提取阶段的任务和已知线程断点。
  store.setMeta(`experience.preparation.${sourceId}`, {
    id: randomUUID(), sourceId, status: 'preparing', stage: 'extracting', createdAt: store.at(), updatedAt: store.at(),
    unread: false, retryAllowed: true, timings: {}, checkpoint: chat,
  });
  store.setMeta(`experience.initial.${chat.threadId}`, { status: 'dispatching' });
  const manager = new ExperiencePreparations(store, async () => assert.fail('不得重发'));
  const [record] = store.sessions()[0].experienceRecords;
  assert.equal(record.preparation.retryAllowed, false);
  assert.equal(record.experience.threadId, chat.threadId);
  assert.equal(store.experienceRecordChat(sourceId, record.id).threadId, chat.threadId);
  assert.throws(() => manager.retry(sourceId, record.id), /核对/);
  await manager.stop();
});
