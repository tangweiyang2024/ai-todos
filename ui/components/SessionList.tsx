import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import type { LiveSession, Project, Task } from '../../src/types.ts';
import type { TaskCallbacks } from '../types.ts';
import { fmt, runtimeLabel } from '../format.ts';
import { canConfirmAiSession, executionColumnForSession, taskNextStep, taskStatus } from '../execution-board.ts';
import { groupSessionItems } from '../session-list.ts';

interface Props extends Pick<TaskCallbacks, 'onOpenTask' | 'onOpenSession' | 'onConfirmSession' | 'onCompleteTask' | 'onReviewTask' | 'onOpenCodex'> {
  tasks: Task[]; allTasks: Task[]; sessions: LiveSession[]; projects: Project[]; busy: boolean; onHistory: () => void;
}
export function SessionList({ tasks, allTasks, sessions, projects, busy, onOpenTask, onOpenSession, onConfirmSession, onCompleteTask, onReviewTask, onOpenCodex, onHistory }: Props) {
  const { t } = useTranslation();
  const groups = groupSessionItems(tasks, sessions);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const headings = { attention: 'workspace.attention', running: 'workspace.running', done: 'workspace.confirmed', unknown: 'runtime.unknown', unstarted: 'board.unstarted' } as const;
  return <div className="session-list">{(Object.keys(headings) as (keyof typeof headings)[]).map(group => groups[group].length > 0 && <section key={group} className="session-list__group">
    <h2>{t(headings[group])} <span>{t('workspace.sessionCount', { count: groups[group].length })}</span></h2>
    {groups[group].slice(0, limits[group] || 30).map(item => {
      const task = item.kind === 'task' ? item.task : undefined;
      const session = item.kind === 'session' ? item.session : task?.ai;
      const title = task?.title || session?.title || `Codex · ${session?.cwd?.split(/[\\/]/).pop() || session?.id.slice(-8)}`;
      const description = task?.description || session?.preview;
      const project = projects.find(p => task?.projectId ? p.id === task.projectId : p.codex?.workspacePath === session?.cwd)?.title || session?.cwd?.split(/[\\/]/).pop() || t('project.none');
      const next = task ? taskNextStep(task) : null;
      const completed = task ? task.state === 'accepted' : session && executionColumnForSession(session) === 'completed';
      const status = task ? taskStatus(task) : completed ? t('board.completed') : session && executionColumnForSession(session) === 'waiting_confirmation' ? t('activity.pending') : runtimeLabel(session) || t('runtime.unknown');
      const canConfirm = !task && session && canConfirmAiSession(session, allTasks);
      return <article className={`session-list__card ${group === 'attention' ? 'is-attention' : ''}`} key={`${item.kind}-${item.id}`}>
        <span className={`session-list__dot is-${group}`} aria-hidden="true" />
        <div className="session-list__content"><div className="session-list__top"><strong>{title}</strong><span className={`session-list__status is-${group}`}>{status}</span></div>
          {description && <p className="session-list__description">{description}</p>}
          <div className="session-list__meta"><span>{project}</span><span>·</span><span>{completed ? t('session.confirmedAt', { at: fmt(task?.review?.at || session?.confirmedAt || item.at) }) : t('card.lastActivity', { at: fmt(item.at) })}</span>{session && !completed && <><span>·</span><span>{t(session.source === 'codex-hook' ? 'workspace.hook' : session.source === 'codex-rollout' ? 'workspace.historySource' : 'workspace.hostSource')}</span></>}</div>
        </div>
        <div className="session-list__actions">
          {session && <button type="button" disabled={busy} onClick={() => onOpenSession(session.id)}><ExternalLink size={13} />{t('session.open')}</button>}
          {task && !session && <button type="button" disabled={busy} onClick={() => onOpenTask(task.id)}>{t('task.open')}</button>}
          {canConfirm && <button type="button" className="session-list__primary" disabled={busy} onClick={() => onConfirmSession(session)}>{t('session.confirm')}</button>}
          {task && next?.action === 'complete' && <button type="button" className="session-list__primary" disabled={busy} onClick={() => onCompleteTask(task)}>{t('session.confirm')}</button>}
          {task && next?.action === 'review' && <button type="button" className="session-list__primary" disabled={busy} onClick={() => onReviewTask(task)}>{t('review.action')}</button>}
          {task && next?.action === 'start' && <button type="button" className="session-list__primary" disabled={busy} onClick={() => onOpenCodex(task)}>{t('task.startWork')}</button>}
          {completed && <button type="button" disabled={busy} onClick={onHistory}>{t('workspace.viewHistory')}</button>}
        </div>
      </article>;
    })}
    {groups[group].length > (limits[group] || 30) && <button type="button" className="quiet small session-list__more" onClick={() => setLimits(current => ({ ...current, [group]: (current[group] || 30) + 30 }))}>{t('workspace.more', { count: groups[group].length - (limits[group] || 30) })}</button>}
  </section>)}{!Object.values(groups).some(items => items.length) && <p className="muted">{t('workspace.empty')}</p>}</div>;
}
