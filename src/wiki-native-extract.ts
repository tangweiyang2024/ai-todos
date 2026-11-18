import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { withWikiAgent } from './wiki-agent.ts';
import { prepareAgentSource, assertSourceEvidence } from './wiki-agent-source.ts';
import { wikiAgentRoot } from './wiki-agent-state.ts';
import { extractExperience, wikiSelectSchema, wikiResultSchema } from './wiki-extract.ts';
import type { WikiAgentState } from './wiki-agent-state.ts';
import type { WikiAgentSource } from './wiki-agent-source.ts';
import type { WikiAgentTool } from './wiki-agent.ts';
import type { WikiModelSelection } from './wiki-models.ts';
import type { ExperienceData } from './wiki-experience.ts';
import type { ThreadItem } from './wiki-chunks.ts';

export interface NativeWikiCheckpoint {
  id: string;
  begin: (hash: string, total: number) => WikiAgentState | undefined;
  state: (state: WikiAgentState) => void;
  progress: (completed: number, total: number) => void;
}
const initialSchema = z.object({ sessionSummary: z.string().max(20000), items: z.array(z.object({ title: z.string().min(1).max(1000), conclusion: z.string().max(20000), scope: z.string().max(20000), evidence: z.string().max(20000), unverified: z.string().max(20000) }).strict()).max(30) }).strict();
const pageArgs = z.object({ page: z.number().int().nonnegative() }).strict();
const indexArgs = z.object({ offset: z.number().int().nonnegative() }).strict();
const extractionPrompt = `阅读完整来源会话，先概括目标、主要工作、最终结果，再按独立主题提炼值得长期保留的经验。使用 wiki_source_index 查看页索引，wiki_read_source 逐页读取全部原文（页从 0 开始）；每页只读资料，不要求每页产出总结，不要逐页调用其他模型。长上下文由 Codex 原生管理，可反复回读原文。完成前回查每项结论的依据以及后续纠正。
优先保留：有条件的业务规则、非显然的根因与有效修复、技术方案的具体差异及选择理由、关键命令/参数与实际结果、影响后续工作的持久约束。说明对象、条件、机制、行动及结果，保留关键字段/命令，不将具体知识抽象成通用建议。技术讨论和资料比较可以保留，但资料判断与实测效果分开写。
删除：普通文件读取/安装成功/状态确认、偶发 curl 或网络错误、没有结论的调查、泛化的安全和证据提醒。相同主题整合为一项，不把操作步骤拆成多条。没有值得沉淀的经验可返回 items=[]，不能凑数。sessionSummary 记录做了什么，items 才是长期知识。
每项 evidence 必须给出可定位的原文 turnId/itemId（原样用 turnId/itemId 格式），并说明支持结论的事实；不能捏造出处。unverified 写未验证边界。不要查询、判断 Wiki 重复冲突或生成写入方案，这些在逐项人审之后进行。`;
const comparisonPrompt = `只对照当前输入中已确认的经验及人工意见，不能引入未确认的经验。读取索引和候选页面，分析重复、补充和冲突并给出理由。不要把未验证信息升格成事实。changes 只能修改提供的 pages，返回完整 Markdown，保留已有内容和 frontmatter。全新主题才通过 newNotes 同时生成 Wiki 和分类人读版；已有 humanPages 同主题时复用并保留原文。Wiki 路径只能位于 concepts、entities、sources、comparisons、chats/code 等既有目录；必须有 tags、updated frontmatter 和相关双链。humanPath 父目录必须来自 humanDirectories；客服案例必须放 customerIndex 对应的业务场景分类。目录为空时不创建笔记。程序统一生成索引和追加日志，不直接修改它们。没有增量明确说明并返回空 changes/newNotes。`;

// 动态工具只访问本轮已固定资料，路径和命令不属于可接受参数。
function sourceTools(current: () => WikiAgentSource, progress?: (completed: number, total: number) => void): WikiAgentTool[] {
  return [{
    name: 'wiki_source_index', description: '分页查看本轮来源页索引；返回 total 和 nextOffset，每次至多 40 页元数据。offset 从 0 开始。', inputSchema: z.toJSONSchema(indexArgs),
    call(args) {
      const { offset } = indexArgs.parse(args), source = current();
      if (offset > source.total) throw new Error('索引偏移无效');
      return { total: source.total, pages: source.manifest.slice(offset, offset + 40), nextOffset: offset + 40 < source.total ? offset + 40 : null };
    },
  }, {
    name: 'wiki_read_source', description: '读取一页完整原文片段，保留 turnId、itemId、field、start/end 坐标；请阅读全部页面再完成。page 从 0 开始。', inputSchema: z.toJSONSchema(pageArgs),
    call(args) {
      const source = current(), fragments = source.read(pageArgs.parse(args).page);
      progress?.(source.readPages.size, source.total);
      return { fragments, readPages: source.readPages.size, total: source.total };
    },
  }];
}

/** 以原生工具循环读取不可变来源并生成待人审候选；不执行自制模型分段合并。 */
export async function extractWithNativeAgent(options: {
  items: ThreadItem[]; root: string; vaultRoot?: string;
  reviewed?: NonNullable<ExperienceData['workflow']>;
  checkpoint?: NativeWikiCheckpoint; signal?: AbortSignal; modelSelection?: WikiModelSelection;
  registerThread: (threadId: string, taskId: string) => void;
}): Promise<ExperienceData> {
  // 使用私有目录保存可重读原文；正式 Wiki 和人读笔记均不在可写边界内。
  const taskId = options.checkpoint?.id ?? randomUUID();
  const taskRoot = join(wikiAgentRoot, taskId);
  const source = prepareAgentSource(taskRoot, options.reviewed ? [{ turnId: 'review', item: { id: 'confirmed', type: 'reviewInput', data: options.items } }] : options.items, JSON.stringify(options.modelSelection ?? null));
  const cwd = join(source.directory, 'work');
  mkdirSync(cwd, { recursive: true, mode: 0o700 });
  const resume = options.checkpoint?.begin(source.hash, source.total);
  let current = source;
  const tools = sourceTools(() => current, options.reviewed ? undefined : options.checkpoint?.progress);

  // 独立持久线程固定模型和工具；恢复只能指向同一模型和来源摘要。
  return withWikiAgent({ cwd, tools, modelSelection: options.modelSelection, signal: options.signal, resume,
    registerThread: id => options.registerThread(id, taskId), onState: options.checkpoint?.state,
  }, async agent => {
    if (options.reviewed) {
      // 人审后才准备对照资料；本轮输入只包含已确认经验、意见和实际选中的 Wiki。
      return extractExperience({ root: options.root, vaultRoot: options.vaultRoot, items: options.items, ask: async (kind, input) => {
        current = prepareAgentSource(taskRoot, [{ turnId: 'review', item: { id: kind, type: 'reviewInput', data: input } }], JSON.stringify(options.modelSelection ?? null));
        const schema = kind === 'select' ? wikiSelectSchema : wikiResultSchema;
        const instruction = kind === 'select'
          ? '根据已确认经验及索引，从给定 paths/humanPaths 精选最多 8 个相关页面和人读笔记；不能虚构路径。'
          : comparisonPrompt;
        const output = await agent.ask(`${instruction}\n本轮资料已切换；使用只读工具读取所有 ${current.total} 页后输出。资料对象为 input，按 field 路径还原。`, z.toJSONSchema(schema));
        current.assertComplete();
        return schema.parse(output);
      } });
    }

    // 完整覆盖是接收结果的前提；读过原文不代表每条结论都已验证，仍需人工逐项审查。
    const result = initialSchema.parse(await agent.ask(`${extractionPrompt}\n本次共 ${source.total} 页。`, z.toJSONSchema(initialSchema)));
    source.assertComplete();
    const refs = source.manifest.flatMap(page => page.refs);
    for (const item of result.items) {
      assertSourceEvidence(item.evidence, refs);
    }
    return { summary: '', scope: '', evidence: '', unverified: '', relation: '', reviewNote: '', changes: [], sources: [], workflow: { sessionSummary: result.sessionSummary, items: result.items.map(item => ({ ...item, decision: 'pending' as const, note: '' })), stage: 'review' } };
  });
}
