import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Dialog from '@radix-ui/react-dialog';
import { Archive, Check, CircleAlert, Folder, LoaderCircle, RefreshCw, X } from 'lucide-react';
import type { LiveSession } from '../../src/types.ts';
import { runtimeState } from '../../src/runtime.ts';

type Status = 'running' | 'pending' | 'interrupted';
function category(session: LiveSession): Status {
  const state = runtimeState(session.state);
  return ['running', 'queued'].includes(state) ? 'running' : ['interrupted', 'failed'].includes(state) ? 'interrupted' : 'pending';
}

/** 逐项展示并确认所选版本；保留具体失败原因，刷新后由用户重新确认。 */
export function SessionBatchDialog({ sessions, onClose, onConfirm, onFinished, onRefresh }: {
  sessions: LiveSession[]; onClose: () => void; onFinished: (count: number) => void;
  onConfirm: (session: LiveSession) => Promise<boolean>; onRefresh: () => Promise<LiveSession[]>;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState(sessions);
  const [selected, setSelected] = useState(() => new Set(sessions.filter(s => category(s) !== 'running').map(s => s.id)));
  const [completed, setCompleted] = useState(new Set<string>());
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [currentId, setCurrentId] = useState('');
  const [error, setError] = useState('');
  const working = useRef(false);
  const successfulIds = useRef(new Set<string>());
  const statuses = ['pending', 'interrupted', 'running'] as const;
  const names = { running: t('workspace.running'), pending: t('board.pending'), interrupted: t('batch.interrupted') };
  const chosenRunning = items.some(s => category(s) === 'running' && selected.has(s.id));
  const available = items.filter(s => !completed.has(s.id));
  const update = (ids: string[], checked: boolean) => setSelected(current => {
    const next = new Set(current);
    ids.forEach(id => checked ? next.add(id) : next.delete(id));
    return next;
  });

  const submit = async () => {
    // 固定本次显示和勾选的版本，处理期间不能改选或重复提交。
    if (working.current || !selected.size) return;
    working.current = true; setRunning(true); setError('');
    const chosen = items.filter(s => selected.has(s.id) && !completed.has(s.id));
    const nextCompleted = new Set(completed), nextFailures: Record<string, string> = {};

    // 顺序提交并逐行保留结果；接口错误不能退化为没有原因的“失败 1”。
    for (const session of chosen) {
      setCurrentId(session.id);
      try {
        if (await onConfirm(session)) { nextCompleted.add(session.id); successfulIds.current.add(session.id); }
        else nextFailures[session.id] = t('batch.unknownFailure');
      } catch (reason) {
        nextFailures[session.id] = (reason instanceof Error ? reason.message : String(reason)).slice(0, 1000);
      }
    }

    // 部分成功时只保留失败项的勾选，不把未经重新审核的新状态自动提交。
    setCompleted(nextCompleted); setFailures(nextFailures); setCurrentId('');
    setSelected(new Set(Object.keys(nextFailures)));
    working.current = false; setRunning(false);
    if (!Object.keys(nextFailures).length) { onFinished(successfulIds.current.size); onClose(); }
  };
  const refresh = async () => {
    // 刷新只更换展示版本；仍须用户查看后再次点击确认。
    if (working.current) return;
    working.current = true; setRunning(true); setError('');
    try {
      const fresh = await onRefresh();
      const done = new Set(fresh.filter(s => s.archiveConfirmed && s.confirmedAt).map(s => s.id));
      setItems(fresh); setCompleted(done); setFailures({});
      setSelected(current => new Set(fresh.filter(s => current.has(s.id) && !done.has(s.id)).map(s => s.id)));
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { working.current = false; setRunning(false); }
  };

  // 展示同一批次的选择、状态与错误，底部操作始终与这些显示版本对应。
  return <Dialog.Root open onOpenChange={open => { if (!open && !running) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="task-editor-backdrop" />
    <Dialog.Content className="session-batch-panel" onEscapeKeyDown={event => { if (running) event.preventDefault(); }} onPointerDownOutside={event => event.preventDefault()}>
      <header className="session-batch__header"><span className="session-batch__icon"><Archive size={20} aria-hidden="true" /></span><div><Dialog.Title>{t('batch.title')}</Dialog.Title><Dialog.Description>{t('batch.description')}</Dialog.Description></div><button type="button" className="icon-button quiet" disabled={running} onClick={onClose} aria-label={t('common.closeDialog')}><X size={18} /></button></header>
      <div className="session-batch__body">
        <div className="session-batch__selection"><strong>{t('batch.selected', { count: selected.size, total: available.length })}</strong><button type="button" className="quiet" disabled={running || !available.length} onClick={() => update(available.map(s => s.id), selected.size !== available.length)}>{t(selected.size === available.length ? 'batch.deselectAll' : 'batch.selectAll')}</button></div>
        <div className="session-batch__filters" aria-label={t('batch.statusSelection')}>{statuses.map(status => {
          const group = available.filter(s => category(s) === status);
          if (!group.length) return null;
          const count = group.filter(s => selected.has(s.id)).length;
          return <label key={status} className={`session-batch__filter ${count ? 'is-selected' : ''}`}><input type="checkbox" disabled={running} checked={count === group.length} ref={node => { if (node) node.indeterminate = count > 0 && count < group.length; }} onChange={event => update(group.map(s => s.id), event.target.checked)} /><span>{names[status]}</span><b>{count}<span>/{group.length}</span></b></label>;
        })}</div>
        {Object.keys(failures).length > 0 && <div className="session-batch__result" role="alert"><CircleAlert size={16} /><span>{t('batch.result', { succeeded: successfulIds.current.size, failed: Object.keys(failures).length })}</span><button type="button" className="quiet" disabled={running} onClick={refresh}><RefreshCw size={13} />{t('batch.refreshState')}</button></div>}
        <div className="session-batch__sessions">{items.map(session => {
          const done = completed.has(session.id), failed = failures[session.id], processing = currentId === session.id;
          const project = session.cwd.split(/[\\/]/).filter(Boolean).at(-1) || session.cwd;
          return <label key={session.id} className={`session-batch__row ${selected.has(session.id) ? 'is-selected' : ''} ${failed ? 'has-error' : ''} ${done ? 'is-done' : ''}`}>
            <span className="session-batch__checkbox"><input type="checkbox" disabled={running || done} checked={selected.has(session.id)} aria-label={session.title || session.id} onChange={event => update([session.id], event.target.checked)} /><span aria-hidden="true">{(selected.has(session.id) || done) && <Check size={12} />}</span></span>
            <span className="session-batch__row-content"><strong>{session.title || session.id}</strong><small title={session.cwd}><Folder size={12} aria-hidden="true" />{project}</small>{failed && <span className="session-batch__row-error"><CircleAlert size={13} aria-hidden="true" />{failed}</span>}</span>
            <span className={`session-batch__badge is-${done ? 'done' : category(session)}`}>{processing ? <LoaderCircle size={13} className="experience-spinner" aria-hidden="true" /> : null}{done ? t('board.completed') : processing ? t('batch.processing') : names[category(session)]}</span>
          </label>;
        })}{!items.length && <p className="session-batch__empty">{t('batch.empty')}</p>}</div>
        {chosenRunning && <p className="session-batch__warning"><CircleAlert size={15} />{t('batch.runningWarning')}</p>}
        {error && <p role="alert" className="session-batch__row-error">{error}</p>}
      </div>
      <footer className="session-batch__footer"><span>{t('batch.footerHint')}</span><div><button type="button" className="quiet" disabled={running} onClick={onClose}>{t('common.cancel')}</button><button type="button" className="session-batch__confirm" disabled={running || !selected.size} onClick={submit}>{running ? <LoaderCircle size={14} className="experience-spinner" /> : <Check size={14} />}{t('batch.confirm', { count: selected.size })}</button></div></footer>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
