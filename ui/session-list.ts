import type { LiveSession, Task, Project } from '../src/types.ts';
import { executionColumnForSession, executionColumnForTask } from './execution-board.ts';
import { runtimeState } from '../src/runtime.ts';

export function userActionPriority(state?: string) { return ['waiting_approval', 'waiting_input'].includes(runtimeState(state)) ? 0 : 1; }

export type SessionListItem = { id: string; kind: 'task'; task: Task; at: string } | { id: string; kind: 'session'; session: LiveSession; at: string };
type Group = 'attention' | 'running' | 'done';
/** 任务和会话使用同一搜索范围，关联会话的概要命中时也保留对应任务卡片。 */
export function matchesSessionSearch(query: string, task?: Partial<Task> | null, session?: Partial<LiveSession> | null) {
  return !query || `${task?.title || ''} ${task?.description || ''} ${session?.title || ''} ${session?.preview || ''} ${session?.summary?.text || ''}`.toLowerCase().includes(query.toLowerCase());
}
export function sessionLastActivity(session?: LiveSession | null, fallback?: string) {
  if (!session) return fallback || '';
  const polling = session.source === 'codex-app-server' || (session.source === 'codex-rollout' && session.event === 'request_user_input_async' && session.catalogUpdatedAt);
  const observed = polling ? undefined : session.observedAt;
  return [session.catalogUpdatedAt, observed, fallback].filter((value): value is string => !!value).sort((a, b) => Date.parse(b) - Date.parse(a))[0] || '';
}
/** 按最后真实活动时间筛选会话；未知时间保留，0 表示不限制。 */
export function sessionWithinDays(session: Partial<LiveSession>, days: number, now = Date.now()) {
  if (!days) return true;
  // 待回答问题的轮询会刷新观察时间，不能把它当作会话的新活动。
  const refreshedPending = session.source === 'codex-rollout' && session.event === 'request_user_input_async' && session.catalogUpdatedAt;
  const at = Date.parse(refreshedPending ? session.catalogUpdatedAt! : sessionLastActivity(session as LiveSession));
  return !Number.isFinite(at) || at >= now - days * 86400000;
}
/** 判断会话生命周期与查询区间是否重叠；缺失的端点不推断为具体时间。 */
export function sessionOverlapsRange(session: Partial<LiveSession>, range: { start: number; end: number }) {
  if (range.start > range.end) return false;
  const start = Date.parse(session.catalogCreatedAt ?? '');
  const refreshedPending = session.source === 'codex-rollout' && session.event === 'request_user_input_async' && session.catalogUpdatedAt;
  const end = Date.parse(refreshedPending ? session.catalogUpdatedAt! : sessionLastActivity(session as LiveSession));
  return (!Number.isFinite(start) || start <= range.end) && (!Number.isFinite(end) || end >= range.start);
}
/** 优先使用任务所属项目，其次按会话工作目录查找；未匹配时保留未关联分组。 */
export function sessionProject(projects: Project[], task?: Partial<Task> | null, session?: Partial<LiveSession> | null) {
  const project = task?.projectId ? projects.find(item => item.id === task.projectId) : projects.find(item => item.codex?.workspacePath === session?.cwd);
  return { id: project?.id ?? '', title: project?.title };
}
/** 项目批量完成只包含该分组内待确认的非运行、非中断会话。 */
export function eligibleProjectPending(session: LiveSession, task?: Task | null) {
  if (['running', 'queued', 'interrupted', 'failed'].includes(runtimeState(session.state))) return false;
  const column = task ? executionColumnForTask(task) : executionColumnForSession(session);
  return ['waiting_user', 'waiting_confirmation', 'unknown'].includes(column);
}
export function groupSessionItems(tasks: Task[], sessions: LiveSession[]): Record<Group, SessionListItem[]> {
  const groups: Record<Group, SessionListItem[]> = { running: [], attention: [], done: [] };
  const put = (column: string, item: SessionListItem) => {
    const group: Group = column === 'executing' ? 'running' : column === 'completed' ? 'done' : ['waiting_user', 'waiting_confirmation', 'unknown'].includes(column) ? 'attention' : 'running';
    groups[group].push(item);
  };
  for (const task of tasks) if (task.state !== 'cancelled') put(executionColumnForTask(task), { id: task.id, kind: 'task', task, at: sessionLastActivity(task.ai, task.ai ? undefined : task.updatedAt) });
  for (const session of sessions) if (!tasks.some(task => task.sessionId === session.id && task.state !== 'cancelled')) put(executionColumnForSession(session), { id: session.id, kind: 'session', session, at: sessionLastActivity(session) });
  for (const [group, items] of Object.entries(groups)) items.sort((a, b) => {
    const state = (item: SessionListItem) => item.kind === 'session' ? item.session.state : item.task.ai?.state;
    return (group === 'attention' ? userActionPriority(state(a)) - userActionPriority(state(b)) : 0) || (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0);
  });
  return groups;
}
