import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import enErrors from 'zod/v4/locales/en.js';
import zhErrors from 'zod/v4/locales/zh-CN.js';
import type { Kind, EntityData, Entity, Task, Focus, Settings, Session, LiveSession, Snapshot, TimeRecord, TaskEvent, CodexProject, CodexThread, Command } from './types.ts';
import { runtimeState } from './runtime.ts';
import { i18n, isTranslationKey, languages } from './i18n.ts';
import type { TranslationKey } from './i18n.ts';

const text = z.string().trim().min(1).max(300);
const note = z.string().max(20000);
const id = z.string().uuid();
const date = z.iso.datetime({ offset: true });
const optionalId = id.nullable().default(null);
const scheduling = { plannedStart: date.nullable().default(null), plannedEnd: date.nullable().default(null) };
export const schemas = {
  task: z.object({ title: text, description: note.default(''), criteria: note.default(''), priority: z.enum(['low', 'normal', 'high']).default('normal'), projectId: optionalId, keyResultId: optionalId, ...scheduling, remindAt: date.nullable().default(null) }).strict(),
  project: z.object({ title: text, description: note.default('') }).strict(),
  objective: z.object({ title: text, description: note.default(''), ...scheduling }).strict(),
  keyResult: z.object({ title: text, objectiveId: id, baseline: z.number().finite().default(0), target: z.number().finite(), current: z.number().finite().default(0), unit: z.string().max(40).default('') }).strict(),
  plan: z.object({ title: text, date: z.iso.date(), note: note.default(''), taskIds: z.array(id).max(500).default([]) }).strict(),
  inbox: z.object({ title: text, archived: z.boolean().default(false) }).strict(),
};
const kinds = z.enum(Object.keys(schemas) as [Kind, ...Kind[]]);
const revision = z.number().int().positive();
export const settingsSchema = z.object({ reminders: z.boolean(), followUpMinutes: z.number().int().min(0).max(10080), reviewTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(), timezone: z.string().refine(v => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; } }, "errors.invalidTimezone") }).strict();
export const commandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), kind: kinds, data: z.record(z.string(), z.unknown()), requestId: id, planDate: z.iso.date().optional() }).strict(),
  z.object({ action: z.literal('create_tasks'), data: z.array(schemas.task).min(1).max(20), requestId: id, planDate: z.iso.date() }).strict(),
  z.object({ action: z.literal('promote'), id, revision, data: schemas.task, requestId: id, planDate: z.iso.date().optional() }).strict(),
  z.object({ action: z.literal('daily_plan'), date: z.iso.date(), plans: z.array(z.object({ id, revision }).strict()).max(500), taskIds: z.array(id).max(500), note }).strict(),
  z.object({ action: z.literal('update'), kind: kinds, id, revision, data: z.record(z.string(), z.unknown()) }).strict(),
  z.object({ action: z.literal('delete'), kind: kinds, id, revision }).strict(),
  z.object({ action: z.literal('transition'), id, revision, state: z.enum(['defining', 'ready', 'executing', 'cancelled']) }).strict(),
  z.object({ action: z.literal('bind'), id, revision, sessionId: id.nullable() }).strict(),
  z.object({ action: z.literal('submit'), id, revision, summary: text, evidence: z.array(z.object({ label: text, uri: z.string().min(1).max(2000), note: note.default('') }).strict()).min(1).max(30) }).strict(),
  z.object({ action: z.literal('focus'), operation: z.enum(['start', 'pause', 'resume', 'finish']), taskId: id.optional(), revision: z.number().int().nonnegative() }).strict(),
  z.object({ action: z.literal('settings'), revision: z.number().int().nonnegative(), data: settingsSchema }).strict(),
  z.object({ action: z.literal('ack'), id }).strict(),
]);
const reviewSchema = z.object({ id, revision, decision: z.enum(['accept', 'reject']), confirmed: z.literal(true), reviewer: text, note: note.default('') }).strict();
export const taskCompleteSchema = reviewSchema.pick({ id: true, revision: true, confirmed: true });
export const sessionConfirmSchema = z.object({ id, observedAt: date, event: z.string().min(1).max(200), turnId: z.string().max(200).nullable(), catalogUpdatedAt: date.nullable(), confirmed: z.literal(true) }).strict();
export class DomainError extends Error {
  declare status: number;
  declare code: TranslationKey;
  declare params: Record<string, string | number>;
  constructor(code: TranslationKey, status = 400, params: Record<string, string | number> = {}) { super(i18n.t(code, { ...params, lng: 'zh-CN' })); this.status = status; this.code = code; this.params = params; }
}
export function errorPayload(error: unknown): Record<string, unknown> {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof z.ZodError) {
    const messages = Object.fromEntries(Object.keys(languages).map(locale => {
      const localeError = locale === 'zh-CN' ? zhErrors().localeError : enErrors().localeError;
      const issues = error.issues.map(issue => {
        const localized = isTranslationKey(issue.message) ? i18n.t(issue.message, { lng: locale }) : localeError({ ...issue, input: undefined });
        return { ...issue, message: typeof localized === 'string' ? localized : localized?.message ?? issue.message };
      });
      return [locale, z.prettifyError(new z.ZodError(issues))];
    }));
    return { error: messages['zh-CN'], messages };
  }
  if (error instanceof Error) {
    if ('code' in error && isTranslationKey(error.code)) return { error: message, code: error.code, params: 'params' in error ? error.params : {} };
    if ('messages' in error) return { error: message, messages: error.messages };
  }
  return { error: message };
}
function requireThat(condition: unknown, code: TranslationKey, status = 400, params: Record<string, string | number> = {}): asserts condition { if (!condition) throw new DomainError(code, status, params); }
export function elapsed(focus: Focus, now = Date.now()) {
  return focus.elapsedMs + (focus.startedAt ? Math.max(0, now - Date.parse(focus.startedAt)) : 0);
}

function preserveConfirmation(session: Session): Session {
  if (!session.confirmedAt || session.confirmationHistory?.some(entry => entry.at === session.confirmedAt)) return session;
  return { ...session, confirmationHistory: [...(session.confirmationHistory ?? []), { at: session.confirmedAt, observedAt: session.observedAt, event: session.event, turnId: session.turnId ?? null, catalogUpdatedAt: session.catalogUpdatedAt ?? null }] };
}

function recordSessionActivity(session: Session, previous: Session | null, state: string, at: string, event: string, turnId?: string | null) {
  const oldState = previous ? runtimeState(previous.observedState) : null;
  if (state !== 'confirmed' && state === oldState && (turnId ?? null) === (previous?.turnId ?? null)) return;
  session.activityHistory = [...(session.activityHistory ?? []), { at, state, event, turnId: turnId ?? null }];
}

export class Store {
  declare db: DatabaseSync;
  declare now: () => number;
  constructor(path: string, now = () => Date.now()) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path); this.now = now;
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS entities (kind TEXT NOT NULL, id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, task_id TEXT, at TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_task_id ON events(task_id);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notices (id TEXT PRIMARY KEY, body TEXT NOT NULL);`);
  }
  close() { this.db.close(); }
  at() { return new Date(this.now()).toISOString(); }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  all<K extends Kind>(kind: K): Entity<K>[] { return this.db.prepare('SELECT body FROM entities WHERE kind=? ORDER BY rowid').all(kind).map(r => JSON.parse(r.body as string)); }
  get<K extends Kind>(kind: K, entityId: string): Entity<K> {
    const row = this.db.prepare('SELECT body FROM entities WHERE kind=? AND id=?').get(kind, entityId);
    requireThat(row, 'errors.notFound', 404, { kind }); return JSON.parse(row.body as string);
  }
  check(item: { revision: number }, expected: number) { requireThat(item.revision === expected, "errors.staleRevision", 409); }
  save<K extends Kind>(kind: K, item: Entity<K>): Entity<K> { this.db.prepare('INSERT INTO entities (kind,id,body) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(kind, item.id, JSON.stringify(item)); return item; }
  meta<T>(key: string, fallback: T): T { const row = this.db.prepare('SELECT body FROM meta WHERE key=?').get(key); return row ? JSON.parse(row.body as string) : fallback; }
  setMeta<T>(key: string, value: T): T { this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run(key, JSON.stringify(value)); return value; }
  event(taskId: string | null, type: string, details: Partial<TaskEvent> = {}) {
    const event = { id: randomUUID(), at: this.at(), type, ...details };
    this.db.prepare('INSERT INTO events VALUES (?,?,?,?)').run(event.id, taskId, event.at, JSON.stringify(event)); return event;
  }
  taskHistory(taskId: string): TaskEvent[] { return this.db.prepare('SELECT body FROM events WHERE task_id=? ORDER BY rowid DESC').all(taskId).map(r => JSON.parse(r.body as string)); }
  focus(): Focus { return this.meta('focus', { revision: 0, taskId: null, status: 'idle', elapsedMs: 0, startedAt: null, segments: [] }); }
  settings(): Settings { return this.meta('settings', { revision: 0, reminders: true, followUpMinutes: 60, reviewTime: '18:00', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }); }
  sessions(): LiveSession[] {
    return this.db.prepare('SELECT body FROM sessions ORDER BY rowid DESC').all().map(r => {
      const s = JSON.parse(r.body as string) as Session;
      const state = runtimeState(s.observedState);
      return { ...s, state: ['queued', 'running', 'waiting_approval', 'waiting_input'].includes(state) && this.now() - Date.parse(s.observedAt) > 300000 ? 'unknown' : state };
    });
  }
  snapshot(): Snapshot {
    const sessions = this.sessions();
    const tasks = this.all('task');
    const sessionById = new Map(sessions.map(session => [session.id, session]));
    for (const task of tasks) {
      const session = task.sessionId && sessionById.get(task.sessionId);
      if (!session || task.state === 'cancelled') continue;
      for (const event of this.taskHistory(task.id)) {
        if (event.type !== 'review' || event.decision !== 'accept') continue;
        const history = session.activityHistory ?? [];
        if (!history.some(item => item.state === 'confirmed' && item.at === event.at)) session.activityHistory = [...history, { at: event.at, state: 'confirmed', event: 'task_confirmation', turnId: null }];
      }
    }
    return {
      tasks: tasks.map(t => {
        const session = sessions.find(s => s.id === t.sessionId);
        return { ...t, ai: session ? { ...session, mode: t.state === 'defining' ? 'planning' : 'execution' } : null };
      }),
      projects: this.all('project'), objectives: this.all('objective'), keyResults: this.all('keyResult'), plans: this.all('plan'), inbox: this.all('inbox'), sessions,
      focus: { ...this.focus(), totalMs: elapsed(this.focus(), this.now()) }, settings: this.settings(),
      notices: this.db.prepare('SELECT body FROM notices ORDER BY rowid DESC LIMIT 200').all().map(r => JSON.parse(r.body as string)),
      timeRecords: this.meta<TimeRecord[]>('timeRecords', []), serverTime: this.at(),
    };
  }
  validate<K extends Kind>(kind: K, input: unknown): EntityData<K> {
    const data = schemas[kind].parse(input) as EntityData<Kind>;
    if ('plannedStart' in data) {
      requireThat(Boolean(data.plannedStart) === Boolean(data.plannedEnd), "errors.schedulePair");
      if (data.plannedStart) requireThat(Date.parse(data.plannedEnd!) > Date.parse(data.plannedStart), "errors.scheduleOrder");
    }
    if (kind === 'task') {
      const task = data as EntityData<'task'>;
      if (task.projectId) this.get('project', task.projectId);
      if (task.keyResultId) this.get('keyResult', task.keyResultId);
    }
    if (kind === 'keyResult') {
      const result = data as EntityData<'keyResult'>;
      this.get('objective', result.objectiveId);
      requireThat(result.target !== result.baseline, "errors.krTarget");
    }
    if (kind === 'plan') {
      const plan = data as EntityData<'plan'>;
      requireThat(new Set(plan.taskIds).size === plan.taskIds.length, "errors.duplicatePlanTask");
      plan.taskIds.forEach(taskId => this.get('task', taskId));
    }
    return data as EntityData<K>;
  }
  create<K extends Kind>(kind: K, input: unknown, extra: Partial<Entity<K>> = {}): Entity<K> {
    const item = { ...this.validate(kind, input), ...extra, id: randomUUID(), revision: 1, createdAt: this.at(), updatedAt: this.at() } as Entity<K>;
    if (kind === 'task') Object.assign(item, { state: 'defining', sessionId: null });
    this.save(kind, item);
    if (kind === 'task') this.event(item.id, 'created');
    return item;
  }
  update<K extends Kind>(kind: K, item: Entity<K>, input: Record<string, unknown>): Entity<K> {
    if (kind === 'task') requireThat(!['accepted', 'awaiting_acceptance', 'cancelled'].includes((item as Task).state), "errors.taskLocked");
    const existing = Object.fromEntries(Object.keys(schemas[kind].shape).map(k => [k, (item as unknown as Record<string, unknown>)[k]]));
    const data = this.validate(kind, { ...existing, ...input });
    const result = this.save(kind, { ...item, ...data, revision: item.revision + 1, updatedAt: this.at() });
    if (kind === 'task') this.event(item.id, 'updated', { revision: result.revision });
    return result;
  }
  syncCodexProjects(projects: CodexProject[]) {
    return this.transaction(() => {
      const existing = this.all('project'); let added = 0, updated = 0;
      for (const project of projects) {
        const item = existing.find(item => item.codex?.projectId === project.projectId && item.codex.workspacePath === project.workspacePath);
        if (!item) { existing.push(this.create('project', { title: project.title }, { codex: { projectId: project.projectId, workspacePath: project.workspacePath } })); added++; }
        else if (item.title !== project.title) { this.update('project', item, { title: project.title }); updated++; }
      }
      return { count: projects.length, added, updated };
    });
  }
  syncCodexThreads(threads: CodexThread[], complete = true) {
    return this.transaction(() => {
      const existing = new Map(this.sessions().map(session => { const { state, ...stored } = session; return [session.id, preserveConfirmation(stored)]; }));
      const seen = new Set(); let added = 0, updated = 0;
      for (const thread of threads) {
        if (seen.has(thread.id)) continue;
        seen.add(thread.id);
        const previous = existing.get(thread.id);
        const session = { ...previous, id: thread.id, title: thread.title, preview: thread.preview, cwd: thread.cwd, codexProjectId: thread.projectId, catalogUpdatedAt: thread.updatedAt, catalogVisible: true } as Session;
        if (previous?.catalogUpdatedAt && Date.parse(thread.updatedAt) > Date.parse(previous.catalogUpdatedAt)) delete session.confirmedAt;
        const observation = thread.observation;
        const retainHook = observation && previous?.source === 'codex-hook' && (Date.parse(previous.observedAt) > Date.parse(observation.observedAt)
          || (thread.state === 'running' && ['waiting_approval', 'waiting_input'].includes(runtimeState(previous.observedState)) && previous.turnId === observation.turnId));
        if (!retainHook && (thread.state !== 'unknown' || !previous)) {
          Object.assign(session, { observedState: thread.state, observedAt: this.at(), event: 'thread/list', source: 'codex-app-server', ...observation });
          if (!['idle', 'completed'].includes(runtimeState(thread.state)) || (observation && observation.turnId !== previous?.turnId)) delete session.confirmedAt;
        }
        if (!retainHook && (thread.state !== 'unknown' || observation)) recordSessionActivity(session, previous ?? null, runtimeState(session.observedState), observation?.observedAt ?? thread.updatedAt, session.event, session.turnId);
        if (JSON.stringify(session) === JSON.stringify(previous)) continue;
        this.db.prepare('INSERT OR REPLACE INTO sessions VALUES (?,?)').run(session.id, JSON.stringify(session));
        if (!retainHook && observation && ['task_started', 'UserPromptSubmit'].includes(observation.event)) this.reopenAcceptedTask(session.id, observation.observedAt, observation.turnId, previous?.turnId);
        else if (!retainHook && !observation && ['running', 'queued'].includes(runtimeState(thread.state))) this.reopenAcceptedTask(session.id, thread.updatedAt);
        previous ? updated++ : added++;
      }
      for (const previous of existing.values()) if (complete && previous.catalogVisible !== false && !seen.has(previous.id)) {
        this.db.prepare('UPDATE sessions SET body=? WHERE id=?').run(JSON.stringify({ ...previous, catalogVisible: false }), previous.id);
      }
      return { count: seen.size, added, updated };
    });
  }
  dayPlans(day: string) { return this.all('plan').filter(plan => plan.date === day).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)); }
  addToDay(day: string, taskIds: string[]) {
    const plans = this.dayPlans(day), covered = new Set(plans.flatMap(plan => plan.taskIds));
    const added = taskIds.filter(taskId => !covered.has(taskId));
    if (!added.length) return;
    const primary = plans[0];
    if (primary) this.update('plan', primary, { taskIds: [...primary.taskIds, ...added] });
    else this.create('plan', { title: '今日计划', date: day, taskIds: added });
  }
  command(raw: unknown, authority: 'model' | 'human' = 'model') {
    const c = commandSchema.parse(raw);
    return this.transaction(() => {
      if (c.action === 'create' || c.action === 'create_tasks' || c.action === 'promote') {
        if (c.action === 'create') requireThat(!c.planDate || c.kind === 'task', "errors.onlyTaskToday");
        const previous = this.db.prepare('SELECT body FROM requests WHERE id=?').get(c.requestId);
        const fingerprint = JSON.stringify(c.action === 'create' ? { kind: c.kind, data: c.data, ...(c.planDate ? { planDate: c.planDate } : {}) } : { ...c, requestId: undefined });
        const kind = c.action === 'create' ? c.kind : 'task';
        if (previous) {
          const saved = JSON.parse(previous.body as string);
          requireThat(saved.fingerprint === fingerprint, "errors.requestReused", 409);
          return c.action === 'create_tasks' ? { tasks: saved.entityIds.map((entityId: string) => this.get(kind, entityId)) } : this.get(kind, saved.entityId);
        }
        let captured: Entity<'inbox'> | undefined;
        if (c.action === 'promote') {
          captured = this.get('inbox', c.id); this.check(captured, c.revision);
          requireThat(!captured.archived, "errors.restoreIdea");
        }
        const items = (c.action === 'create_tasks' ? c.data : [c.data]).map(data => this.create(kind, data, captured ? { capture: { id: captured.id, title: captured.title, capturedAt: captured.createdAt } } : {}));
        if (c.planDate) this.addToDay(c.planDate, items.map(item => item.id));
        if (captured) this.db.prepare('DELETE FROM entities WHERE kind=? AND id=?').run('inbox', captured.id);
        this.db.prepare('INSERT INTO requests VALUES (?,?)').run(c.requestId, JSON.stringify({ fingerprint, entityId: items[0].id, ...(c.action === 'create_tasks' ? { entityIds: items.map(item => item.id) } : {}) }));
        return c.action === 'create_tasks' ? { tasks: items } : items[0];
      }
      if (c.action === 'daily_plan') {
        const plans = this.dayPlans(c.date);
        requireThat(c.plans.length === plans.length && new Set(c.plans.map(plan => plan.id)).size === plans.length && plans.every(plan => c.plans.some(read => read.id === plan.id && read.revision === plan.revision)), "errors.stalePlan", 409);
        this.validate('plan', { title: '今日计划', date: c.date, taskIds: c.taskIds, note: c.note });
        const selected = new Set(c.taskIds), covered = new Set(plans.flatMap(plan => plan.taskIds));
        if (!plans.length) return { plans: [this.create('plan', { title: '今日计划', date: c.date, taskIds: c.taskIds, note: c.note })] };
        return { plans: plans.map((plan, index) => {
          const taskIds = plan.taskIds.filter(taskId => selected.has(taskId));
          if (!index) taskIds.push(...c.taskIds.filter(taskId => !covered.has(taskId)));
          const note = index ? plan.note : c.note;
          return JSON.stringify(taskIds) === JSON.stringify(plan.taskIds) && note === plan.note ? plan : this.update('plan', plan, { taskIds, note });
        }) };
      }
      if (c.action === 'update') {
        const item = this.get(c.kind, c.id); this.check(item, c.revision);
        if ('codex' in item && item.codex && 'title' in c.data) requireThat(c.data.title === item.title, "errors.projectName");
        return this.update(c.kind, item, c.data);
      }
      if (c.action === 'delete') {
        const item = this.get(c.kind, c.id); this.check(item, c.revision);
        const referenced = this.all('task').some(t => t.projectId === c.id || t.keyResultId === c.id)
          || this.all('keyResult').some(k => k.objectiveId === c.id) || this.all('plan').some(p => p.taskIds.includes(c.id));
        requireThat(!referenced, "errors.references");
        if (c.kind === 'task') {
          requireThat((item as Task).state === 'defining' && !(item as Task).sessionId && !this.meta<TimeRecord[]>('timeRecords', []).some(r => r.taskId === c.id) && this.focus().taskId !== c.id, "errors.taskRecords");
          requireThat(this.taskHistory(c.id).every(e => ['created', 'updated'].includes(e.type)), "errors.workflowRecords");
          this.db.prepare('DELETE FROM events WHERE task_id=?').run(c.id);
        }
        this.db.prepare('DELETE FROM entities WHERE id=?').run(c.id); return { deleted: c.id };
      }
      if (c.action === 'focus') return this.changeFocus(c);
      if (c.action === 'settings') {
        this.check(this.settings(), c.revision); return this.setMeta('settings', { ...c.data, revision: c.revision + 1 });
      }
      if (c.action === 'ack') {
        const row = this.db.prepare('SELECT body FROM notices WHERE id=?').get(c.id);
        requireThat(row, "errors.noticeMissing", 404);
        const notice = { ...JSON.parse(row.body as string), read: true };
        this.db.prepare('UPDATE notices SET body=? WHERE id=?').run(JSON.stringify(notice), c.id); return notice;
      }
      const task = this.get('task', c.id); this.check(task, c.revision);
      if (c.action === 'bind') {
        requireThat(['defining', 'ready', 'changes_requested'].includes(task.state), "errors.bindState");
        if (task.sessionId && task.sessionId !== c.sessionId) requireThat(authority === 'human', "errors.humanRebind");
        if (c.sessionId) {
          requireThat(this.sessions().some(s => s.id === c.sessionId && (s.source === 'codex-hook' || s.catalogVisible)), "errors.trustedSession");
          requireThat(!this.all('task').some(t => t.id !== task.id && t.sessionId === c.sessionId && t.state !== 'cancelled'), "errors.sessionBound");
        }
        task.sessionId = c.sessionId;
      }
      if (c.action === 'transition') {
        const allowed: Partial<Record<Task["state"], string[]>> = { defining: ['ready', 'cancelled'], ready: ['defining', 'executing', 'cancelled'], executing: ['cancelled'], changes_requested: ['ready', 'executing', 'cancelled'], cancelled: ['defining'], accepted: ['defining'] };
        requireThat(allowed[task.state]?.includes(c.state), 'errors.transition', 400, { from: task.state, to: c.state });
        if (task.state === 'accepted') requireThat(authority === 'human', "errors.humanReopen");
        if (c.state === 'executing' && authority === 'model') requireThat(task.sessionId, "errors.bindBeforeExecute");
        if (c.state === 'cancelled') requireThat(this.focus().taskId !== task.id || this.focus().status === 'idle', "errors.finishFocus");
        task.state = c.state;
      }
      if (c.action === 'submit') {
        requireThat(task.state === 'executing', "errors.submitState");
        for (const e of c.evidence) {
          requireThat(/^(https?:\/\/|\/|[A-Za-z]:[\\/])/.test(e.uri) && !/[\r\n]/.test(e.uri), "errors.evidenceUri");
          if (/^https?:/.test(e.uri)) { const url = new URL(e.uri); requireThat(!url.username && !url.password, "errors.evidenceCredentials"); }
        }
        task.state = 'awaiting_acceptance';
        task.delivery = { summary: c.summary, evidence: c.evidence, submittedAt: this.at() };
      }
      task.revision += 1; task.updatedAt = this.at();
      this.save('task', task); this.event(task.id, c.action, { revision: task.revision, state: task.state, ...(c.action === 'submit' ? { delivery: task.delivery } : {}), ...(c.action === 'bind' ? { sessionId: task.sessionId } : {}) });
      return task;
    });
  }
  review(raw: unknown) {
    const c = reviewSchema.parse(raw);
    return this.transaction(() => {
      const task = this.get('task', c.id); this.check(task, c.revision);
      requireThat(task.state === 'awaiting_acceptance' && task.delivery?.evidence.length, "errors.reviewState");
      if (c.decision === 'reject') requireThat(c.note.trim(), "errors.rejectReason");
      return this.recordReview(task, c);
    });
  }
  completeTask(raw: unknown) {
    const c = taskCompleteSchema.parse(raw);
    return this.transaction(() => {
      const task = this.get('task', c.id); this.check(task, c.revision);
      requireThat(['defining', 'ready', 'executing', 'changes_requested'].includes(task.state), 'errors.completionState');
      const session = this.sessions().find(session => session.id === task.sessionId);
      requireThat(!session || !['queued', 'running', 'waiting_approval', 'waiting_input'].includes(runtimeState(session.state)), 'errors.completionActive');
      const focus = this.focus();
      if (focus.taskId === task.id && focus.status !== 'idle') this.changeFocus({ action: 'focus', operation: 'finish', revision: focus.revision });
      return this.recordReview(task, { ...c, decision: 'accept', reviewer: 'human', note: i18n.t('task.completedByUser') });
    });
  }
  private recordReview(task: Task, c: z.output<typeof reviewSchema>) {
    requireThat(this.focus().taskId !== task.id || this.focus().status === 'idle', "errors.finishFocus");
    task.state = c.decision === 'accept' ? 'accepted' : 'changes_requested';
    task.revision++; task.updatedAt = this.at();
    task.review = { decision: c.decision, reviewer: c.reviewer, note: c.note, at: this.at(), reviewedRevision: c.revision };
    this.save('task', task); this.event(task.id, 'review', { ...task.review, delivery: task.delivery });
    if (task.sessionId && c.decision === 'accept') {
      const row = this.db.prepare('SELECT body FROM sessions WHERE id=?').get(task.sessionId);
      if (row) { const session = JSON.parse(row.body as string) as Session; recordSessionActivity(session, session, 'confirmed', task.review.at, 'task_confirmation', session.turnId); this.db.prepare('UPDATE sessions SET body=? WHERE id=?').run(JSON.stringify(session), session.id); }
    }
    return task;
  }
  confirmSession(raw: unknown): Session {
    const c = sessionConfirmSchema.parse(raw);
    return this.transaction(() => {
      const row = this.db.prepare('SELECT body FROM sessions WHERE id=?').get(c.id);
      requireThat(row, "errors.sessionMissing", 404);
      let session = preserveConfirmation(JSON.parse(row.body as string));
      requireThat(session.observedAt === c.observedAt && session.event === c.event && (session.turnId ?? null) === c.turnId && (session.catalogUpdatedAt ?? null) === c.catalogUpdatedAt, "errors.staleSession", 409);
      requireThat(['idle', 'completed'].includes(runtimeState(session.observedState)), "errors.confirmState");
      requireThat(!this.all('task').some(task => task.sessionId === c.id && task.state !== 'cancelled'), "errors.taskAcceptance");
      if (!session.confirmedAt) {
        session.confirmedAt = this.at();
        session = preserveConfirmation(session);
        recordSessionActivity(session, session, 'confirmed', session.confirmedAt!, 'human_confirmation', session.turnId);
        this.db.prepare('UPDATE sessions SET body=? WHERE id=?').run(JSON.stringify(session), session.id);
      }
      return session;
    });
  }
  changeFocus(c: Extract<Command, { action: 'focus' }>) {
    const f = this.focus(); this.check(f, c.revision);
    const at = this.at();
    if (c.operation === 'start') {
      requireThat(f.status === 'idle', "errors.finishCurrentFocus");
      const task = this.get('task', c.taskId!);
      requireThat(!['accepted', 'cancelled'].includes(task.state), "errors.endedTaskFocus");
      Object.assign(f, { taskId: task.id, status: 'running', startedAt: at, elapsedMs: 0, segments: [] });
    } else {
      requireThat(f.status !== 'idle', "errors.noFocus");
      if (c.operation === 'resume') { requireThat(f.status === 'paused', "errors.resumeFocus"); f.status = 'running'; f.startedAt = at; }
      else {
        if (c.operation === 'pause') requireThat(f.status === 'running', "errors.pauseFocus");
        if (f.startedAt) {
          f.segments.push({ start: f.startedAt, end: at, durationMs: Math.max(0, this.now() - Date.parse(f.startedAt)) });
          f.elapsedMs = elapsed(f, this.now()); f.startedAt = null;
        }
        f.status = 'paused';
        if (c.operation === 'finish') {
          const record = { id: randomUUID(), taskId: f.taskId!, endedAt: at, durationMs: f.elapsedMs, segments: f.segments };
          this.setMeta('timeRecords', [...this.meta<TimeRecord[]>('timeRecords', []), record]);
          this.event(f.taskId, 'focus', { durationMs: f.elapsedMs });
          Object.assign(f, { taskId: null, status: 'idle', elapsedMs: 0, startedAt: null, segments: [] });
        }
      }
    }
    f.revision++; return this.setMeta('focus', f);
  }
  private reopenAcceptedTask(sessionId: string, observedAt: string, turnId?: string | null, previousTurnId?: string | null) {
    for (const task of this.all('task').filter(task => task.sessionId === sessionId && task.state === 'accepted')) {
      if (Date.parse(observedAt) <= Date.parse(task.review?.at ?? task.updatedAt) || (turnId && turnId === previousTurnId)) continue;
      task.state = 'executing'; task.revision++; task.updatedAt = observedAt;
      delete task.review; delete task.delivery;
      this.save('task', task); this.event(task.id, 'session_resumed', { revision: task.revision, state: task.state, sessionId });
    }
  }
  observe(raw: unknown): Session {
    const event = z.object({ session_id: id, hook_event_name: z.enum(['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PermissionRequest', 'Stop', 'Interrupt', 'SessionEnd']), cwd: z.string().max(2000), turn_id: z.string().max(200).optional() }).parse(raw);
    return this.transaction(() => {
      const row = this.db.prepare('SELECT body FROM sessions WHERE id=?').get(event.session_id);
      const previous = row ? preserveConfirmation(JSON.parse(row.body as string)) : null;
      if (['Stop', 'Interrupt'].includes(event.hook_event_name) && previous?.turnId && event.turn_id && previous.turnId !== event.turn_id) return previous;
      const states = { SessionStart: 'idle', UserPromptSubmit: 'running', PreToolUse: 'running', PostToolUse: 'running', PermissionRequest: 'waiting_approval', Stop: 'idle', Interrupt: 'interrupted', SessionEnd: 'completed' };
      const session = { ...previous, id: event.session_id, cwd: event.cwd, observedState: states[event.hook_event_name], observedAt: this.at(), event: event.hook_event_name, turnId: event.turn_id ?? previous?.turnId ?? null, source: 'codex-hook' };
      if (!['SessionStart', 'Stop', 'SessionEnd'].includes(event.hook_event_name) || session.turnId !== previous?.turnId) delete session.confirmedAt;
      recordSessionActivity(session, previous, session.observedState, session.observedAt, session.event, session.turnId);
      this.db.prepare('INSERT OR REPLACE INTO sessions VALUES (?,?)').run(session.id, JSON.stringify(session));
      if (event.hook_event_name === 'UserPromptSubmit') this.reopenAcceptedTask(session.id, session.observedAt, event.turn_id, previous?.turnId);
      return session;
    });
  }
}
