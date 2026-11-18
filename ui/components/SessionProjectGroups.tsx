import type { ReactNode } from 'react';
import type { LiveSession, Project, Task } from '../../src/types.ts';
import { sessionProject, eligibleProjectPending } from '../session-list.ts';
import { useTranslation } from 'react-i18next';

export interface ProjectGroupItem { key: string; task?: Task; session?: LiveSession | null; content: ReactNode }
/** 按项目合并任务和会话卡片，并提供项目级批量入口。 */
export function SessionProjectGroups({ items, projects, pending, onBatchProject }: { items: ProjectGroupItem[]; projects: Project[]; pending: boolean; onBatchProject: (projectId: string) => void }) {
  const { t } = useTranslation();
  const groups = new Map<string, { title: string; items: ProjectGroupItem[] }>();
  for (const item of items) {
    const project = sessionProject(projects, item.task, item.session);
    const group = groups.get(project.id) ?? { title: project.title || t('project.none'), items: [] };
    group.items.push(item); groups.set(project.id, group);
  }
  return <>{[...groups.entries()].map(([id, group]) => <details key={id} open className="session-project-group">
    <summary><strong>{group.title}</strong><span>{t('workspace.sessionCount', { count: group.items.length })}</span></summary>
    {pending && group.items.some(item => item.session && eligibleProjectPending(item.session, item.task)) && <button type="button" className="session-project-group__batch" onClick={() => onBatchProject(id)}>{t('batch.completeProject')}</button>}
    <div className="session-project-group__items">{group.items.map(item => <div key={item.key}>{item.content}</div>)}</div>
  </details>)}</>;
}
