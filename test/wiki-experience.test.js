import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WikiExperience } from '../src/wiki-experience.ts';

test('reviewed changes survive restart, require a fresh revision, and never write on save', t => {
  const dir = mkdtempSync(join(tmpdir(), 'wiki-exp-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const wiki = join(dir, 'wiki'); mkdirSync(wiki); writeFileSync(join(wiki, 'index.md'), 'old\n');
  const id = randomUUID(); let service = new WikiExperience(join(dir, 'db.sqlite'), wiki);
  const record = service.create(id, { summary: '有价值', scope: '测试', evidence: '证据', unverified: '', relation: '相关', reviewNote: '', changes: [{ path: 'index.md', content: 'new\n' }] });
  assert.equal(readFileSync(join(wiki, 'index.md'), 'utf8'), 'old\n');
  const edited = service.update(record.id, record.revision, { ...record.data, reviewNote: '我的判断' });
  assert.throws(() => service.prepare(record.id, record.revision), /版本/);
  service.close(); service = new WikiExperience(join(dir, 'db.sqlite'), wiki); t.after(() => service.close());
  assert.equal(service.list(id)[0].data.reviewNote, '我的判断');
  const preview = service.prepare(edited.id, edited.revision);
  assert.equal(preview.files[0].before, 'old\n');
  assert.equal(preview.files[0].after, 'new\n');
  service.approve(preview);
  assert.equal(readFileSync(join(wiki, 'index.md'), 'utf8'), 'new\n');
  assert.equal(service.list(id)[0].status, 'written');
});

test('approval detects changes after preview, and rejects traversal and symlinks', t => {
  const dir = mkdtempSync(join(tmpdir(), 'wiki-exp-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const wiki = join(dir, 'wiki'); mkdirSync(wiki); writeFileSync(join(wiki, 'index.md'), 'old'); symlinkSync(dir, join(wiki, 'escape'));
  const service = new WikiExperience(join(dir, 'db.sqlite'), wiki); t.after(() => service.close());
  const data = { summary: 's', scope: '', evidence: '', unverified: '', relation: '', reviewNote: '', changes: [{ path: 'index.md', content: 'new' }] };
  const rec = service.create(randomUUID(), data); const preview = service.prepare(rec.id, rec.revision);
  writeFileSync(join(wiki, 'index.md'), 'changed');
  assert.throws(() => service.approve(preview), /变化/); assert.equal(readFileSync(join(wiki, 'index.md'), 'utf8'), 'changed');
  assert.throws(() => service.create(randomUUID(), { ...data, changes: [{ path: '../out.md', content: 'bad' }] }), /路径/);
  const link = service.create(randomUUID(), { ...data, changes: [{ path: 'escape/out.md', content: 'bad' }] });
  assert.throws(() => service.prepare(link.id, link.revision), /路径|链接/);
});

test('refuses a candidate whose Wiki baseline changed since extraction', t => {
  const dir = mkdtempSync(join(tmpdir(), 'wiki-exp-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const wiki = join(dir, 'wiki'); mkdirSync(wiki); writeFileSync(join(wiki, 'index.md'), 'old');
  const service = new WikiExperience(join(dir, 'db.sqlite'), wiki); t.after(() => service.close());
  const record = service.create(randomUUID(), { summary: 's', scope: '', evidence: '', unverified: '', relation: '', reviewNote: '', changes: [{ path: 'index.md', content: 'new', baseHash: '0'.repeat(64) }] });
  assert.throws(() => service.prepare(record.id, record.revision), /变化/);
});

test('editing a candidate cannot change reviewed target paths or source baselines', t => {
  const dir = mkdtempSync(join(tmpdir(), 'wiki-exp-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const wiki = join(dir, 'wiki'); mkdirSync(wiki); writeFileSync(join(wiki, 'index.md'), 'old');
  const service = new WikiExperience(join(dir, 'db.sqlite'), wiki); t.after(() => service.close());
  const record = service.create(randomUUID(), { summary: 's', scope: '', evidence: '', unverified: '', relation: '', reviewNote: '', changes: [{ path: 'index.md', content: 'new', baseHash: '0'.repeat(64) }] });
  assert.throws(() => service.update(record.id, record.revision, { ...record.data, changes: [{ path: 'index.md', content: 'new', baseHash: '1'.repeat(64) }] }), /来源|路径/);
});

test('recovery preserves ambiguous interrupted writes and refuses to overwrite external edits', t => {
  const dir = mkdtempSync(join(tmpdir(), 'wiki-exp-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const wiki = join(dir, 'wiki'); mkdirSync(wiki); const path = join(wiki, 'page.md'); writeFileSync(path, 'after');
  const service = new WikiExperience(join(dir, 'db.sqlite'), wiki); t.after(() => service.close());
  const journal = { root: wiki, files: [{ path: 'page.md', before: 'before', after: 'after', hash: 'unused' }] };
  service.db.prepare('INSERT INTO wiki_experience_journal VALUES(?,?)').run('test', JSON.stringify(journal));
  assert.throws(() => service.recover(), /人工恢复/); assert.equal(readFileSync(path, 'utf8'), 'after');
  writeFileSync(path, 'external'); assert.throws(() => service.recover(), /外部修改/); assert.equal(readFileSync(path, 'utf8'), 'external');
});

test('recovery does not undo another live writer', async t => {
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)']); t.after(() => child.kill());
  const dir = mkdtempSync(join(tmpdir(), 'wiki-exp-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const wiki = join(dir, 'wiki'); mkdirSync(wiki); const path = join(wiki, 'page.md'); writeFileSync(path, 'after');
  const service = new WikiExperience(join(dir, 'db.sqlite'), wiki); t.after(() => service.close());
  service.db.prepare('INSERT INTO wiki_experience_journal VALUES(?,?)').run('test', JSON.stringify({ root: wiki, pid: child.pid, files: [{ path: 'page.md', before: 'before', after: 'after' }] }));
  assert.throws(() => service.recover(), /写入|进行中/); assert.equal(readFileSync(path, 'utf8'), 'after');
});

test('blocks approval when an unchanged comparison page changes after preview', async t => {
  const { contentHash } = await import('../src/wiki-extract.ts');
  const dir = mkdtempSync(join(tmpdir(), 'wiki-exp-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const wiki = join(dir, 'wiki'); mkdirSync(wiki); writeFileSync(join(wiki, 'target.md'), 'old'); writeFileSync(join(wiki, 'related.md'), 'related');
  const service = new WikiExperience(join(dir, 'db.sqlite'), wiki); t.after(() => service.close());
  const record = service.create(randomUUID(), { summary: 's', scope: '', evidence: '', unverified: '', relation: '', reviewNote: '', changes: [{ path: 'target.md', content: 'new' }], sources: [{ path: 'related.md', hash: contentHash('related') }] });
  const preview = service.prepare(record.id, record.revision); writeFileSync(join(wiki, 'related.md'), 'changed');
  assert.throws(() => service.approve(preview), /变化/); assert.equal(readFileSync(join(wiki, 'target.md'), 'utf8'), 'old');
});

test('failed multi-file approval never rolls back an external edit to an unwritten page', t => {
  const dir = mkdtempSync(join(tmpdir(), 'wiki-exp-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const wiki = join(dir, 'wiki'); mkdirSync(wiki); writeFileSync(join(wiki, 'a.md'), 'old-a'); writeFileSync(join(wiki, 'b.md'), 'old-b');
  const service = new WikiExperience(join(dir, 'db.sqlite'), wiki); t.after(() => service.close());
  const record = service.create(randomUUID(), { summary: 's', scope: '', evidence: '', unverified: '', relation: '', reviewNote: '', changes: [{ path: 'a.md', content: 'new-a' }, { path: 'b.md', content: 'new-b' }] });
  const preview = service.prepare(record.id, record.revision);
  const write = service.writeFile.bind(service);
  service.writeFile = (...args) => { const result = write(...args); if (args[0].endsWith('/a.md') && args[1] === 'new-a') writeFileSync(join(wiki, 'b.md'), 'new-b'); return result; };
  assert.throws(() => service.approve(preview), /变化/);
  assert.equal(readFileSync(join(wiki, 'a.md'), 'utf8'), 'old-a');
  assert.equal(readFileSync(join(wiki, 'b.md'), 'utf8'), 'new-b');
});

test('rollback rechecks each written page and preserves edits made during recovery', t => {
  const dir = mkdtempSync(join(tmpdir(), 'wiki-exp-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const wiki = join(dir, 'wiki'); mkdirSync(wiki);
  for (const page of ['a', 'b', 'c']) writeFileSync(join(wiki, `${page}.md`), `old-${page}`);
  const service = new WikiExperience(join(dir, 'db.sqlite'), wiki); t.after(() => service.close());
  const record = service.create(randomUUID(), { summary: 's', scope: '', evidence: '', unverified: '', relation: '', reviewNote: '', changes: ['a', 'b', 'c'].map(page => ({ path: `${page}.md`, content: `new-${page}` })) });
  const preview = service.prepare(record.id, record.revision);
  const write = service.writeFile.bind(service);
  service.writeFile = (...args) => {
    const result = write(...args);
    if (args[0].endsWith('/b.md') && args[1] === 'new-b') writeFileSync(join(wiki, 'c.md'), 'external-c');
    if (args[0].endsWith('/b.md') && args[1] === 'old-b') writeFileSync(join(wiki, 'a.md'), 'external-a');
    return result;
  };
  assert.throws(() => service.approve(preview), /变化/);
  assert.equal(readFileSync(join(wiki, 'a.md'), 'utf8'), 'external-a');
});

test('approval creates reviewed Wiki and Vault notes together and rejects unsafe Vault paths', t => {
  const vault = mkdtempSync(join(tmpdir(), 'wiki-dual-store-')); t.after(() => rmSync(vault, { recursive: true, force: true }));
  const wiki = join(vault, '40-LLM-Wiki', 'wiki'); mkdirSync(join(wiki, 'concepts'), { recursive: true }); mkdirSync(join(vault, '20领域', 'tools'), { recursive: true });
  const service = new WikiExperience(join(vault, 'db.sqlite'), wiki, vault); t.after(() => service.close());
  const data = { summary: '新经验', scope: '', evidence: '', unverified: '', relation: '', reviewNote: '', changes: [{ path: 'concepts/new.md', content: '# Agent' }, { path: '@vault/20领域/tools/new.md', content: '# 人读' }] };
  const record = service.create(randomUUID(), data); const preview = service.prepare(record.id, record.revision);
  assert.equal(preview.files[0].before, null); assert.equal(preview.files[1].before, null);
  service.approve(preview);
  assert.equal(readFileSync(join(wiki, 'concepts/new.md'), 'utf8'), '# Agent');
  assert.equal(readFileSync(join(vault, '20领域/tools/new.md'), 'utf8'), '# 人读');
  assert.throws(() => service.create(randomUUID(), { ...data, changes: [{ path: '@vault/.claude/config.md', content: 'bad' }] }), /路径/);
});

test('new Vault note cannot replace an existing page created after analysis', t => {
  const vault = mkdtempSync(join(tmpdir(), 'wiki-dual-conflict-')); t.after(() => rmSync(vault, { recursive: true, force: true }));
  const wiki = join(vault, '40-LLM-Wiki', 'wiki'); mkdirSync(wiki, { recursive: true }); mkdirSync(join(vault, '20领域', 'tools'), { recursive: true });
  const service = new WikiExperience(join(vault, 'db.sqlite'), wiki, vault); t.after(() => service.close());
  const data = { summary: 's', scope: '', evidence: '', unverified: '', relation: '', reviewNote: '', changes: [{ path: '@vault/20领域/tools/new.md', content: 'proposed' }] };
  const rec = service.create(randomUUID(), data); writeFileSync(join(vault, '20领域/tools/new.md'), 'external');
  assert.throws(() => service.prepare(rec.id, rec.revision), /已存在/);
  assert.equal(readFileSync(join(vault, '20领域/tools/new.md'), 'utf8'), 'external');
});

test('selected existing human note can be reviewed and updated with its recorded baseline', async t => {
  const { contentHash } = await import('../src/wiki-extract.ts');
  const vault = mkdtempSync(join(tmpdir(), 'wiki-human-existing-')); t.after(() => rmSync(vault, { recursive: true, force: true }));
  const wiki = join(vault, '40-LLM-Wiki', 'wiki'); mkdirSync(wiki, { recursive: true }); mkdirSync(join(vault, '20领域', 'tools'), { recursive: true });
  const path = '@vault/20领域/tools/existing.md'; writeFileSync(join(vault, '20领域/tools/existing.md'), 'old');
  const service = new WikiExperience(join(vault, 'db.sqlite'), wiki, vault); t.after(() => service.close());
  const rec = service.create(randomUUID(), { summary: 's', scope: '', evidence: '', unverified: '', relation: '', reviewNote: '', changes: [{ path, content: 'new', baseHash: contentHash('old') }], sources: [{ path, hash: contentHash('old') }] });
  const preview = service.prepare(rec.id, rec.revision); service.approve(preview);
  assert.equal(readFileSync(join(vault, '20领域/tools/existing.md'), 'utf8'), 'new');
});

test('approval detects a comparison page changing during the write batch', async t => {
  const { contentHash } = await import('../src/wiki-extract.ts');
  const dir = mkdtempSync(join(tmpdir(), 'wiki-batch-source-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const wiki = join(dir, 'wiki'); mkdirSync(wiki); writeFileSync(join(wiki, 'target.md'), 'old'); writeFileSync(join(wiki, 'source.md'), 'source');
  const service = new WikiExperience(join(dir, 'db.sqlite'), wiki); t.after(() => service.close());
  const rec = service.create(randomUUID(), { summary: 's', scope: '', evidence: '', unverified: '', relation: '', reviewNote: '', changes: [{ path: 'target.md', content: 'new' }], sources: [{ path: 'source.md', hash: contentHash('source') }] });
  const preview = service.prepare(rec.id, rec.revision), write = service.writeFile.bind(service);
  service.writeFile = (...args) => { const result = write(...args); if (args[0].endsWith('/target.md') && args[1] === 'new') writeFileSync(join(wiki, 'source.md'), 'updated'); return result; };
  assert.throws(() => service.approve(preview), /变化/); assert.equal(readFileSync(join(wiki, 'target.md'), 'utf8'), 'old'); assert.equal(readFileSync(join(wiki, 'source.md'), 'utf8'), 'updated');
});
