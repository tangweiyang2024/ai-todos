import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extractExperience } from '../src/wiki-extract.ts';

test('checks selected Wiki pages and prepares reviewed log changes without writing files', async t => {
  const root = mkdtempSync(join(tmpdir(), 'wiki-extract-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'entities')); writeFileSync(join(root, 'index.md'), '# Index\n[[kcard]]\n'); writeFileSync(join(root, 'log.md'), '# Log\n'); writeFileSync(join(root, 'entities', 'kcard.md'), '# Kcard\n原结论\n');
  const calls = [];
  const result = await extractExperience({ root, items: [{ turnId: 't1', item: { id: 'i1', type: 'agentMessage', text: '新证据' } }], ask: async (kind, input) => {
    calls.push({ kind, input });
    if (kind === 'select') return { paths: ['entities/kcard.md'] };
    assert.equal(input.pages[0].content, '# Kcard\n原结论\n');
    return { summary: '结论', scope: '范围', evidence: 't1/i1', unverified: '待核实', relation: '可能冲突', changes: [{ path: 'entities/kcard.md', content: '# Kcard\n原结论\n新证据\n' }] };
  } });
  assert.equal(calls.length, 2); assert.deepEqual(result.changes.map(c => c.path), ['entities/kcard.md', 'log.md']);
  assert.equal(readFileSync(join(root, 'entities', 'kcard.md'), 'utf8'), '# Kcard\n原结论\n');
  assert.match(result.changes[1].content, /结论/); assert.ok(result.changes.every(c => c.baseHash));
});

test('rejects invented page paths and represents no valuable experience without writes', async t => {
  const root = mkdtempSync(join(tmpdir(), 'wiki-extract-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'index.md'), '# Index'); writeFileSync(join(root, 'log.md'), '# Log');
  const items = [{ turnId: 't', item: { id: 'i', type: 'agentMessage' } }];
  await assert.rejects(extractExperience({ root, items, ask: async () => ({ paths: ['../outside.md'] }) }), /页面|路径/);
  const empty = await extractExperience({ root, items, ask: async kind => kind === 'select' ? { paths: [] } : { summary: '未发现值得沉淀的经验', scope: '', evidence: '', unverified: '', relation: '', changes: [] } });
  assert.deepEqual(empty.changes, []); assert.match(empty.summary, /未发现/);
});

test('records the index and all examined pages as review dependencies', async t => {
  const root = mkdtempSync(join(tmpdir(), 'wiki-extract-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'entities')); writeFileSync(join(root, 'index.md'), '# Index'); writeFileSync(join(root, 'log.md'), '# Log'); writeFileSync(join(root, 'entities/a.md'), 'A'); writeFileSync(join(root, 'entities/b.md'), 'B');
  const data = await extractExperience({root, items:[{turnId:'t',item:{id:'i',type:'agentMessage'}}], ask:async kind => kind === 'select' ? {paths:['entities/a.md','entities/b.md']} : {summary:'S',scope:'',evidence:'',unverified:'',relation:'',changes:[{path:'entities/a.md',content:'AA'}]}});
  assert.deepEqual(data.sources.map(item=>item.path),['index.md','entities/a.md','entities/b.md']);
});

test('new knowledge previews both Vault and Wiki notes with index and log changes', async t => {
  const vault = mkdtempSync(join(tmpdir(), 'wiki-dual-')); t.after(() => rmSync(vault, { recursive: true, force: true }));
  const root = join(vault, '40-LLM-Wiki', 'wiki'); mkdirSync(join(root, 'concepts'), { recursive: true }); mkdirSync(join(vault, '20领域', 'tools'), { recursive: true });
  writeFileSync(join(root, 'index.md'), '# Index\n'); writeFileSync(join(root, 'log.md'), '# Log\n');
  const result = await extractExperience({ root, vaultRoot: vault, items: [{ turnId: 't', item: { id: 'i', type: 'agentMessage' } }], ask: async kind => kind === 'select' ? { paths: [] } : {
    summary: '新工具经验', scope: '工具', evidence: 't/i', unverified: '', relation: '无相似页面', changes: [], newNotes: [{ wikiPath: 'concepts/example.md', wikiContent: '---\ntags: [tool]\nupdated: 2026-11-13\n---\n# Example\n[[index]]\n', humanPath: '20领域/tools/example.md', humanContent: '# 使用经验\n步骤\n' }],
  } });
  assert.deepEqual(result.changes.map(c => c.path), ['concepts/example.md', '@vault/20领域/tools/example.md', 'index.md', 'log.md']);
  assert.match(result.changes.find(c => c.path === 'index.md').content, /\[\[concepts\/example\]\]/);
  assert.equal(readFileSync(join(root, 'index.md'), 'utf8'), '# Index\n');
});

test('customer notes add a business-scenario link to the reviewed human index', async t => {
  const vault = mkdtempSync(join(tmpdir(), 'wiki-faq-')); t.after(() => rmSync(vault, { recursive: true, force: true }));
  const root = join(vault, '40-LLM-Wiki', 'wiki'); const customer = join(vault, '20领域', '50-业务域', '客服知识库');
  mkdirSync(join(root, 'sources'), { recursive: true }); mkdirSync(join(customer, '免佣与飞涨'), { recursive: true });
  writeFileSync(join(root, 'index.md'), '# Index\n'); writeFileSync(join(root, 'log.md'), '# Log\n'); writeFileSync(join(customer, '_INDEX.md'), '# 客服索引\n');
  const data = await extractExperience({ root, vaultRoot: vault, items: [{ turnId: 't', item: { id: 'i', type: 'agentMessage' } }], ask: async kind => kind === 'select' ? { paths: [] } : {
    summary: '客服排查', scope: '', evidence: 't/i', unverified: '', relation: '', changes: [], newNotes: [{ wikiPath: 'sources/case.md', wikiContent: '---\ntags: [faq]\nupdated: 2026-11-13\n---\n# Case\n[[index]]\n', humanPath: '20领域/50-业务域/客服知识库/免佣与飞涨/案例.md', humanContent: '# 客服案例\n内容\n' }],
  } });
  const entry = data.changes.find(c => c.path === '@vault/20领域/50-业务域/客服知识库/_INDEX.md');
  assert.match(entry.content, /\[\[免佣与飞涨\/案例\]\]/); assert.match(entry.content, /^# 客服索引/);
  assert.ok(data.sources.some(source => source.path === entry.path));
});

test('existing human notes are compared and can be updated instead of duplicated', async t => {
  const vault = mkdtempSync(join(tmpdir(), 'wiki-existing-human-')); t.after(() => rmSync(vault, { recursive: true, force: true }));
  const root = join(vault, '40-LLM-Wiki', 'wiki'); mkdirSync(join(root, 'concepts'), { recursive: true }); mkdirSync(join(vault, '20领域', 'tools'), { recursive: true });
  writeFileSync(join(root, 'index.md'), '# Index'); writeFileSync(join(root, 'log.md'), '# Log'); writeFileSync(join(vault, '20领域/tools/existing.md'), '# 现有经验\n旧内容');
  const data = await extractExperience({ root, vaultRoot: vault, items: [{ turnId: 't', item: { id: 'i', type: 'agentMessage' } }], ask: async (kind, input) => {
    if (kind === 'select') { assert.ok(input.humanPaths.includes('20领域/tools/existing.md')); return { paths: [], humanPaths: ['20领域/tools/existing.md'] }; }
    assert.equal(input.humanPages[0].content, '# 现有经验\n旧内容');
    return { summary: '新经验', scope: '', evidence: '', unverified: '', relation: '补充现有', changes: [], newNotes: [{ wikiPath: 'concepts/new.md', wikiContent: '---\ntags: [tool]\nupdated: 2026-11-13\n---\n# 新经验\n[[index]]\n', humanPath: '20领域/tools/existing.md', humanContent: '# 现有经验\n旧内容\n补充' }] };
  } });
  const human = data.changes.find(c => c.path === '@vault/20领域/tools/existing.md'); assert.ok(human); assert.notEqual(human.baseHash, undefined);
  assert.ok(data.sources.some(source => source.path === human.path));
});

test('deeply nested existing human notes participate in duplicate detection', async t => {
  const vault = mkdtempSync(join(tmpdir(), 'wiki-human-deep-')); t.after(() => rmSync(vault, { recursive: true, force: true }));
  const root = join(vault, '40-LLM-Wiki', 'wiki'); mkdirSync(root, { recursive: true });
  mkdirSync(join(vault, '10项目/a/b/c'), { recursive: true }); writeFileSync(join(vault, '10项目/a/b/c/existing.md'), '内容');
  writeFileSync(join(root, 'index.md'), '# Index'); writeFileSync(join(root, 'log.md'), '# Log');
  await extractExperience({ root, vaultRoot: vault, items: [{ turnId: 't', item: { id: 'i', type: 'agentMessage' } }], ask: async (kind, input) => {
    if (kind === 'select') { assert.ok(input.humanPaths.includes('10项目/a/b/c/existing.md')); return { paths: [], humanPaths: [] }; }
    return { summary: '无新增', scope: '', evidence: '', unverified: '', relation: '', changes: [] };
  } });
});
