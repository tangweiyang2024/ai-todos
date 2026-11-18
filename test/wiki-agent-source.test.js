import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareAgentSource } from '../src/wiki-agent-source.ts';

test('private snapshot tools cover every source character and refuse tampering or incomplete results', t => {
  const dir = mkdtempSync(join(tmpdir(), 'native-source-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const items = [{ turnId: 'turn-one', item: { type: 'agentMessage', id: 'item-one', text: '中文😀'.repeat(15000) } }];
  const source = prepareAgentSource(dir, items, 'model-a/high');
  assert.ok(source.total > 2);
  assert.equal(statSync(source.directory).mode & 0o777, 0o700);
  assert.throws(() => source.assertComplete(), /未读取/);
  assert.throws(() => source.read(-1), /页/);
  const fragments = Array.from({ length: source.total }, (_, page) => source.read(page)).flat();
  source.assertComplete();
  assert.equal(fragments.filter(f => f.field === 'text').map(f => f.value).join(''), items[0].item.text);
  assert.ok(fragments.every(f => f.turnId === 'turn-one' && f.itemId === 'item-one'));
  assert.equal(prepareAgentSource(dir, items, 'model-a/high').hash, source.hash);
  assert.notEqual(prepareAgentSource(dir, items, 'model-b/low').hash, source.hash);
  const file = join(source.directory, 'source.json');
  writeFileSync(file, readFileSync(file, 'utf8').replace('中文', '改文'));
  assert.throws(() => prepareAgentSource(dir, items, 'model-a/high'), /快照/);
});

test('source evidence must contain a complete turn and item identifier', async () => {
  const { assertSourceEvidence } = await import('../src/wiki-agent-source.ts');
  assert.doesNotThrow(() => assertSourceEvidence('依据：t/i，支持结论。', ['t/i']));
  assert.throws(() => assertSourceEvidence('t/item-does-not-exist', ['t/i']), /引用/);
  assert.throws(() => assertSourceEvidence('prefix-t/i-typo', ['t/i']), /引用/);
  assert.throws(() => assertSourceEvidence('t/unknown', ['t/i']), /引用/);
});
