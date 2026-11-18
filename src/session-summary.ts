import type { LiveSession } from './types.ts';
import type { ThreadItem } from './wiki-chunks.ts';

/** 选择近期已结束的会话，为缺失、过期或仍为旧格式的概要安排生成。 */
export function selectSummaryCandidates(sessions: LiveSession[], days: number, now = Date.now()) {
  const cutoff = now - days * 86400000;
  return sessions.filter(session => {
    const updated = Date.parse(session.catalogUpdatedAt ?? '');
    return session.catalogVisible !== false && Number.isFinite(updated) && updated >= cutoff
      && !['queued', 'running'].includes(session.state)
      && (session.summary?.format !== 'goal' || session.summary.sourceUpdatedAt !== session.catalogUpdatedAt);
  }).sort((a, b) => Date.parse(b.catalogUpdatedAt!) - Date.parse(a.catalogUpdatedAt!));
}

/** 提取用户和助手的文字；过长时保留首尾并显式标记为不完整。 */
export function summaryTranscript(items: ThreadItem[], limit = 60000) {
  const messages = items.flatMap(({ item }) => {
    if (item.type === 'agentMessage' && typeof item.text === 'string') return [`助手：${item.text}`];
    if (item.type === 'userMessage' && Array.isArray(item.content)) {
      const text = item.content.map(part => typeof part?.text === 'string' ? part.text : '').filter(Boolean).join('\n');
      return text ? [`用户：${text}`] : [];
    }
    return [];
  }).join('\n\n');
  if (messages.length <= limit) return { text: messages, partial: false };
  const half = Math.floor(limit / 2);
  return { text: `${messages.slice(0, half)}\n\n[中间内容已省略]\n\n${messages.slice(-half)}`, partial: true };
}
