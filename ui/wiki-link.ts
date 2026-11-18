const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const linkPattern = new RegExp(`^#experience=(${uuid})(?:&record=(${uuid})(?:&revision=([1-9][0-9]*))?)?$`, 'i');

/** 解析本地经验审核链接，拒绝格式不完整或包含额外参数的标识。 */
export function parseWikiLink(hash: string) {
  const match = hash.match(linkPattern);
  if (!match) return null;
  const revision = match[3] ? Number(match[3]) : undefined;
  if (revision !== undefined && !Number.isSafeInteger(revision)) return null;
  return { sessionId: match[1], recordId: match[2], revision };
}

/** 按链接精确选择候选；指定候选缺失时不得回退到其他记录。 */
export function selectWikiRecord<T extends { id: string; revision: number }>(records: T[], recordId?: string, revision?: number) {
  if (!recordId) return records[0];
  const selected = records.find(record => record.id === recordId);
  if (!selected) throw new Error('wiki.recordMissing');
  if (revision !== undefined && selected.revision !== revision) throw new Error('wiki.recordChanged');
  return selected;
}
