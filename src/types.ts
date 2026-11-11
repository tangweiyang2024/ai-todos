import type { z } from 'zod';
import type { schemas, settingsSchema, commandSchema } from './domain.ts';

export type Kind = keyof typeof schemas;
export type EntityData<K extends Kind> = z.output<(typeof schemas)[K]>;
export type TaskState = 'defining' | 'ready' | 'executing' | 'awaiting_acceptance' | 'changes_requested' | 'accepted' | 'cancelled';
export type RuntimeState = 'queued' | 'running' | 'waiting_approval' | 'waiting_input' | 'interrupted' | 'failed' | 'completed' | 'idle' | 'unknown';
export interface EntityMeta { id: string; revision: number; createdAt: string; updatedAt: string }
export type Evidence = Extract<Command, { action: 'submit' }>['evidence'][number];
export interface Delivery { summary: string; evidence: Evidence[]; submittedAt: string }
export interface Review { decision: 'accept' | 'reject'; reviewer: string; note: string; at: string; reviewedRevision: number }
export interface SessionActivity { at: string; state: string; turnId: string | null; event: string }
export interface SessionConfirmation { at: string; observedAt: string; event: string; turnId: string | null; catalogUpdatedAt: string | null }
export interface Session {
  id: string; cwd: string; observedState: string; observedAt: string; event: string;
  turnId?: string | null; source: string; title?: string; preview?: string;
  codexProjectId?: string | null; catalogUpdatedAt?: string; catalogVisible?: boolean; confirmedAt?: string; confirmationHistory?: SessionConfirmation[]; activityHistory?: SessionActivity[];
}
export type LiveSession = Session & { state: string; mode?: 'planning' | 'execution' };
export type Task = EntityData<'task'> & EntityMeta & {
  state: TaskState; sessionId: string | null; ai?: LiveSession | null; delivery?: Delivery; review?: Review;
  capture?: { id: string; title: string; capturedAt: string };
};
export type Project = EntityData<'project'> & EntityMeta & { codex?: { projectId: string; workspacePath: string } };
export type Objective = EntityData<'objective'> & EntityMeta;
export type KeyResult = EntityData<'keyResult'> & EntityMeta;
export type Plan = EntityData<'plan'> & EntityMeta;
export type InboxItem = EntityData<'inbox'> & EntityMeta;
export interface Entities { task: Task; project: Project; objective: Objective; keyResult: KeyResult; plan: Plan; inbox: InboxItem }
export type Entity<K extends Kind = Kind> = Entities[K];
export interface Segment { start: string; end: string; durationMs: number }
export interface Focus { revision: number; taskId: string | null; status: 'idle' | 'running' | 'paused'; elapsedMs: number; startedAt: string | null; segments: Segment[] }
export interface TimeRecord { id: string; taskId: string; endedAt: string; durationMs: number; segments: Segment[] }
export type Settings = z.output<typeof settingsSchema> & { revision: number };
export interface Notice { id: string; key: string; title: string; taskId: string | null; createdAt: string; read: boolean }
export interface TaskEvent { id: string; at: string; type: string; revision?: number; state?: TaskState; sessionId?: string | null; delivery?: Delivery; decision?: Review['decision']; reviewer?: string; note?: string; reviewedRevision?: number; durationMs?: number }
export interface Snapshot { tasks: Task[]; projects: Project[]; objectives: Objective[]; keyResults: KeyResult[]; plans: Plan[]; inbox: InboxItem[]; sessions: LiveSession[]; focus: Focus & { totalMs: number }; settings: Settings; notices: Notice[]; timeRecords: TimeRecord[]; serverTime: string; csrf?: string }
export interface CodexProject { projectId: string; workspacePath: string; title: string }
export interface CodexThread { id: string; title: string; preview?: string; cwd: string; projectId?: string | null; updatedAt: string; state: string; observation?: Pick<Session, 'observedAt' | 'event' | 'source' | 'turnId'> }
export interface ServiceRuntime { pid: number; origin: string; token: string }
export type CommandInput = z.input<typeof commandSchema>;
export type TransitionState = Extract<Command, { action: 'transition' }>['state'];
export type Command = z.output<typeof commandSchema>;
export type TaskDraft = z.input<typeof schemas.task>;
export type DefinitionField = 'title' | 'description' | 'criteria';
export type DefinitionSuggestion = Partial<Pick<Task, DefinitionField>>;
export interface CaptureSuggestion extends Pick<Task, DefinitionField> { suggestedSteps: Pick<Task, DefinitionField>[]; reason: string }
