import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import type { ExperienceRecordView } from '../../src/types.ts';
import { EditorDialog, Field } from './TaskEditor.tsx';
import { CaptureRecordMeta, ExperienceProgress } from './ExperienceProgress.tsx';

export type CaptureDialogState =
  | { kind: 'new'; sessionId: string; recordId: string }
  | { kind: 'history'; sessionId: string }
  | { kind: 'record'; sessionId: string; recordId: string };

interface Props {
  state: CaptureDialogState;
  sessionTitle: string;
  records: ExperienceRecordView[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onPrepare: (focus: string) => void;
  onSelect: (record: ExperienceRecordView) => void;
  onOpen: (record: ExperienceRecordView) => void;
  onRetry: (record: ExperienceRecordView) => void;
  onOpenSource: () => void;
}

/** 新建时收集本次重点，历史浏览及恢复操作始终使用选定的记录。 */
export function CaptureRecordDialog({ state, sessionTitle, records, busy, error, onClose, onPrepare, onSelect, onOpen, onRetry, onOpenSource }: Props) {
  const { t } = useTranslation();
  const [focus, setFocus] = useState('');
  // 详情随工作台轮询更新，保留用户当前选中的记录。
  const selected = state.kind === 'record' ? records.find(record => record.id === state.recordId) : undefined;
  const title = state.kind === 'new' ? 'wiki.newCapture' : state.kind === 'history' ? 'wiki.captureHistory' : 'wiki.captureRecord';

  // 只有显式提交和重试触发提取，查看记录可单独打开其聊天或核对来源。
  return <EditorDialog title={t(title)} description={sessionTitle} busy={busy} error={error} onClose={onClose}>
    {state.kind === 'new' && <form onSubmit={event => { event.preventDefault(); onPrepare(focus.trim()); }}>
      <div className="task-editor__body">
        <Field type="textarea" rows={3} maxLength={2000} label={t('wiki.captureFocus')} placeholder={t('wiki.captureFocusHint')} value={focus} onChange={setFocus} disabled={busy} autoFocus />
        <p className="muted">{t('wiki.captureScope')}</p>
      </div>
      <footer className="task-editor__actions"><button type="submit" className="primary" disabled={busy}>{t('wiki.newCapture')}</button></footer>
    </form>}
    {state.kind === 'history' && <div className="task-editor__body capture-record-list">
      {records.map(record => <button key={record.id} className="capture-record-choice" type="button" disabled={busy} onClick={() => onSelect(record)}>
        <div><CaptureRecordMeta record={record} /><ExperienceProgress value={record.experience} preparation={record.preparation} /></div>
        <ChevronRight size={16} aria-hidden="true" />
      </button>)}
    </div>}
    {selected && <>
      <div className="task-editor__body capture-record-detail"><CaptureRecordMeta record={selected} /><ExperienceProgress value={selected.experience} preparation={selected.preparation} /></div>
      <footer className="task-editor__actions">
        {selected.experience && <button type="button" disabled={busy} onClick={() => onOpen(selected)}>{t('wiki.captureInspect')}</button>}
        {selected.preparation?.status === 'failed' && !selected.experience && !selected.preparation.retryAllowed && <button type="button" disabled={busy} onClick={onOpenSource}>{t('wiki.captureSourceLink')}</button>}
        {selected.preparation?.status === 'failed' && selected.preparation.retryAllowed && <button className="primary" type="button" disabled={busy} onClick={() => onRetry(selected)}>{t('wiki.retryCapture')}</button>}
      </footer>
    </>}
  </EditorDialog>;
}
