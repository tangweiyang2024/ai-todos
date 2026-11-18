import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chunkThreadItems } from './wiki-chunks.ts';
import type { ThreadItem } from './wiki-chunks.ts';

/** 原生 Agent 协议版本，用于隔离旧分段断点及不同提示策略。 */
export const wikiAgentVersion = 'native-codex-v1';

/** 固化完整来源并提供有界只读访问；分页只控制工具响应，不发起或合并模型调用。 */
export function prepareAgentSource(root: string, items: ThreadItem[], binding: string) {
  // 内容、策略和模型共同绑定快照，重试不能接入不同来源的旧线程。
  if (!items.length) throw new Error('会话没有可分析的内容');
  const content = JSON.stringify(items);
  const hash = createHash('sha256').update(`${wikiAgentVersion}:${binding}:`).update(content).digest('hex');
  const directory = join(root, hash);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'source.json');
  if (existsSync(path)) {
    if (readFileSync(path, 'utf8') !== content) throw new Error('私有来源快照被修改，拒绝恢复');
  } else writeFileSync(path, content, { flag: 'wx', mode: 0o600 });

  // 所有字段完整保留并带原文坐标；工具每次只返回一页，压缩由 Codex 管理。
  const pages = chunkThreadItems(items, 24000);
  const manifest = pages.map((page, index) => ({ page: index, refs: [...new Set(page.map(f => `${f.turnId}/${f.itemId}`))], types: [...new Set(page.map(f => f.type))] }));
  const manifestFile = join(directory, 'manifest.json');
  const metadata = JSON.stringify({ version: wikiAgentVersion, hash, total: pages.length, pages: manifest });
  if (existsSync(manifestFile)) {
    if (readFileSync(manifestFile, 'utf8') !== metadata) throw new Error('私有快照索引被修改，拒绝恢复');
  } else writeFileSync(manifestFile, metadata, { flag: 'wx', mode: 0o600 });
  const readPages = new Set<number>();

  return {
    hash, directory, total: pages.length, manifest, readPages,
    read(page: number) {
      if (!Number.isInteger(page) || page < 0 || page >= pages.length) throw new Error('无效的来源页');
      readPages.add(page);
      return pages[page];
    },
    assertComplete() {
      if (readPages.size !== pages.length) throw new Error(`Agent 尚未读取完整来源（${readPages.size}/${pages.length} 页），未保存候选；可以重试恢复`);
    },
  };
}
export type WikiAgentSource = ReturnType<typeof prepareAgentSource>;

/** 要求依据包含一个完整的真实 turn/item 标识；子串相似不能作为可定位的引用。 */
export function assertSourceEvidence(evidence: string, refs: string[]) {
  const known = new Set(refs);
  const tokens = evidence.match(/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+/g) ?? [];
  if (!tokens.some(ref => known.has(ref))) throw new Error('经验缺少有效原文引用，未保存候选，请重试恢复');
}
