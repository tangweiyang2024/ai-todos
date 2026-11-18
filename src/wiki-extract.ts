import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ExperienceData } from './wiki-experience.ts';

const selectionSchema = z.object({ paths: z.array(z.string()).max(8), humanPaths: z.array(z.string()).max(8).default([]) }).strict();
const noteSchema = z.object({
  wikiPath: z.string(), wikiContent: z.string().max(500000),
  humanPath: z.string(), humanContent: z.string().max(500000),
}).strict();
const resultSchema = z.object({
  summary: z.string().max(20000), scope: z.string().max(20000), evidence: z.string().max(20000),
  unverified: z.string().max(20000), relation: z.string().max(20000),
  changes: z.array(z.object({ path: z.string(), content: z.string().max(500000) }).strict()).max(8),
  newNotes: z.array(noteSchema).max(3).default([]),
}).strict();

/** 计算含文件存在性语义的摘要，供后续预览和写入校验。 */
export const contentHash = (content: string | null) => createHash('sha256').update(content === null ? 'missing' : `file:${content}`).digest('hex');
export type WikiAsk = (kind: 'select' | 'extract', input: Record<string, unknown>) => Promise<unknown>;
export const wikiSelectSchema = selectionSchema;
export const wikiResultSchema = resultSchema;
const customerRoot = '20领域/50-业务域/客服知识库';
const humanRoots = ['20领域/tools', '10项目', customerRoot];

// 仅收集真实 Markdown 文件，避免模型检索时跟随符号链接。
function listMarkdown(root: string, dir = root): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) return [];
    if (entry.isDirectory()) return listMarkdown(root, path);
    return entry.isFile() && entry.name.endsWith('.md') ? [relative(root, path).split('\\').join('/')] : [];
  });
}

// 只允许模型选择已存在的分类目录，不自动创建目录或跟随符号链接。
function listHumanDirectories(vaultRoot: string) {
  const found: string[] = [];
  const visit = (dir: string) => {
    found.push(relative(vaultRoot, dir).split('\\').join('/'));
    if (found.length > 5000) throw new Error('Vault 分类目录过多，无法完整列出');
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith('.')) visit(join(dir, entry.name));
      if (found.length > 5000) throw new Error('Vault 分类目录过多，无法完整列出');
    }
  };
  for (const root of humanRoots) {
    const dir = join(vaultRoot, root);
    // 分类目录的任何上级都是链接时，不遍历 Vault 之外的内容。
    let part = vaultRoot;
    const safe = root.split('/').every(segment => {
      part = join(part, segment);
      return existsSync(part) && !lstatSync(part).isSymbolicLink() && lstatSync(part).isDirectory();
    });
    if (safe) visit(dir);
  }
  return found;
}
// 人读版先列出文件名供模型筛选，仅对选中的文件读取正文。
function listHumanMarkdown(vaultRoot: string, directories: string[]) {
  const paths = directories.flatMap(dir => readdirSync(join(vaultRoot, dir), { withFileTypes: true })
    .filter(entry => entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith('.md'))
    .map(entry => `${dir}/${entry.name}`));
  if (paths.length > 5000) throw new Error('Vault 笔记过多，无法完整列出');
  return paths;
}
function readBounded(path: string) {
  const value = readFileSync(path, 'utf8');
  if (Buffer.byteLength(value) > 250000) throw new Error('Wiki 页面过大，无法完整分析');
  return value;
}
function validName(name: string) { return !name.startsWith('.') && name.length <= 120 && /^[^/\\\[\]#|\x00-\x1f]+\.md$/.test(name) && name !== '..md'; }
function appendSection(original: string, title: string, lines: string[]) {
  return `${original}${original.endsWith('\n') ? '' : '\n'}\n## ${title}\n\n${lines.join('\n')}\n`;
}

/** 对照现有知识，生成两份新笔记或更新候选；不会修改文件。 */
export async function extractExperience({ root, vaultRoot, items, ask }: { root: string; vaultRoot?: string; items: unknown[]; ask: WikiAsk }): Promise<ExperienceData> {
  if (!items.length) throw new Error('会话没有可分析的内容');

  // 提供 Wiki 目录、索引和可用的人读版分类，让模型定位相似知识。
  const paths = listMarkdown(root).filter(path => path !== 'index.md' && path !== 'log.md');
  if (paths.length > 5000) throw new Error('Wiki 页面过多，无法完整列出');
  const index = readBounded(join(root, 'index.md'));
  const humanDirectories = vaultRoot ? listHumanDirectories(vaultRoot) : [];
  const humanPaths = vaultRoot ? listHumanMarkdown(vaultRoot, humanDirectories) : [];
  const customerIndexPath = `${customerRoot}/_INDEX.md`;
  const customerIndex = vaultRoot && existsSync(join(vaultRoot, customerIndexPath)) ? readBounded(join(vaultRoot, customerIndexPath)) : null;
  const selection = selectionSchema.parse(await ask('select', { index, paths, humanPaths, items }));
  if (new Set(selection.paths).size !== selection.paths.length || selection.paths.some(path => !paths.includes(path))) throw new Error('建议的 Wiki 页面路径无效');

  // 读取选中页面；已有页面只能修改被实际对照过的内容。
  if (new Set(selection.humanPaths).size !== selection.humanPaths.length || selection.humanPaths.some(path => !humanPaths.includes(path))) throw new Error('建议对照的人读版页面路径无效');
  const pages = selection.paths.map(path => ({ path, content: readBounded(join(root, path)) }));
  const humanPages = selection.humanPaths.map(path => ({ path, content: readBounded(join(vaultRoot!, path)) }));
  const result = resultSchema.parse(await ask('extract', { index, pages, humanPages, items, humanDirectories, customerIndex }));
  if (new Set(result.changes.map(c => c.path)).size !== result.changes.length || result.changes.some(c => !selection.paths.includes(c.path))) throw new Error('建议写入的 Wiki 页面路径无效');
  const changes = result.changes.filter(item => pages.find(page => page.path === item.path)!.content !== item.content)
    .map(item => ({ ...item, baseHash: contentHash(pages.find(page => page.path === item.path)!.content) }));
  const newWikiPaths: string[] = [];
  const customerNotes: string[] = [];
  const proposed = new Set(changes.map(item => item.path));

  // 新主题必须同时提供两份笔记，且目录、文件名和文件不存在性都需通过校验。
  for (const note of result.newNotes) {
    if (!vaultRoot) throw new Error('未配置人读版 Vault 路径');
    const wikiParts = note.wikiPath.split('/');
    const wikiDir = wikiParts.slice(0, -1).join('/');
    const humanParts = note.humanPath.split('/');
    const humanDir = humanParts.slice(0, -1).join('/');
    const isCustomer = humanDir === customerRoot || humanDir.startsWith(`${customerRoot}/`);
    const invalid = !['concepts', 'entities', 'sources', 'comparisons', 'chats/code'].includes(wikiDir) ||
      !validName(wikiParts.at(-1) || '') || !existsSync(join(root, wikiDir)) || !humanDirectories.includes(humanDir) || !validName(humanParts.at(-1) || '') ||
      (isCustomer && (humanDir === customerRoot || !customerIndex));
    if (invalid || proposed.has(note.wikiPath) || proposed.has(`@vault/${note.humanPath}`)) throw new Error('新笔记目标路径无效或重复');
    const existingHuman = humanPages.find(page => page.path === note.humanPath);
    if (existsSync(join(root, note.wikiPath)) || (existsSync(join(vaultRoot, note.humanPath)) && !existingHuman)) throw new Error('新笔记目标已存在，请重新提取');
    const frontmatter = note.wikiContent.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] || '';
    if (!/^tags\s*:/m.test(frontmatter) || !/^updated\s*:/m.test(frontmatter) || !(/\[\[[^\]\r\n]+\]\]/.test(note.wikiContent))) throw new Error('Wiki 新笔记缺少 frontmatter 或双链');
    if (!/^#\s+\S/m.test(note.humanContent)) throw new Error('人读版新笔记缺少标题');
    proposed.add(note.wikiPath);
    proposed.add(`@vault/${note.humanPath}`);
    changes.push({ path: note.wikiPath, content: note.wikiContent, baseHash: contentHash(null) });
    changes.push({ path: `@vault/${note.humanPath}`, content: note.humanContent, baseHash: contentHash(existingHuman?.content ?? null) });
    newWikiPaths.push(note.wikiPath);
    if (isCustomer) {
      const relativePath = note.humanPath.slice(customerRoot.length + 1);
      if (!customerIndex!.includes(`[[${relativePath.replace(/\.md$/, '')}]]`)) customerNotes.push(relativePath);
    }
  }

  // 新 Wiki 页面更新总索引；客服笔记还须更新对应业务场景的总索引。
  if (newWikiPaths.length) {
    const lines = newWikiPaths.map(path => `- [[${path.replace(/\.md$/, '')}]] — ${result.summary.replace(/[\r\n]+/g, ' ').slice(0, 100)}`);
    changes.push({ path: 'index.md', content: appendSection(index, '会话经验沉淀', lines), baseHash: contentHash(index) });
  }
  if (customerNotes.length && customerIndex !== null) {
    const lines = customerNotes.map(path => `- [[${path.replace(/\.md$/, '')}]] — ${result.summary.replace(/[\r\n]+/g, ' ').slice(0, 100)}`);
    changes.push({ path: `@vault/${customerIndexPath}`, content: appendSection(customerIndex, '会话经验沉淀', lines), baseHash: contentHash(customerIndex) });
  }

  // 日志及双份笔记、索引一起进入人工预览，旧日志内容只能追加。
  if (changes.length) {
    const log = readBounded(join(root, 'log.md'));
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const title = result.summary.replace(/[\r\n]+/g, ' ').slice(0, 100);
    const wikiLinks = changes.filter(item => !item.path.startsWith('@vault/') && item.path !== 'index.md').map(item => `[[${item.path.replace(/\.md$/, '')}]]`).join('、');
    changes.push({ path: 'log.md', content: `${log}${log.endsWith('\n') ? '' : '\n'}\n## [${date}] 会话经验 | ${title}\n\n- 更新 ${wikiLinks}\n`, baseHash: contentHash(log) });
  }
  const sources = [{ path: 'index.md', hash: contentHash(index) }, ...pages.map(page => ({ path: page.path, hash: contentHash(page.content) }))];
  for (const page of humanPages) sources.push({ path: `@vault/${page.path}`, hash: contentHash(page.content) });
  if (customerIndex !== null && !sources.some(source => source.path === `@vault/${customerIndexPath}`)) sources.push({ path: `@vault/${customerIndexPath}`, hash: contentHash(customerIndex) });
  const { newNotes: ignored, ...data } = result;
  return { ...data, reviewNote: '', changes, sources };
}
