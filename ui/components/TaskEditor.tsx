import { useTranslation } from 'react-i18next';
// Adapted from Xinmo Desktop TaskEditor.tsx: definition, advanced fields and AI workbench.
import type { InputHTMLAttributes, ChangeEvent, ReactNode } from 'react';
import type { Task, DefinitionSuggestion, DefinitionField, TransitionState } from '../../src/types.ts';
import type { TaskEditorProps } from '../types.ts';
import { useEffect, useId, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Code2, ExternalLink, Link2, Save, Sparkles, X } from 'lucide-react';
import { DatePickerField, SelectField } from './FormControls.tsx';
import { AiBadge } from './ExecutionView.tsx';
import { dateInput, fmt, hours, labels, parseSchedule, runtimeLabel } from '../format.ts';
import { taskStatus, taskNextStep } from '../execution-board.ts';

export function EditorDialog({ title, description, busy, error, onClose, children }: { title: string; description: string; busy: boolean; error: string; onClose: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="task-editor-backdrop" />
    <Dialog.Content className="task-editor" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => event.preventDefault()}>
      <header className="task-editor__header"><div><Dialog.Title asChild><h2>{title}</h2></Dialog.Title><Dialog.Description className="muted">{description}</Dialog.Description></div><Dialog.Close asChild><button className="icon-button quiet" disabled={busy} aria-label={t("common.closeDialog")}><X size={18} /></button></Dialog.Close></header>
      {children}
      {error && <div className="editor-error" role="alert">{error}</div>}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}

export function Field({ label, value, onChange, type = 'text', action, hint, ...props }: Omit<InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement>, 'onChange'> & { label: string; onChange: (value: string) => void; action?: ReactNode; hint?: string; rows?: number }) {
  const id = useId();
  const inputProps = { id, value: value ?? '', onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value), ...(hint ? { 'aria-describedby': `${id}-hint` } : {}), ...props };
  return <div className="editor-field"><label htmlFor={id}>{label}</label><div className={`editor-field__control ${action ? 'has-action' : ''}`}>{type === 'textarea' ? <textarea {...inputProps} /> : <input type={type} onInput={type === 'time' ? event => onChange(event.currentTarget.value) : undefined} {...inputProps} />}{action}</div>{hint && <small id={`${id}-hint`}>{hint}</small>}</div>;
}

export function ScheduleFields({ values, setValue, disabled }: { values: { plannedStart: string; plannedEnd: string }; setValue: (name: 'plannedStart' | 'plannedEnd', value: string) => void; disabled: boolean }) {
  const { t } = useTranslation();
  return <div className="editor-field-pair"><DatePickerField label={t("schedule.start")} type="datetime-local" value={values.plannedStart} disabled={disabled} onValueChange={value => setValue('plannedStart', value)} /><DatePickerField label={t("schedule.end")} type="datetime-local" value={values.plannedEnd} disabled={disabled} onValueChange={value => setValue('plannedEnd', value)} /></div>;
}

export function Delivery({ task }: { task: Pick<Task, 'delivery'> }) {
  const { t } = useTranslation();
  const delivery = task.delivery;
  if (!delivery) return null;
  return <section className="dialog-section"><h3>{t("delivery.evidence")}</h3><p>{delivery.summary}</p>{delivery.evidence.map((evidence, index) => <div className="evidence" key={index}><strong>{evidence.label}</strong><p>{/^https?:\/\//.test(evidence.uri) ? <a href={evidence.uri} target="_blank" rel="noreferrer">{evidence.uri}</a> : <span className="mono">{evidence.uri}</span>}</p><p>{evidence.note}</p></div>)}<p className="muted">{t("delivery.submittedAt", { at: fmt(delivery.submittedAt) })}</p></section>;
}

export function TaskEditor({ task = {}, history = [], snapshot, busy, onSave, onRefine, onSyncProjects, onTransition, onBind, onSubmitDelivery, onReview, onComplete, onFocus, onPrompt, onOpenCodex, onDelete }: TaskEditorProps) {
  const { t } = useTranslation();
  const creating = !task.id;
  const editable = creating || !['accepted', 'awaiting_acceptance', 'cancelled'].includes(task.state ?? '');
  const disabled = busy || !editable;
  const [values, setValues] = useState(() => ({ title: task.title || '', description: task.description || '', criteria: task.criteria || '', priority: task.priority || 'normal', projectId: task.projectId || '', keyResultId: task.keyResultId || '', remindAt: dateInput(task.remindAt), plannedStart: dateInput(task.plannedStart), plannedEnd: dateInput(task.plannedEnd) }));
  const savedValues = useRef(values);
  const hasChanges = (Object.keys(values) as (keyof typeof values)[]).some(key => values[key] !== savedValues.current[key]);
  const [sessionId, setSessionId] = useState(task.sessionId || '');
  const [aiPreview, setAiPreview] = useState<DefinitionSuggestion | null>(null);
  const [refining, setRefining] = useState<DefinitionField | null>(null);
  const previewRef = useRef<HTMLElement>(null);
  useEffect(() => { if (aiPreview) previewRef.current?.scrollIntoView({ block: 'start' }); }, [aiPreview]);
  const setValue = (name: string, value: string) => { setAiPreview(null); setValues(current => ({ ...current, [name]: value })); };
  const improveDefinition = async (field: DefinitionField) => {
    setRefining(field); setAiPreview(null);
    try { await onRefine({ title: values.title, description: values.description, criteria: values.criteria, projectId: values.projectId || null }, setAiPreview, field); }
    finally { setRefining(null); }
  };
  const aiAction = (field: DefinitionField, label: string) => <button type="button" className="editor-field__ai" disabled={disabled || !values.title.trim()} onClick={() => improveDefinition(field)} aria-busy={refining === field} aria-label={refining === field ? t("ai.generatingField", { label: label }) : field === 'title' ? t("ai.improveTitle") : t("ai.optimizeField", { label: label })} title={refining === field ? t("ai.generating") : field === 'title' ? t("ai.titleHint") : t("ai.fieldHint", { label: label })}><Sparkles size={13} aria-hidden="true" /></button>;
  const selectedProject = snapshot.projects.find(project => project.id === values.projectId);
  const groups = (items: string[][]) => [{ options: items.map(([value, label]) => ({ value, label })) }];
  const transitions = ({ defining: ['ready', 'cancelled'], ready: ['defining', 'executing', 'cancelled'], executing: ['cancelled'], changes_requested: ['executing', 'cancelled'], accepted: ['defining'], cancelled: ['defining'], awaiting_acceptance: [] } as Record<string, TransitionState[]>)[task.state ?? ''] || [];
  const liveTask = { ...task, ...snapshot.tasks.find(item => item.id === task.id) } as Task;
  const next = creating ? null : taskNextStep(liveTask);
  useEffect(() => { setSessionId(liveTask.sessionId || ''); }, [liveTask.sessionId]);
  return <form onSubmit={event => {
    event.preventDefault();
    onSave({ title: values.title, description: values.description, criteria: values.criteria, priority: values.priority, projectId: values.projectId || null, keyResultId: values.keyResultId || null, remindAt: values.remindAt ? new Date(values.remindAt).toISOString() : null, ...parseSchedule(values) });
  }}>
    <div className="task-editor__body">
      {!creating && <div className="row"><span className={`execution-status status-${liveTask.state}`}>{taskStatus(liveTask)}</span>{taskStatus(liveTask) !== t(labels[liveTask.state]) && <span className="execution-dependency">{t("task.deliveryState", { state: t(labels[liveTask.state]) })}</span>}{taskStatus(liveTask) !== runtimeLabel(liveTask.ai) && <AiBadge task={liveTask} />}<span className="mono">r{task.revision}</span>{(liveTask.sessionId || ['defining', 'ready', 'changes_requested'].includes(liveTask.state)) && onOpenCodex && <><button type="button" className="quiet small" disabled={busy || (!liveTask.sessionId && hasChanges)} onClick={onOpenCodex}><ExternalLink size={14} />{t("session.open")}</button>{!liveTask.sessionId && hasChanges && <small className="muted">{t("task.saveFirst")}</small>}</>}</div>}
      <Field label={t("task.name")} value={values.title} onChange={value => setValue('title', value)} required maxLength={300} disabled={disabled} autoFocus placeholder={t("task.namePlaceholder")} action={aiAction('title', t("task.name"))} />
      {task.capture && <details className="editor-advanced"><summary><span><strong>{t("inbox.original")}</strong><small>{fmt(task.capture.capturedAt)}</small></span></summary><p className="editor-advanced__body">{task.capture.title}</p></details>}
      <fieldset className="editor-field priority-field" disabled={disabled}><legend>{t("task.priority")}</legend><div className="priority-segment">{[['low', t("priority.low")], ['normal', t("priority.normal")], ['high', t("priority.high")]].map(([value, label]) => <button key={value} type="button" className={values.priority === value ? 'is-active' : ''} aria-pressed={values.priority === value} onClick={() => setValue('priority', value)}>{label}</button>)}</div></fieldset>
      <section className="task-definition"><header className="task-definition__header"><span><strong>{t("task.definition")}</strong><small>{t("ai.definitionHint")}</small></span></header>
        <Field label={t("task.description")} type="textarea" rows={3} value={values.description} onChange={value => setValue('description', value)} disabled={disabled} action={aiAction('description', t("task.description"))} />
        <Field label={t("task.criteria")} type="textarea" rows={3} value={values.criteria} onChange={value => setValue('criteria', value)} disabled={disabled} placeholder={t("task.criteriaPlaceholder")} action={aiAction('criteria', t("task.criteria"))} />
        {aiPreview && <section ref={previewRef} className="task-definition__ai-preview" aria-label={t("ai.preview")}><header><span><strong>{t("ai.suggestions")}</strong><small>{t("ai.confirmHint")}</small></span></header><div className="task-definition__ai-diff">{([['title', t("task.name")], ['description', t("task.description")], ['criteria', t("task.criteria")]] as const).filter(([name]) => name in aiPreview).map(([name, label]) => <div key={name}><strong>{label}</strong><p><small>{t("common.current")}</small><span>{values[name] || t("common.empty")}</span></p><p className="is-suggested"><small>{t("common.suggestion")}</small><span>{aiPreview[name]}</span></p></div>)}</div><footer><button type="button" className="text-button" disabled={busy} onClick={() => setAiPreview(null)}>{t("ai.skip")}</button><button type="button" className="primary" disabled={busy} onClick={() => { setValues(current => ({ ...current, ...aiPreview })); setAiPreview(null); }}>{t("ai.apply")}</button></footer></section>}
      </section>
      <details className="editor-advanced"><summary><Link2 size={15} /><span><strong>{t("schedule.title")}</strong><small>{values.plannedStart ? t("schedule.scheduled") : t("schedule.unscheduled")} · {snapshot.projects.find(project => project.id === values.projectId)?.title || t("project.none")}</small></span></summary><div className="editor-advanced__body">
        <ScheduleFields values={values} setValue={setValue} disabled={disabled} />
        <div className="editor-field-pair"><SelectField label={t("entity.project")} value={values.projectId} onValueChange={value => setValue('projectId', value)} disabled={disabled} groups={groups([['', t("project.none")], ...snapshot.projects.map(project => [project.id, `${project.title}${project.codex ? ' · Codex' : ''}`])])} /></div>
        {selectedProject?.codex && <p className="project-path">{selectedProject.codex.workspacePath}</p>}
        <button type="button" className="text-button" disabled={busy} onClick={onSyncProjects}>{t("project.sync")}</button>
      </div></details>
      {!editable && <p className="note">{t("task.lockedHint")}</p>}
    {!creating && <div className="editor-details">
      <details className="editor-advanced"><summary><span><strong>{t("task.otherActions")}</strong></span></summary><div className="editor-advanced__body"><div className="row">{transitions.map(state => <button type="button" key={state} className={state === 'cancelled' ? 'danger small' : 'small'} disabled={busy || hasChanges} onClick={() => onTransition(state)}>{state === 'defining' ? t("task.redefine") : state === 'ready' ? t("task.ready") : state === 'executing' ? t("task.execute") : t("task.cancel")}</button>)}{task.state === 'executing' && <button type="button" className="small" disabled={busy || hasChanges} onClick={onSubmitDelivery}>{t('delivery.submit')}</button>}{!['accepted', 'cancelled'].includes(task.state ?? '') && snapshot.focus.status === 'idle' && <button type="button" className="small" disabled={busy} onClick={onFocus}>{t("focus.taskAction")}</button>}{task.state === 'defining' && <button type="button" disabled={busy} className="danger small" onClick={onDelete}>{t("task.deleteUnstarted")}</button>}</div></div></details>
      <details className="codex-settings"><summary><Code2 size={15} /><span><strong>{t("ai.linkTitle")}</strong><small>{liveTask.sessionId || t("ai.unlinked")}</small></span></summary><div className="codex-settings__body"><code className="mono">{t("ai.taskId", { id: task.id })}</code>{['defining', 'ready', 'changes_requested'].includes(task.state ?? '') && <><SelectField label={t("ai.trustedSession")} value={sessionId} disabled={busy} onValueChange={setSessionId} groups={groups([['', t("ai.unlink")], ...snapshot.sessions.map(session => [session.id, `${session.title || session.id.slice(0, 8)} · ${runtimeLabel(session)}`])])} /><button type="button" disabled={busy} onClick={() => onBind(sessionId || null)}>{t("ai.saveLink")}</button></>}<p className="muted">{t("ai.linkHint")}</p><button type="button" disabled={busy} onClick={onPrompt}>{t("ai.generatePrompt")}</button></div></details>
      <Delivery task={task} />
      {task.review && <section className="dialog-section"><h3>{t("review.latest")}</h3><p>{task.review.decision === 'accept' ? t("review.accept") : t("review.reject")} · {task.review.reviewer}{t("review.actualRevision", { revision: task.review.reviewedRevision })}</p><p className="muted">{task.review.note}</p></section>}
      <section className="dialog-section"><h3>{t("history.title")}</h3><ul className="history">{history.map((event, index) => <li key={index}><time>{fmt(event.at)}</time>{({ created: t("task.create"), updated: t("history.updated"), transition: t("history.transition", { value: t(labels[event.state ?? ''] || 'common.unknown') }), bind: t("history.bound"), submit: t("history.submitted"), review: event.decision === 'accept' ? t("history.accepted") : t("history.rejected"), focus: t("history.focus", { value: hours(event.durationMs ?? 0) }) } as Record<string, string>)[event.type] || event.type}{event.reviewer && <span className="muted"> · {event.reviewer}</span>}{event.note && <p>{event.note}</p>}{event.reviewedRevision && <span className="muted">{t("history.reviewed", { revision: event.reviewedRevision })}</span>}</li>)}</ul></section>
    </div>}
    </div>
    {(editable || next) && <footer className="task-editor__actions">
      {next && <div className="task-editor__next"><strong>{t('task.nextStep')}</strong><small>{t(hasChanges ? 'task.saveBeforeNext' : next.hint)}</small></div>}
      {editable && <button className={next ? '' : 'primary'} type="submit" disabled={busy}><Save size={16} />{busy ? refining ? t("ai.waiting") : t("common.processing") : creating ? t("task.create") : t("common.saveChanges")}</button>}
      {next?.action === 'start' && <button type="button" disabled={busy || hasChanges} onClick={onComplete}>{t("session.confirm")}</button>}
      {next && <button className="primary" type="button" disabled={busy || hasChanges} onClick={() => next.action === 'complete' ? onComplete() : next.action === 'review' ? onReview() : onOpenCodex()}>{t(next.label)}</button>}
    </footer>}
  </form>;
}
