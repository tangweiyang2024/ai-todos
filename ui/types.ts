import type { CaptureSuggestion, TaskDraft, DefinitionField, DefinitionSuggestion, Task, Snapshot, Plan, InboxItem, Kind, Entity, Settings, LiveSession, TaskEvent, TransitionState } from '../src/types.ts';

export type Decision = 'accept' | 'reject';
export type FocusOperation = 'start' | 'pause' | 'resume' | 'finish';
export type RescheduleEdge = 'start' | 'end';
export interface DailyPlanDraft { taskIds: string[]; note: string }
export interface Modal {
  type: 'task' | 'entity' | 'daily_plan' | 'delivery' | 'review' | 'settings' | 'delete' | 'prompt';
  key?: string; task?: Task; history?: TaskEvent[]; entity?: Entity; kind?: Kind; parent?: string;
  draft?: Partial<Task> & Partial<DailyPlanDraft>; plans?: Plan[]; date?: string; planDate?: string;
  requestId?: string; onCreated?: () => void; returnTo?: Modal; ticket?: string;
  decision?: Decision; settings?: Settings; text?: string;
}
export interface CaptureCallbacks {
  onAdd: (data: TaskDraft[], requestId: string) => Promise<boolean>;
  onCapture: (title: string, requestId: string) => Promise<boolean>;
  onRefine: (draft: TaskDraft, receive: (suggestion: CaptureSuggestion) => void) => Promise<boolean>;
  onCreateTask: (draft?: TaskDraft, onCreated?: () => void) => void;
}
export interface TaskCallbacks {
  onOpenTask: (id: string, returnTo?: Modal) => Promise<boolean>;
  onOpenSession: (id: string) => Promise<boolean>;
  onReviewTask: (task: Task, decision?: Decision) => Promise<boolean>;
  onCompleteTask: (task: Task) => Promise<boolean>;
  onOpenCodex: (task: Task) => Promise<boolean>;
  onTransition: (id: string, revision: number, state: TransitionState, close?: boolean) => Promise<boolean>;
  onReschedule: (task: Task, dates: { plannedStart: string; plannedEnd: string } | { plannedStart: null; plannedEnd: null }) => Promise<boolean>;
  onConfirmSession: (session: Pick<LiveSession, 'id' | 'observedAt' | 'event' | 'turnId' | 'catalogUpdatedAt'>, silent?: boolean, archive?: boolean) => Promise<boolean>;
}
export interface TaskEditorProps {
  task?: Partial<Task>; history?: TaskEvent[]; snapshot: Snapshot; busy: boolean;
  onSave: (data: TaskDraft) => Promise<boolean>;
  onRefine: (draft: TaskDraft, receive: (suggestion: DefinitionSuggestion) => void, field: DefinitionField) => Promise<boolean>;
  onSyncProjects: () => Promise<boolean>; onTransition: (state: TransitionState) => Promise<boolean>;
  onBind: (sessionId: string | null) => Promise<boolean>;
  onSubmitDelivery: () => void; onReview: () => Promise<boolean>; onComplete: () => Promise<boolean>; onFocus: () => Promise<boolean>;
  onPrompt: () => Promise<boolean>; onOpenCodex: () => Promise<boolean>; onDelete: () => void;
}
export interface TodayProps extends CaptureCallbacks {
  snapshot: Snapshot; busy: boolean; visible: boolean; elapsedMs: number;
  onOpenTask: TaskCallbacks['onOpenTask']; onTaskAction: (task: Task) => Promise<boolean>;
  onFocusTask: (task: Task) => Promise<boolean>; onFocusOp: (operation: FocusOperation, taskId?: string) => Promise<boolean>;
  onPlan: () => void; onInbox: () => void;
}
export interface InboxProps extends Pick<CaptureCallbacks, 'onCapture' | 'onRefine'> {
  items: InboxItem[]; visible: boolean; busy: boolean; onClose: () => void;
  onPromote: (item: InboxItem, data: TaskDraft, today: boolean, openAfter: boolean, requestId: string) => Promise<boolean>;
  onArchive: (item: InboxItem, archived: boolean) => Promise<boolean>;
}
