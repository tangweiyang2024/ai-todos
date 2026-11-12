// Ported from Xinmo Desktop lib/execution-board.ts; normalize existing local observations.
import { i18n } from './i18n.ts';
import type { TranslationKey } from './i18n.ts';
export function runtimeState(state?: string | null): string { return ({ waiting: 'waiting_approval', ended: 'completed' } as Record<string, string>)[state ?? ''] || state || 'unknown'; }

export const runtimeLabels: Record<string, TranslationKey> = {
  queued: "runtime.queued", running: "runtime.running", waiting_approval: "runtime.waitingApproval", waiting_input: "runtime.waitingInput",
  interrupted: "runtime.interrupted", failed: "runtime.failed", completed: "runtime.pendingConfirmation", idle: "runtime.pendingConfirmation", unknown: "runtime.unknown",
};
const planningLabels: Record<string, TranslationKey> = {
  queued: "runtime.planningQueued", running: "runtime.planningRunning", waiting_approval: "runtime.planningApproval", waiting_input: "runtime.planningInput",
  interrupted: "runtime.planningInterrupted", failed: "runtime.planningFailed", completed: "runtime.pendingConfirmation", idle: "runtime.pendingConfirmation", unknown: "runtime.unknown",
};
export function runtimeLabel(runtime?: { state?: string; mode?: string; stateConfidence?: string } | null) {
  if (!runtime) return undefined;
  if (runtime.stateConfidence === 'last_observed' && runtimeState(runtime.state) === 'running') return i18n.t('runtime.lastObservedRunning');
  const key = (runtime.mode === 'planning' ? planningLabels : runtimeLabels)[runtimeState(runtime.state)];
  return key ? i18n.t(key) : undefined;
}
export function codexRuntimeState(status: { type: string; activeFlags?: string[] }) {
  if (status.type === 'active') {
    if (status.activeFlags?.includes('waitingOnApproval')) return 'waiting_approval';
    if (status.activeFlags?.includes('waitingOnUserInput')) return 'waiting_input';
    return 'running';
  }
  return status.type === 'idle' ? 'idle' : status.type === 'systemError' ? 'failed' : 'unknown';
}
