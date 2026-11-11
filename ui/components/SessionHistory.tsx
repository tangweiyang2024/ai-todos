import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import type { LiveSession, Task } from '../../src/types.ts';
import { runtimeLabel } from '../../src/runtime.ts';
import { fmt } from '../format.ts';
import { sessionActivityRows } from '../session-activity.ts';

export function SessionHistory({ sessions, tasks, onOpenSession }: { sessions: LiveSession[]; tasks: Task[]; onOpenSession: (id: string) => void }) {
  const { t } = useTranslation();
  const [limit, setLimit] = useState(100);
  const rows = sessionActivityRows(sessions, tasks);
  return <section className="session-history" aria-label={t('activity.title')}>
    <p className="muted">{t('activity.hint')}</p>
    {rows.slice(0, limit).map((row, index) => <article className="session-history__item" key={`${row.session.id}-${row.at}-${row.event}-${index}`}>
      <time>{fmt(row.at)}</time>
      <div><strong>{row.task?.title || row.session.title || `Codex · ${row.session.id.slice(-8)}`}</strong>
        <span className="execution-status">{row.state === 'confirmed' ? t('activity.confirmed') : runtimeLabel({ state: row.state }) || t('runtime.unknown')}</span>
        {(row.task?.description || row.session.preview) && <p className="execution-card__preview">{row.task?.description || row.session.preview}</p>}
      </div>
      <button type="button" className="quiet small" onClick={() => onOpenSession(row.session.id)}><ExternalLink size={12} />{t('session.open')}</button>
    </article>)}
    {rows.length > limit && <button className="quiet small" onClick={() => setLimit(limit + 100)}>{t('activity.more', { count: rows.length - limit })}</button>}
    {!rows.length && <p className="muted">{t('activity.empty')}</p>}
  </section>;
}
