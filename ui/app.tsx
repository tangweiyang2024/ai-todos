import { mergeTaskUpdates } from './task-updates.ts';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { i18n, getLocale, applyHostLocale, getLanguagePreference, setLanguagePreference, languages, localizedError } from './i18n.ts';
import type { LanguagePreference } from './i18n.ts';
import type { TranslationKey, Locale } from '../src/i18n.ts';
import type { ReactNode } from 'react';
import type { Task, TaskDraft, Project, KeyResult, Plan, InboxItem, Entity, Kind, Snapshot, TaskEvent, DefinitionSuggestion, CaptureSuggestion, DefinitionField, Delivery as TaskDelivery, Session, CommandInput, TransitionState } from '../src/types.ts';
import type { Modal, Decision, FocusOperation, TaskCallbacks } from './types.ts';
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } from '@modelcontextprotocol/ext-apps';
import { Maximize2, Plus, RefreshCw, Search, Settings } from 'lucide-react';
import { DatePickerField, SelectField } from './components/FormControls.tsx';
import { BoardView, ExecutionCard } from './components/ExecutionView.tsx';
import { SessionHistory } from './components/SessionHistory.tsx';
import { SessionList } from './components/SessionList.tsx';
import { ProjectPicker } from './components/ProjectPicker.tsx';
import { TaskEditor, EditorDialog, Field, ScheduleFields, Delivery } from './components/TaskEditor.tsx';
import { TodayView, DailyPlanEditor, dayPlans } from './components/TodayView.tsx';
import { InboxView } from './components/InboxView.tsx';
import { clock, dateInput, fmt, hours, labels, localDay, parseSchedule, number } from './format.ts';
import { executionPrompt } from './codex-prompts.ts';
import { visibleExecutionSessions, executionColumnForSession } from './execution-board.ts';
import './xinmo.css';
import './style.css';
import './refinement.css';
import './workspace.css';

const localOrigin = '__AI_TODOS_ORIGIN__';
const embedded = window.parent !== window;
const bridge = embedded ? new App({ name: 'ai-todos', version: '0.1.10' }, { availableDisplayModes: ['inline', 'fullscreen'] }, { autoResize: false }) : null;
const mainPages = { work: 'nav.work', projects: 'nav.projects' } as const;
const pages: Record<string, TranslationKey> = { ...mainPages, today: 'nav.today', inbox: 'nav.inbox', plans: 'nav.plans', settings: 'nav.settings' };
const singular: Record<string, TranslationKey> = { task: 'entity.task', project: 'entity.project', objective: 'entity.objective', keyResult: 'entity.keyResult', plan: 'entity.plan' };
let csrf: string | undefined;
interface SyncResult { count: number; added: number; updated: number; transport?: string }
function api(path: 'state'): Promise<Snapshot>;
function api(path: 'task', data: { id: string }): Promise<{ task: Task; history: TaskEvent[] }>;
function api(path: 'review-ticket', data: { id: string; revision: number }): Promise<{ ticket: string; task: Task }>;
function api(path: 'codex', data: { operation: 'prepare_task_session'; id: string; revision: number; locale?: Locale }): Promise<{ sessionId: string; prefillTask: boolean }>;
function api(path: 'codex', data: { operation: 'sync_projects' | 'sync_threads' }): Promise<SyncResult>;
function api(path: 'codex', data: { operation: 'refine'; draft: TaskDraft; field?: DefinitionField }): Promise<DefinitionSuggestion>;
function api(path: 'codex', data: { operation: 'capture_refine'; draft: TaskDraft }): Promise<CaptureSuggestion>;
function api(path: 'session-confirm', data: Omit<Parameters<TaskCallbacks['onConfirmSession']>[0], 'catalogUpdatedAt'> & { catalogUpdatedAt: string | null; confirmed: true }): Promise<Session>;
function api(path: string, data: unknown): Promise<unknown>;
async function api(path: string, data?: unknown): Promise<unknown> {
  if (embedded) {
    const names: Record<string, string> = { state: 'ai_todos_workspace', command: 'ai_todos_manage', task: 'ai_todos_task', codex: 'ai_todos_codex', 'session-confirm': 'ai_todos_confirm_session', 'task-complete': 'ai_todos_complete_task' };
    if (!names[path]) throw new Error(i18n.t("connection.localReview"));
    const result = await bridge!.callServerTool({ name: names[path], arguments: (path === 'command' ? { command: data } : path === 'codex' ? { action: data } : (data ?? {})) as Record<string, unknown> });
    if (result.isError) throw new Error(localizedError(result.structuredContent ?? { error: result.content?.find(item => item.type === 'text')?.text }));
    return result.structuredContent ?? JSON.parse(result.content.find(item => item.type === 'text')!.text);
  }
  const response = await fetch(`/api/${path}`, { method: data ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf || '' }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const value = await response.json();
  if (!response.ok) throw new Error(localizedError(value));
  return value;
}
async function openLocal(id?: string) {
  const url = `${localOrigin}/${id ? `#task=${id}` : ''}`;
  if (embedded) { const result = await bridge!.openLink({ url }); if (result.isError) throw new Error(i18n.t("connection.openDenied", { url: url })); }
  else window.open(url, '_blank', 'noopener');
}
async function openCodexSession(id: string, prefillTask?: boolean) {
  await api('codex', { operation: 'open_session', id, locale: getLocale(), ...(prefillTask ? { prefillTask } : {}) });
}

function EntityForm({ kind, entity = {}, parent, snapshot, busy, onSave, onDelete }: { kind: Kind; entity?: Partial<Task & Project & KeyResult & Plan & InboxItem>; parent?: string; snapshot: Snapshot; busy: boolean; onSave: (data: Record<string, unknown>) => Promise<boolean>; onDelete: () => void }) {
  const { t } = useTranslation();
  const [values, setValues] = useState(() => ({ ...entity, title: entity.title || '', description: entity.description || '', plannedStart: dateInput(entity.plannedStart), plannedEnd: dateInput(entity.plannedEnd), objectiveId: entity.objectiveId || parent || snapshot.objectives[0]?.id || '', unit: entity.unit || '', baseline: entity.baseline ?? 0, target: entity.target ?? 100, current: entity.current ?? 0, date: entity.date || localDay(new Date()), note: entity.note || '', taskIds: entity.taskIds || [] }));
  const setValue = (name: string, value: string | string[]) => setValues(current => ({ ...current, [name]: value }));
  return <form onSubmit={event => {
    event.preventDefault();
    const data: Record<string, unknown> = { title: values.title };
    if (entity.codex) delete data.title;
    if (['project', 'objective'].includes(kind)) data.description = values.description;
    if (kind === 'objective') Object.assign(data, parseSchedule(values));
    if (kind === 'keyResult') Object.assign(data, { objectiveId: values.objectiveId, unit: values.unit, baseline: Number(values.baseline), target: Number(values.target), current: Number(values.current) });
    if (kind === 'plan') Object.assign(data, { date: values.date, note: values.note, taskIds: values.taskIds });
    onSave(data);
  }}><div className="task-editor__body">
    <Field label={t("common.name")} value={values.title} onChange={value => setValue('title', value)} required maxLength={300} disabled={busy || !!entity.codex} autoFocus={!entity.codex} />
    {entity.codex && <p className="project-path">Codex · {entity.codex.workspacePath}<br />{t("project.managed")}</p>}
    {['project', 'objective'].includes(kind) && <Field label={t("common.description")} type="textarea" value={values.description} onChange={value => setValue('description', value)} disabled={busy} />}
    {kind === 'objective' && <ScheduleFields values={values} setValue={setValue} disabled={busy} />}
    {kind === 'keyResult' && <><SelectField label={t("okr.objective")} value={values.objectiveId} disabled={busy} onValueChange={value => setValue('objectiveId', value)} groups={[{ options: snapshot.objectives.map(objective => ({ value: objective.id, label: objective.title })) }]} />
      <Field label={t("okr.unit")} value={values.unit} onChange={value => setValue('unit', value)} maxLength={40} disabled={busy} placeholder={t("okr.unitPlaceholder")} hint={t("okr.unitHint")} />
      <div className="form-grid">{([['baseline', t("okr.baseline")], ['target', t("okr.target")], ['current', t("okr.current")]] as const).map(([name, label]) => <Field key={name} label={label} type="number" value={values[name]} onChange={value => setValue(name, value)} required step="any" disabled={busy} />)}</div></>}
    {kind === 'plan' && <><DatePickerField label={t("plan.date")} value={values.date} onValueChange={value => setValue('date', value)} disabled={busy} /><Field label={t("common.note")} type="textarea" value={values.note} onChange={value => setValue('note', value)} disabled={busy} />
      <section className="plan-task-panel"><header className="plan-task-panel__header"><span><strong>{t("plan.includedTasks")}</strong><small>{t("plan.selectedCount", { count: values.taskIds.length })}</small></span></header><div className="plan-task-list">{snapshot.tasks.filter(task => task.state !== 'cancelled' || values.taskIds.includes(task.id)).map(task => {
        const selected = values.taskIds.includes(task.id);
        return <div key={task.id} className={`plan-task-option ${selected ? 'is-selected' : ''}`}><span className="plan-task-check-slot"><input type="checkbox" id={`plan-${task.id}`} checked={selected} disabled={busy} onChange={event => setValue('taskIds', event.target.checked ? [...values.taskIds, task.id] : values.taskIds.filter(id => id !== task.id))} /></span><div className="plan-task-option__main"><label className="plan-task-title" htmlFor={`plan-${task.id}`}>{task.title}</label><small>{t(labels[task.state])}</small></div></div>;
      })}{!snapshot.tasks.length && <p className="empty-state compact">{t("plan.noTasks")}</p>}</div></section></>}
    </div><footer className="task-editor__actions">{entity?.id && <button type="button" className="danger" disabled={busy} onClick={onDelete}>{t("common.delete")}</button>}<button type="submit" className="primary" disabled={busy}>{busy ? t("common.saving") : t("entity.save", { value: t(singular[kind]) })}</button></footer>
  </form>;
}

function DeliveryForm({ busy, onSave }: { busy: boolean; onSave: (data: Pick<TaskDelivery, 'summary' | 'evidence'>) => Promise<boolean> }) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, string>>({ summary: '', label: '', uri: '', note: '' });
  return <form onSubmit={event => { event.preventDefault(); onSave({ summary: values.summary, evidence: [{ label: values.label, uri: values.uri, note: values.note }] }); }}><div className="task-editor__body">
    {[[ 'summary', t("delivery.summary"), 'textarea' ], ['label', t("delivery.evidenceLabel")], ['uri', t("delivery.evidenceUri")], ['note', t("delivery.evidenceNote"), 'textarea']].map(([name, label, type]) => <Field key={name} label={label} type={type} value={values[name]} onChange={value => setValues(current => ({ ...current, [name]: value }))} required={name !== 'note'} maxLength={name === 'summary' ? 300 : undefined} disabled={busy} />)}
    <label className="check-label"><input type="checkbox" required disabled={busy} />{t("delivery.confirm")}</label><p className="note">{t("delivery.hint")}</p></div><footer className="task-editor__actions"><button className="primary" type="submit" disabled={busy}>{t("delivery.submitAcceptance")}</button></footer>
  </form>;
}

function ReviewForm({ task, decision = 'accept', busy, onSave }: { task: Task; decision?: Decision; busy: boolean; onSave: (data: { reviewer: string; decision: Decision; note: string; confirmed: boolean }) => Promise<boolean> }) {
  const { t } = useTranslation();
  const [values, setValues] = useState({ reviewer: '', decision, note: '', confirmed: false });
  return <form onSubmit={event => { event.preventDefault(); onSave(values); }}><div className="task-editor__body"><p className="note">{t("review.intro", { title: task.title, revision: task.revision })}</p><section className="dialog-section"><h3>{t("task.criteria")}</h3><p>{task.criteria}</p></section><Delivery task={task} />
    <Field label={t("review.reviewer")} value={values.reviewer} onChange={value => setValues(current => ({ ...current, reviewer: value }))} required disabled={busy} />
    <SelectField label={t("review.decision")} value={values.decision} disabled={busy} onValueChange={value => setValues(current => ({ ...current, decision: value as Decision }))} groups={[{ options: [{ value: 'accept', label: t("review.accept") }, { value: 'reject', label: t("review.reject") }] }]} />
    <Field label={t("review.note")} type="textarea" value={values.note} onChange={value => setValues(current => ({ ...current, note: value }))} required={values.decision === 'reject'} disabled={busy} />
    <label className="check-label"><input type="checkbox" checked={values.confirmed} onChange={event => setValues(current => ({ ...current, confirmed: event.target.checked }))} required disabled={busy} />{t("review.confirm")}</label></div><footer className="task-editor__actions"><button type="submit" className="primary" disabled={busy}>{t("review.record")}</button></footer>
  </form>;
}

function dailyTotals(snapshot: Snapshot) {
  const totals = new Map<string, { day: string; taskId: string | null; ms: number }>();
  const addSegment = (taskId: string | null, start: string, end: string) => {
    let cursor = new Date(start).getTime(); const stop = new Date(end).getTime();
    while (cursor < stop) {
      const day = localDay(new Date(cursor)), next = new Date(cursor); next.setHours(24, 0, 0, 0);
      const limit = Math.min(stop, next.getTime()), key = `${day}:${taskId}`;
      totals.set(key, { day, taskId, ms: (totals.get(key)?.ms || 0) + limit - cursor }); cursor = limit;
    }
  };
  snapshot.timeRecords.forEach(record => record.segments.forEach(segment => addSegment(record.taskId, segment.start, segment.end)));
  snapshot.focus.segments.forEach(segment => addSegment(snapshot.focus.taskId, segment.start, segment.end));
  if (snapshot.focus.startedAt) addSegment(snapshot.focus.taskId, snapshot.focus.startedAt, snapshot.serverTime);
  return [...totals.values()];
}

function Workspace() {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connectionError, setConnectionError] = useState('');
  const [hostContext, setHostContext] = useState<ReturnType<App['getHostContext']>>();
  const [threadTransport, setThreadTransport] = useState<string | null>(null);
  const [view, setView] = useState({ page: 'work', mode: 'list', project: '', search: '' });
  const [modal, setModal] = useState<Modal | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [, setTick] = useState(0);
  const [focusTaskId, setFocusTaskId] = useState('');
  const [statsDate, setStatsDate] = useState(localDay(new Date()));
  const receivedAt = useRef(Date.now()), snapshotRef = useRef<Snapshot>(null), refreshing = useRef<Promise<Snapshot> | null>(null), busyRef = useRef(false), modalRef = useRef<Modal | null>(null), toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), syncingThreads = useRef<Promise<SyncResult> | null>(null), lastThreadSync = useRef(0);
  const mounted = useRef(false);
  modalRef.current = modal;
  const scheduling = useRef(new Set<string>());
  const toast = (value: string) => { if (!mounted.current) return; setMessage(value); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setMessage(''), 6000); };
  const refresh = async (force = false) => {
    if (refreshing.current) {
      const previous = refreshing.current;
      if (!force) return previous;
      await previous.catch(() => {});
      if (refreshing.current && refreshing.current !== previous) return refreshing.current;
    }
    if (!mounted.current) throw new DOMException('Workspace closed', 'AbortError');
    const pending = api('state').then(next => { if (!mounted.current) return next; csrf = next.csrf; receivedAt.current = Date.now(); const merged = { ...next, tasks: mergeTaskUpdates(next.tasks, snapshotRef.current?.tasks ?? []) }; snapshotRef.current = merged; setSnapshot(merged); setConnectionError(''); return merged; });
    refreshing.current = pending;
    try { return await pending; } finally { if (refreshing.current === pending) refreshing.current = null; }
  };
  const mutate = async <T,>(command: CommandInput): Promise<T> => { const value = await api('command', command) as T; await refresh(true); return value; };
  const run = async (action: () => unknown | Promise<unknown>, success?: string, close = false) => {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError('');
    try { await action(); if (close) setModal(modalRef.current?.returnTo || null); if (success) toast(success); return true; }
    catch (reason) { if (modalRef.current) setError((reason instanceof Error ? reason.message : String(reason))); else toast((reason instanceof Error ? reason.message : String(reason))); return false; }
    finally { busyRef.current = false; setBusy(false); }
  };
  const open = (value: Modal) => { setError(''); setModal({ ...value, key: crypto.randomUUID() }); };
  const fullscreen = () => run(async () => {
    const result = await bridge!.requestDisplayMode({ mode: 'fullscreen' });
    console.info('[ai-todos] display mode request', { requested: 'fullscreen', actual: result.mode });
    setHostContext({ ...bridge!.getHostContext(), displayMode: result.mode });
    if (result.mode !== 'fullscreen') throw new Error(t('connection.fullscreenDenied'));
  });
  const openTask = (id: string, returnTo?: Modal) => run(async () => { const detail = await api('task', { id }); open({ type: 'task', ...detail, returnTo }); });
  const openEntity = (kind: Kind, entity?: Entity | null, parent?: string) => open({ type: kind === 'task' ? 'task' : 'entity', kind, entity: entity ?? undefined, parent, requestId: crypto.randomUUID() });
  const deleteEntity = (kind: Kind, entity: Entity) => open({ type: 'delete', kind, entity, returnTo: modalRef.current?.returnTo });
  const focusOp = (operation: FocusOperation, taskId?: string) => run(async () => { if (operation === 'start' && !taskId) throw new Error(t("connection.selectFocus")); await mutate({ action: 'focus', operation, revision: snapshotRef.current!.focus.revision, ...(operation === 'start' ? { taskId } : {}) }); }, undefined, !!modalRef.current);
  const transition = (id: string, revision: number, state: TransitionState, close = false) => run(() => mutate({ action: 'transition', id, revision, state }), t("task.stateUpdated"), close);
  const reschedule: TaskCallbacks['onReschedule'] = async (task, dates) => {
    if (busyRef.current || scheduling.current.has(task.id)) return false;
    scheduling.current.add(task.id);
    try {
      if (['accepted', 'awaiting_acceptance', 'cancelled'].includes(task.state)) throw new Error(t("connection.rescheduleLocked"));
      const updated = await api('command', { action: 'update', kind: 'task', id: task.id, revision: task.revision, data: dates }) as Task;
      const current = snapshotRef.current;
      if (current) {
        const next = { ...current, tasks: mergeTaskUpdates(current.tasks, [updated]) };
        snapshotRef.current = next; setSnapshot(next);
      }
      return true;
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally { scheduling.current.delete(task.id); }
  };
  const review = (task: Task, decision: Decision = 'accept') => run(async () => {
    if (embedded) { await openLocal(task.id); toast(t("connection.reviewLocal")); return; }
    const detail = await api('review-ticket', { id: task.id, revision: task.revision });
    open({ type: 'review', ...detail, decision, returnTo: modalRef.current?.returnTo });
  });
  const prompt = (id: string) => run(async () => { const { task } = await api('task', { id }); open({ type: 'prompt', text: executionPrompt(task), returnTo: modalRef.current?.returnTo }); });
  const openCodex = (task: Task) => run(async () => {
    const { sessionId, prefillTask } = await api('codex', { operation: 'prepare_task_session', id: task.id, revision: task.revision, locale: getLocale() });
    await openCodexSession(sessionId, prefillTask);
    await refresh(true);
    if (modalRef.current?.type === 'task' && modalRef.current.task?.id === task.id && !task.sessionId) {
      const detail = await api('task', { id: task.id });
      open({ type: 'task', ...detail, returnTo: modalRef.current.returnTo });
    }
  });
  const syncProjects = () => run(async () => {
    const result = await api('codex', { operation: 'sync_projects' });
    await refresh(true); toast(t("project.synced", { count: result.count, added: result.added, updated: result.updated }));
  });
  const syncThreads = async () => {
    if (syncingThreads.current) return syncingThreads.current;
    const pending = api('codex', { operation: 'sync_threads' }); syncingThreads.current = pending;
    try { const result = await pending; if (mounted.current) { setThreadTransport(result.transport ?? null); lastThreadSync.current = Date.now(); await refresh(true); } return result; }
    finally { if (syncingThreads.current === pending) syncingThreads.current = null; }
  };
  const syncWorkspace = () => run(async () => {
    const result = await syncThreads(); toast(t("session.synced", { count: result.count, value: result.transport === 'history' ? t("connection.historyOnly") : '' }));
  });
  const openSession = (id: string) => run(() => openCodexSession(id));
  const confirmSession: TaskCallbacks['onConfirmSession'] = async (session, silent = false) => {
    try {
      const confirmed = await api('session-confirm', { id: session.id, observedAt: session.observedAt, event: session.event, turnId: session.turnId ?? null, catalogUpdatedAt: session.catalogUpdatedAt ?? null, confirmed: true });
      // Let an earlier snapshot finish so it cannot overwrite this confirmation.
      if (refreshing.current) await refreshing.current.catch(() => {});
      const current = snapshotRef.current!;
      const next = { ...current, sessions: current.sessions.map(item => item.id === confirmed.id && item.observedAt === confirmed.observedAt && item.event === confirmed.event && (item.turnId ?? null) === (confirmed.turnId ?? null) && (item.catalogUpdatedAt ?? null) === (confirmed.catalogUpdatedAt ?? null) ? { ...item, confirmedAt: confirmed.confirmedAt, confirmationHistory: confirmed.confirmationHistory, activityHistory: confirmed.activityHistory } : item) };
      snapshotRef.current = next; setSnapshot(next);
      if (!silent) toast(t("session.confirmed")); return true;
    } catch (reason) { if (!silent) toast(reason instanceof Error ? reason.message : String(reason)); return false; }
  };
  const createToday = (draft?: TaskDraft, onCreated?: () => void) => open({ type: 'task', draft, onCreated, planDate: localDay(new Date()), requestId: crypto.randomUUID() });
  const addToday = (data: TaskDraft[], requestId: string) => run(() => mutate({ action: 'create_tasks', data, requestId, planDate: localDay(new Date()) }), data.length > 1 ? t("today.splitAdded", { count: data.length }) : t("today.added"));
  const captureInbox = (title: string, requestId: string) => run(() => mutate({ action: 'create', kind: 'inbox', data: { title }, requestId }), t("inbox.saved"));
  const refineCapture = (draft: TaskDraft, receive: (suggestion: CaptureSuggestion) => void) => run(async () => receive(await api('codex', { operation: 'capture_refine', draft })), t("ai.draftReady"));
  const openInbox = () => { setModal(null); setView(current => ({ ...current, page: 'inbox' })); };
  const promoteInbox = async (item: InboxItem, data: TaskDraft, today: boolean, openAfter: boolean, requestId: string) => {
    let promoted: Task | undefined;
    const completed = await run(async () => { promoted = await mutate<Task>({ action: 'promote', id: item.id, revision: item.revision, data, requestId, ...(today ? { planDate: localDay(new Date()) } : {}) }); }, today ? t("inbox.promotedToday") : t("inbox.promoted"));
    if (completed && openAfter) await openTask(promoted!.id);
    return completed;
  };
  const focusTask = (task: Task) => {
    const focus = snapshotRef.current!.focus;
    return focus.taskId === task.id && focus.status !== 'idle' ? focusOp(focus.status === 'running' ? 'pause' : 'resume') : focusOp('start', task.id);
  };
  const taskAction = (task: Task) => ['accepted', 'cancelled'].includes(task.state) ? transition(task.id, task.revision, 'defining') : task.state === 'awaiting_acceptance' ? review(task) : openTask(task.id);
  const completeTask = (task: Task) => run(async () => {
    await api('task-complete', { id: task.id, revision: task.revision, confirmed: true });
    await refresh(true);
  }, t('task.completedByUser'), true);

  useEffect(() => {
    if (snapshot?.focus.status !== 'running') return;
    const timer = setInterval(() => setTick(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [snapshot?.focus.status]);

  useEffect(() => {
    mounted.current = true;
    let stopped = false;
    let poll: ReturnType<typeof setTimeout> | undefined;
    let stopResizeNotifications: (() => void) | undefined;
      const pollState = async () => {
      try {
        if (Date.now() - lastThreadSync.current > 30000) { lastThreadSync.current = Date.now(); try { await syncThreads(); } catch (reason) { toast(t("session.syncFailed", { value: (reason instanceof Error ? reason.message : String(reason)) })); } }
        if (stopped) return;
        await refresh();
      } catch (reason) { if (!stopped) setConnectionError((reason instanceof Error ? reason.message : String(reason))); }
      finally { if (!stopped) poll = setTimeout(pollState, 5000); }
    };
    const boot = async () => {
      try {
        if (embedded) {
          const applyHostContext = (context: ReturnType<App["getHostContext"]>) => {
            setHostContext(bridge!.getHostContext());
            if (context?.displayMode !== undefined || context?.availableDisplayModes !== undefined) console.info('[ai-todos] host display mode', { mode: bridge!.getHostContext()?.displayMode, available: bridge!.getHostContext()?.availableDisplayModes });
            if (context?.locale) applyHostLocale(context.locale); if (context?.theme) applyDocumentTheme(context.theme); if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables); if (context?.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
          };
          bridge!.onhostcontextchanged = applyHostContext;
          bridge!.ontoolresult = result => { if (result.structuredContent && typeof result.structuredContent === 'object' && 'tasks' in result.structuredContent) refresh(true).catch(reason => toast((reason instanceof Error ? reason.message : String(reason)))); };
          await bridge!.connect();
          if (stopped) return;
          stopResizeNotifications = bridge!.setupSizeChangedNotifications();
          applyHostContext(bridge!.getHostContext());
        }
        if (stopped) return;
        await refresh(true);
        if (stopped) return;
        let projectsChanged = false;
        try { const result = await api('codex', { operation: 'sync_projects' }); projectsChanged = result.added > 0 || result.updated > 0; }
        catch (reason) { if (!stopped) toast(t("project.syncFailed", { value: (reason instanceof Error ? reason.message : String(reason)) })); }
        if (stopped) return;
        try { await syncThreads(); projectsChanged = false; } catch (reason) { if (!stopped) toast(t("session.syncFailed", { value: (reason instanceof Error ? reason.message : String(reason)) })); }
        if (stopped) return;
        if (projectsChanged) await refresh(true);
        const id = location.hash.match(/^#task=([a-f0-9-]+)$/)?.[1]; if (id) await openTask(id);
      } catch (reason) { if (!stopped) setConnectionError((reason instanceof Error ? reason.message : String(reason))); }
      if (stopped) return;
      poll = setTimeout(pollState, 5000);
    };
    boot();
    return () => {
      stopped = true; mounted.current = false;
      clearTimeout(poll); clearTimeout(toastTimer.current);
      stopResizeNotifications?.();
      if (bridge) { bridge.ontoolresult = undefined; bridge.onhostcontextchanged = undefined; void bridge.close().catch(() => {}); }
    };
  }, []);

  if (!snapshot) return <div className="loading"><h1>{connectionError ? t("connection.disconnected") : t("connection.connecting")}</h1>{connectionError && <><p>{connectionError}</p><p>{t("connection.localApp")}<a href={localOrigin}>{localOrigin}</a></p></>}</div>;
  const setViewValue = (name: string, value: string) => setView(current => ({ ...current, [name]: value }));
  const findTask = (id?: string | null) => snapshot.tasks.find(task => task.id === id);
  const projectName = (id?: string | null) => snapshot.projects.find(project => project.id === id)?.title || t("project.none");
  const filtered = snapshot.tasks.filter(task => (!view.project || task.projectId === view.project) && (!view.search || `${task.title} ${task.description}`.toLowerCase().includes(view.search.toLowerCase())));
  const sessionMatches = (session: Snapshot['sessions'][number]) => (session.catalogVisible !== false || ['running', 'queued', 'waiting_approval', 'waiting_input'].includes(session.state)) && (!view.project || snapshot.projects.find(project => project.id === view.project)?.codex?.workspacePath === session.cwd) && (!view.search || `${session.title || ''} ${session.preview || ''}`.toLowerCase().includes(view.search.toLowerCase()));
  const historySessions = snapshot.sessions.filter(sessionMatches);
  const filteredSessions = visibleExecutionSessions(historySessions, snapshot.tasks).sort((a, b) => (b.catalogUpdatedAt || b.observedAt).localeCompare(a.catalogUpdatedAt || a.observedAt));
  const boardSessionCount = filteredSessions.filter(session => executionColumnForSession(session) !== null).length;
  const elapsedMs = snapshot.focus.totalMs + (snapshot.focus.status === 'running' ? Math.max(0, Date.now() - receivedAt.current) : 0);
  const focusCandidates = snapshot.tasks.filter(task => !['accepted', 'cancelled'].includes(task.state));
  const selectedFocusTask = focusCandidates.find(task => task.id === focusTaskId);
  const totals = view.page === 'today' ? dailyTotals(snapshot) : [], dayRows = totals.filter(row => row.day === statsDate);
  const mainPage = ['inbox', 'plans'].includes(view.page) ? 'today' : view.page;
  const newKind = ({ work: 'task', projects: 'project', plans: 'plan' } as Record<string, Kind>)[view.page];
  let modalTitle = '', modalDescription = '', modalBody: ReactNode;
  if (modal) {
    const task = modal.task!, entity = modal.entity!;
    if (modal.type === 'task') {
      modalTitle = task?.title || t("task.new"); modalDescription = task ? t("task.reviewedRevision", { revision: task.revision }) : t("entity.stored");
      modalBody = <TaskEditor task={task || modal.draft} history={modal.history} snapshot={snapshot} busy={busy}
        onRefine={(draft, receive, field) => run(async () => receive(await api('codex', { operation: 'refine', draft, ...(field ? { field } : {}) })))} onSyncProjects={syncProjects}
        onSave={data => run(async () => { await mutate(task ? { action: 'update', kind: 'task', id: task.id, revision: task.revision, data } : { action: 'create', kind: 'task', data, requestId: modal.requestId!, ...(modal.planDate ? { planDate: modal.planDate } : {}) }); modal.onCreated?.(); }, modal.planDate ? t("today.added") : t("task.saved"), true)}
        onTransition={state => transition(task!.id, task.revision, state, true)}
        onBind={sessionId => run(async () => { await mutate({ action: 'bind', id: task.id, revision: task.revision, sessionId }); const detail = await api('task', { id: task.id }); open({ type: 'task', ...detail, returnTo: modal.returnTo }); }, t("ai.linkSaved"))}
        onSubmitDelivery={() => open({ type: 'delivery', task, returnTo: modal.returnTo })} onReview={() => review(task)} onComplete={() => completeTask(task)} onFocus={() => focusOp('start', task.id)} onPrompt={() => prompt(task.id)} onOpenCodex={() => openCodex(task)} onDelete={() => deleteEntity('task', task)} />;
    } else if (modal.type === 'daily_plan') {
      modalTitle = t("today.arrange"); modalDescription = t("today.dateHint", { date: modal.date });
      modalBody = <DailyPlanEditor snapshot={snapshot} plans={modal.plans!} initial={modal.draft} busy={busy} onCreateTask={() => createToday()} onInbox={openInbox}
        onOpenTask={(id, draft) => openTask(id, { ...modal, draft })}
        onSave={data => run(() => mutate({ action: 'daily_plan', date: modal.date!, plans: modal.plans!.map(({ id, revision }) => ({ id, revision })), ...data }), t("today.saved"), true)} />;
    } else if (modal.type === 'entity') {
      modalTitle = t(entity?.id ? 'entity.editTitle' : 'entity.newTitle', { entity: t(singular[modal.kind!]) }); modalDescription = entity?.id ? t("entity.revision", { revision: entity.revision }) : t("entity.stored");
      modalBody = <EntityForm kind={modal.kind!} entity={entity} parent={modal.parent} snapshot={snapshot} busy={busy} onDelete={() => deleteEntity(modal.kind!, entity)} onSave={data => run(() => mutate(entity?.id ? { action: 'update', kind: modal.kind!, id: entity.id, revision: entity.revision, data } : { action: 'create', kind: modal.kind!, data, requestId: modal.requestId! }), t("entity.saved", { value: t(singular[modal.kind!]) }), true)} />;
    } else if (modal.type === 'delivery') {
      modalTitle = t("delivery.title"); modalDescription = t("delivery.revision", { revision: task.revision });
      modalBody = <DeliveryForm busy={busy} onSave={data => run(() => mutate({ action: 'submit', id: task.id, revision: task.revision, ...data }), t("delivery.submitted"), true)} />;
    } else if (modal.type === 'review') {
      modalTitle = t("review.title"); modalDescription = t("review.revisionHint", { revision: task.revision });
      modalBody = <ReviewForm task={task} decision={modal.decision} busy={busy} onSave={data => run(async () => { await api('review', { ticket: modal.ticket, id: task.id, revision: task.revision, ...data }); await refresh(true); }, t("review.recorded"), true)} />;
    } else if (modal.type === 'delete') {
      modalTitle = t("delete.title"); modalDescription = entity?.title ?? '';
      modalBody = <div className="editor-details"><p>{t("delete.hint")}</p><div className="actions"><button disabled={busy} onClick={() => setModal(null)}>{t("common.cancel")}</button><button className="danger" disabled={busy} onClick={() => run(() => mutate({ action: 'delete', kind: modal.kind!, id: entity.id, revision: entity.revision }), t("common.deleted"), true)}>{t("delete.title")}</button></div></div>;
    } else if (modal.type === 'prompt') {
      modalTitle = t("prompt.title"); modalDescription = t("prompt.deliveryHint");
      modalBody = <div className="editor-details"><p className="note">{t("prompt.identityHint")}</p><textarea aria-label={t("prompt.label")} readOnly value={modal.text} className="execution-prompt" /><div className="actions"><button disabled={busy} onClick={() => run(async () => { try { await navigator.clipboard.writeText(modal.text!); toast(t("prompt.copied")); } catch { document.querySelector<HTMLTextAreaElement>('.execution-prompt')!.select(); toast(t("connection.copyDenied")); } })}>{t("prompt.copy")}</button>{embedded && <button className="primary" disabled={busy} onClick={() => run(async () => { const result = await bridge!.sendMessage({ role: 'user', content: [{ type: 'text', text: modal.text! }] }); if (result.isError) throw new Error(t("connection.sendDenied")); }, t("prompt.sent"), true)}>{t("prompt.send")}</button>}</div></div>;
    }
  }
  return <><div className="workspace-shell"><aside className="workspace-sidebar">
    <div className="workspace-brand"><span>a</span> ai-todos</div>
    <div className="workspace-sidebar__label">{t('workspace.label')}</div>
    <nav className="workspace-sidebar__nav" aria-label={t('workspace.label')}>
      <button type="button" className={view.page === 'work' && view.mode !== 'timeline' ? 'is-active' : ''} onClick={() => setView(current => ({ ...current, page: 'work', mode: current.mode === 'timeline' ? 'list' : current.mode }))}><span>◉ &nbsp;{t('nav.work')}</span><small>{filteredSessions.length + filtered.length}</small></button>
      <button type="button" className={view.page === 'work' && view.mode === 'timeline' ? 'is-active' : ''} onClick={() => setView(current => ({ ...current, page: 'work', mode: 'timeline' }))}><span>◷ &nbsp;{t('workspace.history')}</span></button>
    </nav>
    <div className="workspace-sidebar__projects"><div className="workspace-sidebar__label">{t('workspace.projects')}</div><nav className="workspace-sidebar__nav" aria-label={t('workspace.projects')}>
      <button type="button" className={!view.project ? 'is-active' : ''} onClick={() => setView(current => ({ ...current, page: 'work', project: '' }))}><span>{t('workspace.allProjects')}</span></button>
      {snapshot.projects.map(project => <button type="button" key={project.id} className={view.project === project.id ? 'is-active' : ''} onClick={() => setView(current => ({ ...current, page: 'work', project: project.id }))}><span>{project.title}</span></button>)}
    </nav></div>
    <button type="button" className="workspace-sidebar__settings" onClick={() => setView(current => ({ ...current, page: 'settings' }))}><Settings size={15} />{t('nav.settings')}</button>
  </aside><main className={`main workspace-main ${view.page === 'work' && view.mode === 'board' ? 'is-board' : ''}`}>
    <header className="page-header workspace-header"><div><h1>{view.page === 'work' && view.mode === 'timeline' ? t('workspace.history') : t(pages[view.page])}</h1>{view.page === 'work' && <p className="workspace-subtitle">{t(view.mode === 'timeline' ? 'activity.hint' : 'workspace.subtitle')}</p>}</div><div className="row">{hostContext?.availableDisplayModes?.includes('fullscreen') && hostContext.displayMode !== 'fullscreen' && <button className="quiet small" disabled={busy} onClick={fullscreen}><Maximize2 size={14} aria-hidden="true" />{t('connection.fullscreen')}</button>}<button className="quiet small" disabled={busy} onClick={view.page === 'work' ? syncWorkspace : () => run(() => refresh(true))}><RefreshCw size={14} />{t('common.refresh')}</button></div></header>
    {connectionError && <p className="error" role="alert">{t("connection.unavailable")}{connectionError}</p>}
    <TodayView snapshot={snapshot} busy={busy} visible={view.page === 'today'} elapsedMs={elapsedMs} onAdd={addToday} onCapture={captureInbox} onRefine={refineCapture} onCreateTask={createToday} onOpenTask={openTask} onTaskAction={taskAction} onFocusTask={focusTask} onFocusOp={focusOp} onInbox={openInbox} onPlan={() => { const date = localDay(new Date()); open({ type: 'daily_plan', date, plans: dayPlans(snapshot.plans, date) }); }} />
    {view.page === 'today' && <section className="card home-focus" aria-labelledby="focus-stats-title"><div className="row spaced"><h2 id="focus-stats-title">{t("focus.stats")}</h2><DatePickerField label={t("focus.statsDate")} value={statsDate} onValueChange={setStatsDate} /></div><div className="summary"><div><p>{statsDate === localDay(new Date()) ? t("focus.todayTime") : t("focus.dateTime")}</p><div className="number">{hours(dayRows.reduce((sum, row) => sum + row.ms, 0))}</div></div><div><p>{t("focus.totalTime")}</p><div className="number">{hours(totals.reduce((sum, row) => sum + row.ms, 0))}</div></div><div><p>{t("focus.recordCount")}</p><div className="number">{number(snapshot.timeRecords.length)}</div></div></div>
      <details><summary>{t("focus.details")}</summary>
        {snapshot.focus.status === 'idle' && <div className="row focus-picker"><SelectField label={t("focus.task")} value={focusTaskId} disabled={busy || !focusCandidates.length} onValueChange={setFocusTaskId} groups={[{ options: [{ value: '', label: t("focus.selectTask") }, ...focusCandidates.map(task => ({ value: task.id, label: task.title }))] }]} /><button className="small" disabled={busy || !selectedFocusTask} onClick={() => focusOp('start', focusTaskId)}>{t("focus.start")}</button></div>}
        <div className="table-wrap"><table><thead><tr><th>{t("entity.task")}</th><th>{t("entity.project")}</th><th>{t("focus.timeSpent")}</th></tr></thead><tbody>{dayRows.map(row => <tr key={row.taskId}><td>{findTask(row.taskId)?.title}</td><td>{projectName(findTask(row.taskId)?.projectId)}</td><td>{hours(row.ms)}</td></tr>)}{!dayRows.length && <tr><td colSpan={3} className="muted">{t("focus.noRecords")}</td></tr>}</tbody></table></div>
        <h3 className="section-title">{t("focus.byProject")}</h3><div className="grid">{[...new Set(totals.map(row => findTask(row.taskId)?.projectId || ''))].map(projectId => <div className="card" key={projectId}><h3>{projectName(projectId)}</h3><div className="number">{hours(totals.filter(row => (findTask(row.taskId)?.projectId || '') === projectId).reduce((sum, row) => sum + row.ms, 0))}</div></div>)}</div><h3 className="section-title">{t("focus.recentRecords")}</h3><div className="list">{snapshot.timeRecords.slice(-20).reverse().map(record => <div className="row spaced" key={record.id}><span>{findTask(record.taskId)?.title}</span><span className="muted">{fmt(record.endedAt)} · {hours(record.durationMs)}</span></div>)}</div>
        <p className="note">{t("focus.wallClockHint")}</p>
      </details></section>}
    <InboxView items={snapshot.inbox} visible={view.page === 'inbox'} busy={busy} onClose={() => setViewValue('page', 'today')} onCapture={captureInbox} onRefine={refineCapture} onPromote={promoteInbox} onArchive={(item, archived) => run(() => mutate({ action: 'update', kind: 'inbox', id: item.id, revision: item.revision, data: { archived } }), archived ? t("inbox.archived") : t("inbox.restored"))} />
    {view.page === 'work' && <section className={`execution-view ${view.mode === 'board' ? 'is-board' : ''}`}>
      {view.mode !== 'timeline' && <div className="execution-toolbar workspace-toolbar"><div className="segmented-control">{[['list', t('workspace.list')], ['board', t('board.mode')]].map(([mode, label]) => <button key={mode} className={view.mode === mode ? 'is-active' : ''} aria-pressed={view.mode === mode} onClick={() => setViewValue('mode', mode)}>{label}</button>)}</div>
        <label className="task-search"><Search size={14} aria-hidden="true" /><input type="search" aria-label={t('board.search')} placeholder={t('board.searchPlaceholder')} value={view.search} onChange={event => setViewValue('search', event.target.value)} /></label>
        <ProjectPicker value={view.project} projects={snapshot.projects} onChange={value => setViewValue('project', value)} disabled={!snapshot.projects.length} />
      </div>}
      {threadTransport === 'history' && !snapshot.sessions.some(session => session.source === 'codex-hook') && <p className="note" role="status">{t('connection.hookSetup')}</p>}
      {view.mode === 'list' ? <SessionList tasks={filtered} allTasks={snapshot.tasks} sessions={filteredSessions} projects={snapshot.projects} busy={busy} onOpenTask={openTask} onOpenSession={openSession} onConfirmSession={confirmSession} onCompleteTask={completeTask} onReviewTask={review} onOpenCodex={openCodex} onHistory={() => setViewValue('mode', 'timeline')} /> : view.mode === 'board' ? <BoardView tasks={filtered} allTasks={snapshot.tasks} sessions={filteredSessions} onOpenSession={openSession} onConfirmSession={confirmSession} onReviewTask={review} onCompleteTask={completeTask} projects={snapshot.projects} busy={busy} onOpenTask={openTask} onOpenCodex={openCodex} onTransition={transition} onError={toast} /> : <SessionHistory sessions={historySessions} tasks={snapshot.tasks} onOpenSession={openSession} />}
    </section>}
    {view.page === 'projects' && <div className="grid">{snapshot.projects.map(project => {
      const tasks = snapshot.tasks.filter(task => task.projectId === project.id), accepted = tasks.filter(task => task.state === 'accepted').length;
      return <article className="card" key={project.id}><div className="row spaced"><h2>{project.title}</h2><button className="small" disabled={busy} onClick={() => openEntity('project', project)}>{t("common.edit")}</button></div>{project.codex && <p className="project-path">Codex · {project.codex.workspacePath}</p>}<p className="muted">{project.description || t("project.noDescription")}</p><div className="progress-track"><span style={{ width: `${tasks.length ? accepted / tasks.length * 100 : 0}%` }} /></div><div className="row spaced"><span className="muted">{t("project.acceptedCount", { accepted: accepted, count: tasks.length })}</span><button className="small" onClick={() => setView(current => ({ ...current, page: 'work', project: project.id }))}>{t("project.viewTasks")}</button></div></article>;
    })}{!snapshot.projects.length && <div className="empty-state"><strong>{t("project.organize")}</strong><span>{t("project.sharedTasks")}</span></div>}</div>}
    {view.page === 'plans' && <div className="list"><p className="muted">{t("plan.description")}</p>{[...snapshot.plans].sort((left, right) => right.date.localeCompare(left.date)).map(plan => <article className="card" key={plan.id}><div className="row spaced"><div><span className="muted">{plan.date}</span><h2>{plan.title}</h2></div><button className="small" disabled={busy} onClick={() => openEntity('plan', plan)}>{t("plan.edit")}</button></div><p className="muted">{plan.note}</p><div className="list">{plan.taskIds.map(id => <div className="row spaced" key={id}><button className="quiet" onClick={() => openTask(id)}>{findTask(id)?.title || t("task.deleted")}</button><span className="execution-status">{t(labels[findTask(id)?.state ?? ''] || 'common.unknown')}</span></div>)}{!plan.taskIds.length && <span className="muted">{t("plan.emptyTasks")}</span>}</div></article>)}{!snapshot.plans.length && <div className="empty-state"><strong>{t("plan.emptyTitle")}</strong><span>{t("plan.emptyHint")}</span></div>}</div>}
    {view.page === 'settings' && <div className="grid settings-grid"><section className="card"><h2>{t('settings.language')}</h2><SelectField label={t('settings.language')} value={getLanguagePreference()} disabled={busy} onValueChange={value => { if (!setLanguagePreference(value as LanguagePreference)) toast(t('settings.languageStorageFailed')); }} groups={[{ options: [{ value: 'auto', label: t('settings.followSystem') }, ...Object.entries(languages).map(([value, { name }]) => ({ value, label: name }))] }]} /><p className="note">{t('settings.languageHint')}</p></section></div>}
  </main></div>

    {modal && <EditorDialog key={modal.key} title={modalTitle} description={modalDescription} busy={busy} error={error} onClose={() => setModal(modal.returnTo || null)}>{modalBody}</EditorDialog>}
    {message && <div className="toast" role="status" aria-live="polite">{message}</div>}
  </>;
}

createRoot(document.querySelector('#app')!).render(<I18nextProvider i18n={i18n}><Workspace /></I18nextProvider>);
