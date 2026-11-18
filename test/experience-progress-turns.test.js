import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/domain.ts';
import { prepareExperienceContext, writeExperienceTask } from '../src/experience-chat.ts';

for (const exactStart of [false, true]) test(`a new already-finished turn invalidates the old report and retains its own completion (exact start: ${exactStart})`, t => {
  const dir = mkdtempSync(join(tmpdir(), 'experience-turns-')), base = Date.now() - 20000;
  const store = new Store(join(dir, 'db'), () => base + 8000), sourceId = randomUUID(), threadId = randomUUID();
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  store.observe({ session_id: sourceId, hook_event_name: 'Stop', cwd: dir });
  const chat = writeExperienceTask({ ...prepareExperienceContext(dir, sourceId, [{ turnId: 'source', item: { id: 'evidence', type: 'agentMessage', text: '证据' } }]), sourceId, threadId, title: '来源', createdAt: new Date(base).toISOString(), wikiRoot: dir, vaultRoot: dir, ingestSkill: '/test/SKILL.md' });
  store.registerExperienceChat(chat);
  const iso = offset => new Date(base + offset).toISOString();
  const sync = (turnId, at, startedAt) => store.syncCodexThreads([{ id: threadId, title: '沉淀', cwd: dir, state: 'idle', updatedAt: iso(at), observation: { source: 'codex-rollout', event: 'task_complete', turnId, observedAt: iso(at), ...(startedAt === undefined ? {} : { experienceStartedAt: iso(startedAt) }) } }], false);
  const report = at => writeFileSync(chat.progressPath, JSON.stringify({ version: 1, sourceId, threadId, stage: 'completed', summary: '完成回报', updatedAt: iso(at) }));
  sync('old-turn', 2000, 100); report(1000);
  assert.equal(store.sessions()[0].experience.status, 'reported_complete');
  sync('new-turn', 6000, exactStart ? 3000 : undefined);
  assert.equal(store.sessions()[0].experience.status, 'paused');
  report(5000); sync('new-turn', 6000, exactStart ? 3000 : undefined);
  assert.equal(store.sessions()[0].experience.status, exactStart ? 'reported_complete' : 'paused', '有真实开始点时保留本轮回报；没有时不猜测结束前回报的轮次');
  report(6500);
  assert.equal(store.sessions()[0].experience.status, 'reported_complete');
});

test('a late report from the previously running turn cannot survive an unobserved new turn', t => {
  const dir = mkdtempSync(join(tmpdir(), 'experience-missed-turn-')), base = Date.now() - 20000;
  const store = new Store(join(dir, 'db'), () => base + 8000), sourceId = randomUUID(), threadId = randomUUID();
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  store.observe({ session_id: sourceId, hook_event_name: 'Stop', cwd: dir });
  const chat = writeExperienceTask({ ...prepareExperienceContext(dir, sourceId, [{ turnId: 'source', item: { id: 'evidence', type: 'agentMessage', text: '证据' } }]), sourceId, threadId, title: '来源', createdAt: new Date(base).toISOString(), wikiRoot: dir, vaultRoot: dir, ingestSkill: '/test/SKILL.md' });
  store.registerExperienceChat(chat);
  const iso = offset => new Date(base + offset).toISOString();
  const sync = (turnId, state, at) => store.syncCodexThreads([{ id: threadId, title: '沉淀', cwd: dir, state, updatedAt: iso(at), observation: { source: 'codex-rollout', event: state === 'running' ? 'task_started' : 'task_complete', turnId, observedAt: iso(at) } }], false);
  sync('old-turn', 'running', 1000);
  writeFileSync(chat.progressPath, JSON.stringify({ version: 1, sourceId, threadId, stage: 'completed', summary: '上一轮晚回报', updatedAt: iso(2000) }));
  sync('new-turn', 'idle', 6000);
  assert.equal(store.sessions()[0].experience.status, 'paused');
});
