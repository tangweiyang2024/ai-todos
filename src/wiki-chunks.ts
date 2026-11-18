export interface ThreadFragment {
  turnId: string; itemId: string; type: string; field: string;
  start: number; end: number; value: string;
}
export interface ThreadItem { turnId: string; item: { id: string; type: string; [key: string]: unknown } }

/** 按字节预算分段全部条目字段；每个片段保留来源和字符串位置。 */
export function chunkThreadItems(items: ThreadItem[], maxBytes = 32000): ThreadFragment[][] {
  if (maxBytes < 1024) throw new Error('分段预算过小');
  const chunks: ThreadFragment[][] = [];
  let chunk: ThreadFragment[] = [];
  const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

  // 包装元数据参与预算计算，避免转义或中文使请求超出大小。
  const append = (part: ThreadFragment) => {
    if (bytes([part]) > maxBytes) throw new Error('会话条目元数据超过分段预算');
    if (bytes([...chunk, part]) > maxBytes) { chunks.push(chunk); chunk = []; }
    chunk.push(part);
  };

  // 字符串可跨段，但不会拆开 UTF-16 代理对；每段可按位置回查原文。
  const addValue = (item: ThreadItem, field: string, value: string) => {
    let start = 0;
    do {
      let low = start, high = value.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        const candidate = { turnId: item.turnId, itemId: item.item.id, type: item.item.type, field, start, end: mid, value: value.slice(start, mid) };
        if (bytes([candidate]) <= maxBytes) low = mid; else high = mid - 1;
      }
      let end = low;
      if (end < value.length && end > start && /[\uD800-\uDBFF]/.test(value[end - 1]) && /[\uDC00-\uDFFF]/.test(value[end])) end--;
      if (end === start && start < value.length) throw new Error('会话条目元数据超过分段预算');
      append({ turnId: item.turnId, itemId: item.item.id, type: item.item.type, field, start, end, value: value.slice(start, end) });
      start = end;
    } while (start < value.length);
  };

  // 遍历嵌套字段而不丢弃工具输出，保留字段路径以还原上下文。
  const visit = (item: ThreadItem, value: unknown, field: string) => {
    if (value !== null && typeof value === 'object') {
      const entries = Object.entries(value);
      if (!entries.length) addValue(item, field, Array.isArray(value) ? '[]' : '{}');
      for (const [key, child] of entries) visit(item, child, Array.isArray(value) ? `${field}[${key}]` : field ? `${field}.${key}` : key);
    } else addValue(item, field, typeof value === 'string' ? value : JSON.stringify(value) ?? 'null');
  };
  for (const item of items) {
    const fields = Object.entries(item.item).filter(([field]) => field !== 'id' && field !== 'type');
    if (!fields.length) addValue(item, '$item', '{}');
    for (const [field, value] of fields) visit(item, value, field);
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}
