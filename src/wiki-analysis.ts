import type { ThreadFragment } from './wiki-chunks.ts';

export interface AnalysisItem { title: string; conclusion: string; scope: string; evidence: string; unverified: string }
export interface AnalysisResult { sessionSummary: string; items: AnalysisItem[] }
export type AnalysisAsk = (kind: 'chunk' | 'merge' | 'curate', input: { index: number; total: number; data: unknown; previousContext?: ThreadFragment; context?: ThreadFragment[] }) => Promise<AnalysisResult>;

// 会话正文用于找回用户目标和最终结论；工具输出仍在完整分段里分析，不占用本阶段的目标提示预算。
function conversationContext(chunks: ThreadFragment[][]) {
  // 只用原始对话正文提供目标提示，不把工具日志再次送入知识编辑阶段。
  const candidates = chunks.flat().filter(fragment => ['userMessage', 'agentMessage'].includes(fragment.type) && /(?:^|\.)text$/.test(fragment.field));
  const selected = new Map<number, ThreadFragment>();

  // 优先保留开头目标和末尾修正，并明确限制每条节选及整体输入大小。
  for (let offset = 0; offset < candidates.length; offset++) {
    const index = offset % 2 === 0 ? offset / 2 : candidates.length - 1 - Math.floor(offset / 2);
    const fragment = candidates[index];
    let end = Math.min(1000, fragment.value.length);
    if (end < fragment.value.length && /[\uD800-\uDBFF]/.test(fragment.value[end - 1])) end--;
    const excerpt = { ...fragment, value: fragment.value.slice(0, end), end: fragment.start + end };
    if (Buffer.byteLength(JSON.stringify([...selected.values(), excerpt])) <= 16000) selected.set(index, excerpt);
  }
  return [...selected.entries()].sort(([a], [b]) => a - b).map(([, fragment]) => fragment);
}

/** 逐段提取并分层合并；已保存的片段可复用，任何失败都不会伪称完整。 */
export async function runChunkAnalysis(chunks: ThreadFragment[][], ask: AnalysisAsk, load: (index: number) => AnalysisResult | undefined, save: (index: number, result: AnalysisResult) => void, progress?: (completed: number, total: number, phase: 'chunks' | 'merge' | 'curate') => void): Promise<AnalysisResult> {
  // 空会话没有提取对象，不启动模型或保存空的分析断点。
  if (!chunks.length) throw new Error('会话没有可分析的内容');
  const results: AnalysisResult[] = [];

  // 先覆盖所有原文片段；每段成功后立即保存以便故障后恢复。
  for (let index = 0; index < chunks.length; index++) {
    let result = load(index);
    if (!result) {
      // 同一轮被拆开时附带上一段的少量末尾；原文仍在对应完整片段中处理。
      const previous = chunks[index - 1]?.at(-1);
      let previousContext: ThreadFragment | undefined;
      if (previous && previous.turnId === chunks[index][0]?.turnId) {
        let start = Math.max(0, previous.value.length - 1000);
        if (start && /[\uDC00-\uDFFF]/.test(previous.value[start])) start++;
        previousContext = { ...previous, start: previous.start + start, value: previous.value.slice(start) };
      }
      result = await ask('chunk', { index, total: chunks.length, data: chunks[index], ...(previousContext ? { previousContext } : {}) });
      save(index, result);
    }
    results.push(result);
    progress?.(index + 1, chunks.length, 'chunks');
  }

  // 限制每次合并输入，并按原顺序逐层归并，不悄悄丢掉失败片段。
  let level = results;
  while (level.length > 1) {
    const groups: AnalysisResult[][] = []; let group: AnalysisResult[] = [];
    for (const result of level) {
      if (Buffer.byteLength(JSON.stringify([result])) > 60000) throw new Error('单段分析结果过大，无法安全合并');
      if (group.length && Buffer.byteLength(JSON.stringify([...group, result])) > 60000) { groups.push(group); group = []; }
      group.push(result);
    }
    if (group.length) groups.push(group);
    if (groups.length >= level.length) throw new Error('分析结果无法缩小到合并预算，请重试');
    progress?.(chunks.length, chunks.length, 'merge');
    const next: AnalysisResult[] = [];
    for (let index = 0; index < groups.length; index++) next.push(await ask('merge', { index, total: groups.length, data: groups[index] }));
    level = next;
  }

  // 片段事实不等于长期知识；即使只有一段或复用了断点，也必须按整场任务重新筛选。
  if (Buffer.byteLength(JSON.stringify(level[0])) > 60000) throw new Error('最终分析结果过大，无法安全筛选');
  progress?.(chunks.length, chunks.length, 'curate');
  return ask('curate', { index: 0, total: 1, data: level[0], context: conversationContext(chunks) });
}
