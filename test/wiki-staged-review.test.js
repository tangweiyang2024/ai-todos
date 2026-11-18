import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WikiExperience } from '../src/wiki-experience.ts';

test('staged review persists each decision and requires a fresh confirmed version before comparison', t => {
  const dir = mkdtempSync(join(tmpdir(), 'wiki-stage-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = join(dir, 'wiki'); mkdirSync(root); writeFileSync(join(root, 'index.md'), 'original');
  let store = new WikiExperience(join(dir, 'db'), root);
  const item = { title: '经验', conclusion: '结论', scope: '范围', evidence: 'turn/item', unverified: '', decision: 'pending', note: '' };
  const base = { summary: '', scope: '', evidence: '', unverified: '', relation: '', reviewNote: '', changes: [], sources: [], workflow: { sessionSummary: '处理过程', items: [item, { ...item, title: '另一项' }], stage: 'review' } };
  let record = store.create(randomUUID(), base);
  assert.throws(() => store.prepare(record.id, record.revision), /先完成/);
  const comparison = { ...base, workflow: undefined, summary: '对照', changes: [{ path: 'index.md', content: 'updated' }] };
  assert.throws(() => store.saveComparison(record.id, record.revision, comparison), /逐项确认/);
  record = store.update(record.id, record.revision, { ...record.data, workflow: { ...record.data.workflow, items: [{ ...item, decision: 'confirmed', note: '保留' }, { ...item, title: '另一项', decision: 'excluded', note: '不适用' }] } });
  store.close(); store = new WikiExperience(join(dir, 'db'), root); t.after(() => store.close());
  assert.equal(store.get(record.id).data.workflow.items[0].note, '保留');
  assert.throws(() => store.update(record.id, record.revision, { ...record.data, workflow: { ...record.data.workflow, stage: 'compared' } }), /结构/);
  assert.throws(() => store.saveComparison(record.id, record.revision - 1, comparison), /版本/);
  record = store.saveComparison(record.id, record.revision, comparison);
  assert.equal(record.data.workflow.stage, 'compared');
  assert.equal(readFileSync(join(root, 'index.md'), 'utf8'), 'original');
  assert.equal(store.prepare(record.id, record.revision).files[0].after, 'updated');
});
