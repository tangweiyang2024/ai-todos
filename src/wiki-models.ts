import { z } from 'zod';

/** 用户选择的模型与推理强度；null 表示该模型没有可调的推理强度。 */
export const wikiModelSelectionSchema = z.object({
  model: z.string().min(1).max(200),
  reasoningEffort: z.string().min(1).max(80).nullable(),
}).strict();
export type WikiModelSelection = z.infer<typeof wikiModelSelectionSchema>;

const modelSchema = z.object({
  id: z.string(), model: z.string().min(1), displayName: z.string(),
  defaultReasoningEffort: z.string().nullable().optional(),
  supportedReasoningEfforts: z.array(z.object({ reasoningEffort: z.string(), description: z.string() })),
  isDefault: z.boolean().optional(), hidden: z.boolean().optional(),
});
const pageSchema = z.object({ data: z.array(modelSchema), nextCursor: z.string().nullable() });
export type WikiModel = z.infer<typeof modelSchema>;

/** 分页读取当前 Codex 账户提供的可见模型，不维护静态模型名单。 */
export async function readWikiModels(request: (method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>) {
  const models = new Map<string, WikiModel>();
  const seen = new Set<string>();
  let cursor: string | null = null;

  // 完整读取目录；重复游标和异常体积必须显式失败，不能伪装为完整列表。
  do {
    const page = pageSchema.parse(await request('model/list', { limit: 100, cursor, includeHidden: false }));
    for (const model of page.data) if (!model.hidden) models.set(model.model, model);
    if (models.size > 5000) throw new Error('模型目录超过读取上限');
    cursor = page.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error('模型目录分页异常');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return [...models.values()];
}

/** 校验选择仍在模型目录中；不支持时拒绝执行，不替换成其他模型或强度。 */
export function validateWikiModel(models: WikiModel[], input: unknown): WikiModelSelection {
  const selected = wikiModelSelectionSchema.parse(input);
  const model = models.find(item => item.model === selected.model);
  if (!model) throw new Error('所选模型当前不可用，请重新选择模型');

  // 强度来自模型自身的支持列表，不能把另一模型的强度带入本次分析。
  const efforts = model.supportedReasoningEfforts.map(item => item.reasoningEffort);
  if (efforts.length ? !selected.reasoningEffort || !efforts.includes(selected.reasoningEffort) : selected.reasoningEffort !== null) throw new Error('所选模型不支持该推理强度，请重新选择');
  return selected;
}

/** 比较两次分析的配置，供运行锁定和断点隔离使用。 */
export function sameWikiModel(a?: WikiModelSelection, b?: WikiModelSelection) {
  return a?.model === b?.model && a?.reasoningEffort === b?.reasoningEffort;
}

/** 确认服务实际采用了所选配置，禁止以请求参数冒充实际执行模型。 */
export function assertWikiModelResponse(response: Record<string, unknown>, selected: WikiModelSelection) {
  if (response.model !== selected.model || (selected.reasoningEffort !== null && response.reasoningEffort !== selected.reasoningEffort)) throw new Error('Codex 实际模型或推理强度与所选配置不一致，分析已停止');
}
