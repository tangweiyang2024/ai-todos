import { z } from 'zod';

const pageSchema = z.object({
  data: z.array(z.object({ turnId: z.string(), item: z.object({ type: z.string(), id: z.string() }).passthrough() })),
  nextCursor: z.string().nullable(),
});

/** 分页读取指定会话的所有可见条目；超限或分页异常时拒绝返回不完整内容。 */
export async function readThreadItems(request: (method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>, threadId: string) {
  const result: z.output<typeof pageSchema>['data'] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  let size = 0;

  // 按时间顺序读取所有页面，保留 turn 和 item 标识供审核时追溯。
  do {
    const page = pageSchema.parse(await request('thread/items/list', { threadId, cursor, limit: 1, sortDirection: 'asc' }));
    size += Buffer.byteLength(JSON.stringify(page.data));
    if (size > 64000000) throw new Error('会话超过本地读取安全上限（64 MB），未进行分析');
    result.push(...page.data);
    cursor = page.nextCursor;
    if (cursor && cursors.has(cursor)) throw new Error('会话分页异常，无法完整读取');
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return result;
}

/** 重读并核对会话快照；发现读取期间有变化时要求用户重新提取。 */
export async function readStableThreadItems(request: (method: string, params: Record<string, unknown>) => Promise<Record<string, unknown>>, threadId: string) {
  // 两次完整读取相同才交给模型，避免将会话追加误认为完整历史。
  const first = await readThreadItems(request, threadId);
  const second = await readThreadItems(request, threadId);
  if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error('会话在读取过程中发生变化，请稍后重新提取');
  return first;
}
