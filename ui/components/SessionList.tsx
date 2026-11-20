import { SessionCaptureProgress } from './ExperienceProgress.tsx';
import { ExperienceCaptureButton, type CaptureActionHandler } from './ExperienceCaptureButton.tsx';
import { SessionSummary } from './SessionSummary.tsx';
import { SessionProjectGroups } from './SessionProjectGroups.tsx';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, CircleAlert } from 'lucide-react';
import type { LiveSession, Project, Task } from '../../src/types.ts';
import type { TaskCallbacks } from '../types.ts';
import { fmt, runtimeLabel } from '../format.ts';
import { canConfirmAiSession, executionColumnForSession, executionColumnForTask, isHistoricalSession, taskNextStep, taskStatus, runtimeAttention } from '../execution-board.ts';
import { groupSessionItems } from '../session-list.ts';

interface Props extends Pick<TaskCallbacks, 'onOpenTask' | 'onOpenSession' | 'onConfirmSession' | 'onCompleteTask' | 'onReviewTask' | 'onOpenCodex'> {
  tasks: Task[]; allTasks: Task[]; sessions: LiveSession[]; projects: Project[]; busy: boolean; onHistory: () => void; onExperience: CaptureActionHandler; onSummary: (id: string) => void; grouped: boolean; onBatchProject: (id: string) => void; onArchive: (session: LiveSession) => void;
}
/** 展示按运行状态分组的会话，并提供对应的人工操作入口。 */
export function SessionList({ tasks, allTasks, sessions, projects, busy, onOpenTask, onOpenSession, onConfirmSession, onCompleteTask, onReviewTask, onOpenCodex, onHistory, onExperience, onSummary, grouped, onBatchProject, onArchive }: Props) {
  const { t } = useTranslation();
  // 先合并已关联任务和独立会话，避免重复展示同一会话。
  const groups = groupSessionItems(tasks, sessions);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const headings = { running: 'workspace.running', attention: 'board.pending', done: 'workspace.confirmed' } as const;
  // 根据每条记录的实际状态组装卡片和人工操作。
  const renderItem = (item: (typeof groups)[keyof typeof groups][number], group: keyof typeof groups) => {
      const task = item.kind === 'task' ? item.task : undefined;
      const session = item.kind === 'session' ? item.session : task?.ai;
      const title = task?.title || session?.title || `Codex · ${session?.cwd?.split(/[\\/]/).pop() || session?.id.slice(-8)}`;
      const description = task?.description;
      const project = projects.find(p => task?.projectId ? p.id === task.projectId : p.codex?.workspacePath === session?.cwd)?.title || session?.cwd?.split(/[\\/]/).pop() || t('project.none');
      const next = task ? taskNextStep(task) : null;
      const completed = task ? executionColumnForTask(task) === 'completed' : session && executionColumnForSession(session) === 'completed';
      const historical = !task && session && isHistoricalSession(session);
      const status = task ? taskStatus(task) : historical ? t('session.historicalCompleted') : completed ? t('board.completed') : session && executionColumnForSession(session) === 'waiting_confirmation' ? t('activity.pending') : runtimeLabel(session) || t('runtime.unknown');
      const canConfirm = !task && session && canConfirmAiSession(session, allTasks);
      const attention = !completed && task?.state !== 'cancelled' ? runtimeAttention(session) : undefined;
      return <article className={`session-list__card ${group === 'attention' ? 'is-attention' : ''} ${attention ? `needs-${attention}` : ''}`} key={`${item.kind}-${item.id}`}>
        <span className={`session-list__dot is-${group}`} aria-hidden="true" />
        <div className="session-list__content"><div className="session-list__top"><strong>{title}</strong><span className={`session-list__status is-${group}`}>{attention && <CircleAlert size={14} aria-hidden="true" />}{status}</span></div>
          {task && session?.archiveConfirmed && task.state !== 'accepted' && <small>{t('batch.taskNotAccepted')}</small>}
          {session ? <SessionSummary session={session} onGenerate={onSummary} /> : description && <p className="session-list__description">{description}</p>}
          <div className="session-list__meta"><span>{project}</span><span>·</span>{session && <><span>{t('batch.created')} {session.catalogCreatedAt ? fmt(session.catalogCreatedAt) : t('batch.unknownCreated')}</span><span>·</span></>}<span>{t('card.lastActivity', { at: fmt(item.at) })}</span>{completed && !historical && <><span>·</span><span>{t('session.confirmedAt', { at: fmt(task?.review?.at || session?.confirmedAt || item.at) })}</span></>}{session && !completed && <><span>·</span><span>{t(session.source === 'codex-hook' ? 'workspace.hook' : session.source === 'codex-rollout' ? 'workspace.historySource' : 'workspace.hostSource')}</span>{session.stateConfidence === 'last_observed' && <><span>·</span><span>{t('workspace.lastObservedAt', { at: fmt(session.observedAt) })}</span></>}</>}</div>
          <SessionCaptureProgress session={session} />
        </div>
        <div className="session-list__actions">
          {session && <button type="button" disabled={busy} onClick={() => onOpenSession(session.id)}><ExternalLink size={13} />{t('session.open')}</button>}
          {task && !session && <button type="button" disabled={busy} onClick={() => onOpenTask(task.id)}>{t('task.open')}</button>}
          {(session?.id || task?.sessionId) && <ExperienceCaptureButton session={session} busy={busy} onClick={action => onExperience(session?.id || task!.sessionId!, action)} />}
          {canConfirm && <button type="button" className="session-list__primary" disabled={busy} onClick={() => onArchive(session)}>{t('session.confirm')}</button>}
          {session && !canConfirm && !completed && ['waiting_user', 'waiting_confirmation', 'unknown'].includes(task ? executionColumnForTask(task) : executionColumnForSession(session)) && <button type="button" disabled={busy} onClick={() => onArchive(session)}>{t('batch.archive')}</button>}
          {task && next?.action === 'complete' && <button type="button" className="session-list__primary" disabled={busy} onClick={() => onCompleteTask(task)}>{t('session.confirm')}</button>}
          {task && next?.action === 'review' && <button type="button" className="session-list__primary" disabled={busy} onClick={() => onReviewTask(task)}>{t('review.action')}</button>}
          {task && next?.action === 'start' && <button type="button" className="session-list__primary" disabled={busy} onClick={() => onOpenCodex(task)}>{t('task.startWork')}</button>}
          {completed && <button type="button" disabled={busy} onClick={onHistory}>{t('workspace.viewHistory')}</button>}
        </div>
      </article>;
  };
  return <div className="session-list">{(Object.keys(headings) as (keyof typeof headings)[]).map(group => groups[group].length > 0 && <section key={group} className="session-list__group">
    <h2>{t(headings[group])} <span>{t('workspace.sessionCount', { count: groups[group].length })}</span></h2>
    {grouped ? <SessionProjectGroups projects={projects} pending={group === 'attention'} onBatchProject={onBatchProject} items={groups[group].map(item => ({ key: `${item.kind}-${item.id}`, task: item.kind === 'task' ? item.task : undefined, session: item.kind === 'session' ? item.session : item.task.ai, content: renderItem(item, group) }))} /> : groups[group].slice(0, limits[group] || 30).map(item => renderItem(item, group))}
    {!grouped && groups[group].length > (limits[group] || 30) && <button type="button" className="quiet small session-list__more" onClick={() => setLimits(current => ({ ...current, [group]: (current[group] || 30) + 30 }))}>{t('workspace.more', { count: groups[group].length - (limits[group] || 30) })}</button>}
  </section>)}{!Object.values(groups).some(items => items.length) && <p className="muted">{t('workspace.empty')}</p>}</div>;
}
