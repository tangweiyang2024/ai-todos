import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeState, runtimeLabels, runtimeLabel, codexRuntimeState } from '../src/runtime.ts';
import { executionColumnForTask, executionColumnForSession, taskStatus, taskNextStep, canConfirmAiSession, visibleExecutionSessions, boardDropDecision } from '../ui/execution-board.ts';
import { taskSessionPrompt } from '../ui/codex-prompts.ts';

const task = (state, ai) => ({ id: 'task', state, sessionId: ai?.id, ai });
const runtime = state => ({ id: 'session', state, observedAt: '2026-10-10T00:00:00Z' });

test('bound planning sessions remain represented by their original task', () => {
  const prompt = taskSessionPrompt({ title: '原任务', description: '要做的内容', criteria: '验收要求' });
  assert.equal(prompt, '原任务\n\n任务内容：\n要做的内容\n\n验收标准：\n验收要求');
  const session = runtime('running');
  const bound = task('defining', { ...session, mode: 'planning' });
  assert.equal(executionColumnForTask(bound), 'executing');
  assert.equal(taskStatus(bound), '正在规划');
  assert.deepEqual(visibleExecutionSessions([session], [bound]), []);
  assert.deepEqual(visibleExecutionSessions([session], [{ ...bound, state: 'changes_requested' }]), []);
  assert.equal(executionColumnForTask({ ...bound, state: 'changes_requested' }), 'executing');
  assert.deepEqual(visibleExecutionSessions([session], [{ ...bound, state: 'awaiting_acceptance' }]), []);
  assert.deepEqual(visibleExecutionSessions([session], [{ ...bound, ai: null }]), []);
});

test('all Xinmo runtime states and planning labels retain their board meaning', () => {
  const expected = {
    queued: ['等待执行', 'executing'], running: ['正在执行', 'executing'],
    waiting_approval: ['等待审批', 'waiting_user'], waiting_input: ['等待输入', 'waiting_user'],
    interrupted: ['已中断', 'waiting_user'], failed: ['执行失败', 'waiting_user'],
    completed: ['待确定', 'waiting_confirmation'], idle: ['待确定', 'waiting_confirmation'], unknown: ['状态未确认', 'unknown'],
  };
  assert.deepEqual(Object.keys(runtimeLabels), Object.keys(expected));
  for (const [state, [label, column]] of Object.entries(expected)) {
    assert.equal(runtimeLabel(runtime(state)), label);
    assert.equal(executionColumnForSession(runtime(state)), column);
  }
  assert.equal(runtimeLabel({ state: 'queued', mode: 'planning' }), '等待规划');
  assert.equal(runtimeLabel({ state: 'running', mode: 'planning' }), '正在规划');
  assert.equal(runtimeLabel({ state: 'completed', mode: 'planning' }), '待确定');
  assert.equal(runtimeState('waiting'), 'waiting_approval');
  assert.equal(runtimeState('ended'), 'completed');
  assert.equal(codexRuntimeState({ type: 'active', activeFlags: ['waitingOnUserInput'] }), 'waiting_input');
  assert.equal(codexRuntimeState({ type: 'active', activeFlags: ['waitingOnApproval'] }), 'waiting_approval');
  assert.equal(codexRuntimeState({ type: 'systemError' }), 'failed');
  assert.equal(codexRuntimeState({ type: 'notLoaded' }), 'unknown');
});

test('stale active sessions remain visible without being eligible for completion', () => {
  for (const observedState of ['queued', 'running', 'waiting_approval', 'waiting_input']) {
    const session = { ...runtime('unknown'), observedState };
    assert.equal(executionColumnForSession(session), 'waiting_user');
    assert.equal(runtimeLabel(session), '状态未确认');
    assert.equal(canConfirmAiSession(session, []), false);
  }
  assert.equal(executionColumnForSession({ ...runtime('unknown'), observedState: 'unknown' }), 'unknown');
  assert.equal(canConfirmAiSession(runtime('interrupted'), []), false);
});

test('Xinmo task stages combine business state and runtime instead of leaving stopped work executing', () => {
  for (const [state, column] of Object.entries({ defining: 'defining', ready: 'ready', executing: 'executing', awaiting_acceptance: 'waiting_user', changes_requested: 'changes_requested', accepted: 'completed', cancelled: 'cancelled' })) assert.equal(executionColumnForTask(task(state)), column);
  for (const state of ['waiting_input', 'waiting_approval', 'failed']) assert.equal(executionColumnForTask(task('executing', runtime(state))), 'waiting_user');
  for (const state of ['idle', 'completed']) assert.equal(executionColumnForTask(task('executing', runtime(state))), 'waiting_confirmation');
  assert.equal(executionColumnForTask(task('executing', runtime('unknown'))), 'unknown');
  assert.equal(executionColumnForTask(task('executing', runtime('interrupted'))), 'ready');
  assert.equal(executionColumnForTask(task('defining', runtime('running'))), 'executing');
  assert.equal(executionColumnForTask(task('defining', { ...runtime('idle'), mode: 'planning' })), 'defining');
  assert.equal(executionColumnForTask(task('defining', { ...runtime('completed'), mode: 'planning', event: 'SessionEnd', turnId: null })), 'defining');
  assert.equal(executionColumnForTask(task('defining', { ...runtime('idle'), mode: 'planning', turnId: 'real-turn' })), 'waiting_confirmation');
  assert.equal(executionColumnForTask(task('defining', { ...runtime('completed'), mode: 'planning', event: 'Stop' })), 'waiting_confirmation');
  assert.equal(taskStatus(task('executing', runtime('idle'))), '待确认完成');
  assert.equal(taskStatus(task('awaiting_acceptance', runtime('idle'))), '待我验收');
  assert.equal(taskStatus(task('accepted', runtime('running'))), '已完成');
  assert.equal(taskStatus(task('cancelled', runtime('running'))), '已取消');
});

test('task next steps prioritize starting work before manual completion, session actions and delivery review', () => {
  const stopped = runtime('idle');
  assert.equal(taskStatus(task('defining', { ...stopped, mode: 'planning', event: 'Stop' })), '待确认完成');
  assert.equal(taskStatus(task('ready', stopped)), '待确认完成');
  assert.equal(executionColumnForTask(task('ready', { ...stopped, event: 'Stop' })), 'waiting_confirmation');
  for (const state of ['defining', 'ready', 'changes_requested']) {
    assert.equal(taskNextStep(task(state)).action, 'start');
    assert.equal(taskNextStep(task(state, stopped)).action, 'complete');
  }
  for (const [state, action] of Object.entries({ executing: 'complete', awaiting_acceptance: 'review' })) {
    assert.equal(taskNextStep(task(state, stopped)).action, action);
    assert.equal(taskNextStep(task(state)).action, action);
  }
  assert.equal(taskNextStep(task('ready')).label, 'task.startWork');
  assert.equal(taskNextStep(task('ready')).hint, 'task.nextStart');
  assert.equal(taskNextStep(task('ready', stopped)).action, 'complete');
  for (const state of ['running', 'queued', 'waiting_input', 'waiting_approval', 'failed', 'interrupted']) {
    assert.equal(taskNextStep(task('executing', runtime(state))).action, 'session');
  }
  assert.equal(taskNextStep(task('defining', { ...runtime('running'), mode: 'planning' })).action, 'session');
  assert.equal(taskNextStep(task('executing', runtime('waiting_input'))).label, 'task.reply');
  assert.equal(taskNextStep(task('executing', runtime('waiting_approval'))).label, 'task.handleApproval');
  assert.equal(taskNextStep(task('awaiting_acceptance', runtime('running'))).action, 'review');
  assert.equal(taskNextStep(task('accepted', runtime('running'))), null);
  assert.equal(taskNextStep(task('cancelled', stopped)), null);
});

test('confirmation, represented sessions and post-acceptance activity match Xinmo', () => {
  const ended = runtime('completed'), owner = task('executing', ended);
  assert.equal(canConfirmAiSession(ended, []), true);
  assert.equal(canConfirmAiSession(ended, [owner]), false);
  assert.deepEqual(visibleExecutionSessions([ended], [owner]), []);
  const accepted = { ...owner, state: 'accepted', review: { at: '2026-10-10T00:01:00Z' } };
  assert.deepEqual(visibleExecutionSessions([ended], [accepted]), []);
  const resumed = runtime('running');
  assert.deepEqual(visibleExecutionSessions([resumed], [accepted]), []);
  const newerEnd = { ...ended, observedAt: '2026-10-10T00:02:00Z' };
  assert.deepEqual(visibleExecutionSessions([newerEnd], [accepted]), []);
  assert.equal(canConfirmAiSession(newerEnd, [accepted]), false);
  const confirmed = { ...ended, confirmedAt: ended.observedAt };
  assert.equal(executionColumnForSession(confirmed), 'completed');
  assert.equal(canConfirmAiSession(confirmed, []), false);
  assert.equal(executionColumnForSession({ ...confirmed, state: 'running' }), 'executing');
  assert.deepEqual(boardDropDecision(task('awaiting_acceptance', ended), 'ready'), { action: 'request_changes' });
  assert.match(boardDropDecision(task('executing', runtime('waiting_input')), 'ready').reason, /审批或输入/);
  assert.match(boardDropDecision(owner, 'completed').reason, /不能通过拖拽/);
});
