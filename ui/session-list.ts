import type { LiveSession, Task } from '../src/types.ts';
import { executionColumnForSession, executionColumnForTask } from './execution-board.ts';

export type SessionListItem = { id: string; kind: 'task'; task: Task; at: string } | { id: string; kind: 'session'; session: LiveSession; at: string };
type Group = 'attention' | 'running' | 'done' | 'unstarted';
export function sessionLastActivity(session?: LiveSession | null, fallback?: string) {
  if (!session) return fallback || '';
  const observed = session.source === 'codex-app-server' ? undefined : session.observedAt;
  return [session.catalogUpdatedAt, observed, fallback].filter((value): value is string => !!value).sort((a, b) => Date.parse(b) - Date.parse(a))[0] || '';
}
export function groupSessionItems(tasks: Task[], sessions: LiveSession[]): Record<Group, SessionListItem[]> {
  const groups: Record<Group, SessionListItem[]> = { unstarted: [], running: [], attention: [], done: [] };
  const put = (column: string, item: SessionListItem) => {
    const group: Group = column === 'executing' ? 'running' : column === 'completed' ? 'done' : ['waiting_user', 'waiting_confirmation', 'unknown'].includes(column) ? 'attention' : 'unstarted';
    groups[group].push(item);
  };
  for (const task of tasks) if (task.state !== 'cancelled') put(executionColumnForTask(task), { id: task.id, kind: 'task', task, at: sessionLastActivity(task.ai, task.updatedAt) });
  for (const session of sessions) if (!tasks.some(task => task.sessionId === session.id && task.state !== 'cancelled')) put(executionColumnForSession(session), { id: session.id, kind: 'session', session, at: sessionLastActivity(session, session.observedAt) });
  for (const items of Object.values(groups)) items.sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0));
  return groups;
}
