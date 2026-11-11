import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/domain.ts';
import { executionColumnForTask, taskStatus, visibleExecutionSessions } from '../ui/execution-board.ts';
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'ai-todos-domain-')); let now = Date.parse('2026-10-10T00:00:00Z');
  const store = new Store(join(dir, 'data.sqlite'), () => now);
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { store, advance: ms => { now += ms; }, path: join(dir, 'data.sqlite') };
}
const create = (s, kind, data, requestId = randomUUID()) => s.command({ action: 'create', kind, data, requestId });
const transition = (s, task, state, authority = 'human') => s.command({ action: 'transition', id: task.id, revision: task.revision, state }, authority);
const submit = (s, task) => s.command({ action: 'submit', id: task.id, revision: task.revision, summary: '真实交付', evidence: [{ label: '源文件', uri: '/tmp/deliverable.txt', note: '实际文件引用' }] });
const review = (s, task, decision = 'accept') => s.review({ id: task.id, revision: task.revision, decision, confirmed: true, reviewer: 'test-human', note: decision === 'reject' ? '需要补齐交付' : '' });

test('persistent CRUD, request idempotency, references, scheduling and stale revisions', t => {
  const { store: s, path } = fixture(t);
  const p = create(s, 'project', { title: '项目' }); const o = create(s, 'objective', { title: '目标' });
  const kr = create(s, 'keyResult', { title: '结果', objectiveId: o.id, target: 10 });
  const requestId = randomUUID(); const data = { title: '任务', projectId: p.id, keyResultId: kr.id };
  let task = create(s, 'task', data, requestId); assert.equal(create(s, 'task', data, requestId).id, task.id);
  assert.throws(() => create(s, 'task', { title: '另一个' }, requestId), /requestId/);
  const plan = create(s, 'plan', { title: '今日', date: '2026-10-10', taskIds: [task.id] });
  assert.throws(() => s.command({ action: 'delete', kind: 'project', id: p.id, revision: p.revision }), /引用/);
  assert.throws(() => s.command({ action: 'update', kind: 'task', id: task.id, revision: 1, data: { state: 'accepted' } }), /Unrecognized key/);
  assert.throws(() => s.command({ action: 'update', kind: 'task', id: task.id, revision: 1, data: { plannedStart: '2026-10-10T00:00:00Z' } }), /同时/);
  task = s.command({ action: 'update', kind: 'task', id: task.id, revision: 1, data: { plannedStart: '2026-10-10T00:00:00Z', plannedEnd: '2026-10-12T00:00:00Z' } });
  assert.throws(() => s.command({ action: 'update', kind: 'task', id: task.id, revision: 1, data: { title: '过期' } }), /数据已更新/);
  const reopened = new Store(path); assert.equal(reopened.get('task', task.id).plannedEnd, task.plannedEnd); reopened.close();
  assert.equal(s.get('plan', plan.id).taskIds[0], task.id);
});

test('workflow allows empty criteria and requires evidence and explicit human review on the reviewed revision', t => {
  const { store: s } = fixture(t); let task = create(s, 'task', { title: '交付任务' });
  task = transition(s, task, 'ready');
  assert.equal(task.criteria, '');
  assert.throws(() => transition(s, task, 'executing', 'model'), /可信会话/);
  task = transition(s, task, 'executing');
  assert.throws(() => s.command({ action: 'transition', id: task.id, revision: task.revision, state: 'accepted' }), /Invalid option/);
  assert.throws(() => s.command({ action: 'submit', id: task.id, revision: task.revision, summary: '完成', evidence: [] }));
  assert.throws(() => s.command({ action: 'submit', id: task.id, revision: task.revision, summary: '完成', evidence: [{ label: '坏链接', uri: 'javascript:alert(1)' }] }), /绝对路径/);
  task = submit(s, task); const firstDelivery = task;
  assert.throws(() => s.review({ id: task.id, revision: task.revision, confirmed: false, reviewer: 'AI', decision: 'accept' }));
  task = review(s, task, 'reject'); task = transition(s, task, 'executing'); task = submit(s, task);
  assert.throws(() => review(s, firstDelivery), /数据已更新/);
  assert.throws(() => s.command({ action: 'update', kind: 'task', id: task.id, revision: task.revision, data: { title: '替换审阅内容' } }), /退回/);
  const reviewedRevision = task.revision; task = review(s, task);
  assert.equal(task.state, 'accepted'); assert.equal(task.review.reviewedRevision, reviewedRevision);
  assert.equal(task.criteria, '');
  assert.equal(s.taskHistory(task.id).filter(e => e.type === 'review').length, 2);
  assert.throws(() => transition(s, task, 'defining', 'model'), /由人/);
});

test('saving dates preserves task row order across snapshots and reopening the store', t => {
  const { store: s, path } = fixture(t);
  const first = create(s, 'task', { title: '第一行' });
  const second = create(s, 'task', { title: '第二行' });
  s.command({ action: 'update', kind: 'task', id: first.id, revision: first.revision, data: { plannedStart: '2026-10-30T00:00:00Z', plannedEnd: '2026-10-31T00:00:00Z' } });
  assert.deepEqual(s.snapshot().tasks.map(task => task.id), [first.id, second.id]);
  const reopened = new Store(path);
  try { assert.deepEqual(reopened.snapshot().tasks.map(task => task.id), [first.id, second.id]); }
  finally { reopened.close(); }
});

test('an unscheduled task can be scheduled directly with the existing update command', t => {
  const { store: s } = fixture(t);
  const task = create(s, 'task', { title: '拖入时间轴' });
  assert.equal(task.plannedStart, null);
  const dates = { plannedStart: '2026-10-29T16:00:00.000Z', plannedEnd: '2026-10-30T16:00:00.000Z' };
  const scheduled = s.command({ action: 'update', kind: 'task', id: task.id, revision: task.revision, data: dates });
  assert.equal(scheduled.plannedStart, dates.plannedStart);
  assert.equal(scheduled.plannedEnd, dates.plannedEnd);
  assert.equal(scheduled.state, 'defining');
  assert.equal(scheduled.revision, task.revision + 1);
  const moved = s.command({ action: 'update', kind: 'task', id: task.id, revision: scheduled.revision, data: {
    plannedStart: '2026-10-30T04:00:00.000Z', plannedEnd: '2026-10-31T04:00:00.000Z',
  } });
  assert.equal(Date.parse(moved.plannedStart) - Date.parse(scheduled.plannedStart), 12 * 3600000);
  assert.equal(Date.parse(moved.plannedEnd) - Date.parse(moved.plannedStart), 24 * 3600000);
  const resized = s.command({ action: 'update', kind: 'task', id: task.id, revision: moved.revision, data: {
    plannedEnd: '2026-10-30T16:00:00.000Z',
  } });
  assert.equal(resized.plannedStart, moved.plannedStart);
  assert.equal(Date.parse(resized.plannedEnd) - Date.parse(resized.plannedStart), 12 * 3600000);
});

test('timeline rescheduling locks submitted and ended tasks and validates editable dates', t => {
  const { store: s } = fixture(t);
  for (const state of ['defining', 'awaiting_acceptance', 'accepted', 'cancelled']) {
    let task = create(s, 'task', { title: '排期任务', plannedStart: '2026-10-10T00:00:00Z', plannedEnd: '2026-10-12T00:00:00Z' });
    if (state === 'cancelled') task = transition(s, task, 'cancelled');
    if (['awaiting_acceptance', 'accepted'].includes(state)) task = submit(s, transition(s, transition(s, task, 'ready'), 'executing'));
    if (state === 'accepted') task = review(s, task);
    const before = task;
    const update = (data, revision = task.revision) => s.command({ action: 'update', kind: 'task', id: task.id, revision, data });
    const moved = { plannedStart: '2026-10-11T00:00:00Z', plannedEnd: '2026-10-13T00:00:00Z' };
    if (state !== 'defining') {
      assert.throws(() => update(moved), /退回/);
      assert.throws(() => update({ plannedStart: null, plannedEnd: null }), /退回/);
      assert.throws(() => update({ plannedStart: '2026-10-09T00:00:00Z' }), /退回/);
      assert.throws(() => update({ plannedEnd: '2026-10-14T00:00:00Z' }), /退回/);
      assert.deepEqual(s.get('task', task.id), before);
      continue;
    }
    task = update(moved);
    assert.equal(task.plannedStart, moved.plannedStart);
    assert.equal(task.plannedEnd, moved.plannedEnd);
    assert.throws(() => update(moved, before.revision), /数据已更新/);
    task = update({ plannedStart: '2026-10-10T00:00:00Z' });
    task = update({ plannedEnd: '2026-10-14T00:00:00Z' });
    assert.equal(task.plannedStart, '2026-10-10T00:00:00Z');
    assert.equal(task.plannedEnd, '2026-10-14T00:00:00Z');
    assert.equal(task.revision, before.revision + 3);
    assert.equal(task.state, before.state);
    assert.deepEqual(task.review, before.review);
    assert.deepEqual(task.delivery, before.delivery);
    assert.throws(() => update({ plannedEnd: task.plannedStart }));
    assert.throws(() => update({ plannedStart: null }));
    assert.equal(s.get('task', task.id).revision, task.revision);
    task = update({ plannedStart: null, plannedEnd: null });
    assert.equal(task.plannedStart, null);
    assert.equal(task.plannedEnd, null);
    assert.equal(task.state, before.state);
    assert.deepEqual(task.review, before.review);
    assert.deepEqual(task.delivery, before.delivery);
  }
});

test('hook-observed IDs, unique binding, Xinmo planning projection and Stop never submit or accept', t => {
  const { store: s, advance } = fixture(t); const sessionId = randomUUID();
  let task = create(s, 'task', { title: 'AI 任务', criteria: '完整交付' });
  assert.throws(() => s.command({ action: 'bind', id: task.id, revision: task.revision, sessionId }), /可信/);
  s.observe({ session_id: sessionId, cwd: '/tmp/project', hook_event_name: 'UserPromptSubmit', turn_id: 'turn-1' });
  task = s.command({ action: 'bind', id: task.id, revision: task.revision, sessionId });
  const other = create(s, 'task', { title: '另一个' });
  assert.throws(() => s.command({ action: 'bind', id: other.id, revision: other.revision, sessionId }), /已绑定/);
  let snapshot = s.snapshot(), projected = snapshot.tasks.find(t => t.id === task.id);
  assert.equal(projected.ai.mode, 'planning');
  assert.equal(executionColumnForTask(projected), 'executing');
  assert.equal(taskStatus(projected), '正在规划');
  s.observe({ session_id: sessionId, cwd: '/tmp/project', hook_event_name: 'Stop', turn_id: 'turn-1' });
  snapshot = s.snapshot(); projected = snapshot.tasks.find(t => t.id === task.id);
  assert.equal(projected.state, 'defining');
  assert.equal(executionColumnForTask(projected), 'waiting_confirmation');
  assert.equal(taskStatus(projected), '待确认完成');
  assert.deepEqual(visibleExecutionSessions(snapshot.sessions, snapshot.tasks), []);
  assert.equal(snapshot.sessions[0].mode, undefined);
  task = transition(s, task, 'ready');
  projected = s.snapshot().tasks.find(t => t.id === task.id);
  assert.equal(projected.ai.mode, 'execution');
  assert.equal(executionColumnForTask(projected), 'waiting_confirmation');
  s.observe({ session_id: sessionId, cwd: '/tmp/project', hook_event_name: 'UserPromptSubmit', turn_id: 'turn-2' });
  task = transition(s, task, 'executing', 'model');
  assert.equal(s.snapshot().tasks.find(t => t.id === task.id).ai.mode, 'execution');
  assert.equal(s.snapshot().tasks.find(t => t.id === task.id).ai.state, 'running');
  advance(300001); assert.equal(s.snapshot().tasks.find(t => t.id === task.id).ai.state, 'unknown');
  s.observe({ session_id: sessionId, cwd: '/tmp/project', hook_event_name: 'Stop', turn_id: 'older-turn' });
  assert.equal(s.sessions()[0].observedState, 'running');
  s.observe({ session_id: sessionId, cwd: '/tmp/project', hook_event_name: 'Stop', turn_id: 'turn-2' });
  assert.equal(s.get('task', task.id).state, 'executing'); assert.equal(s.sessions()[0].state, 'idle');
  assert.equal(s.get('task', task.id).delivery, undefined);
});

test('explicit manual completion accepts empty tasks and records the displayed revision without inventing delivery', t => {
  const { store: s } = fixture(t);
  for (const state of ['defining', 'ready', 'executing', 'changes_requested']) {
    let task = create(s, 'task', { title: `人工完成 ${state}` });
    if (state !== 'defining') task = transition(s, task, 'ready');
    if (['executing', 'changes_requested'].includes(state)) task = transition(s, task, 'executing');
    if (state === 'changes_requested') task = review(s, submit(s, task), 'reject');
    const input = { id: task.id, revision: task.revision, confirmed: true };
    assert.throws(() => s.completeTask({ ...input, confirmed: false }));
    assert.throws(() => s.completeTask({ ...input, revision: input.revision + 1 }), /数据已更新/);
    const completed = s.completeTask(input);
    assert.equal(completed.state, 'accepted');
    assert.equal(completed.review.reviewedRevision, input.revision);
    assert.equal(completed.review.reviewer, 'human');
    assert.equal(completed.criteria, '');
    assert.deepEqual(completed.delivery, task.delivery);
    assert.equal(executionColumnForTask(completed), 'completed');
    assert.throws(() => s.completeTask(input), /数据已更新/);
    assert.throws(() => s.completeTask({ ...input, revision: completed.revision }), /完成/);
    assert.equal(s.taskHistory(task.id).filter(e => e.type === 'review').length, state === 'changes_requested' ? 2 : 1);
  }
  let submitted = create(s, 'task', { title: '待审阅交付' });
  submitted = submit(s, transition(s, transition(s, submitted, 'ready'), 'executing'));
  assert.throws(() => s.completeTask({ id: submitted.id, revision: submitted.revision, confirmed: true }), /完成/);
  let cancelled = create(s, 'task', { title: '已取消' });
  cancelled = transition(s, cancelled, 'cancelled');
  assert.throws(() => s.completeTask({ id: cancelled.id, revision: cancelled.revision, confirmed: true }), /完成/);
});

test('manual completion rejects an active linked session and finishes existing focus after Stop', t => {
  const { store: s, advance } = fixture(t); const sessionId = randomUUID();
  let task = create(s, 'task', { title: '关联会话完成' });
  s.observe({ session_id: sessionId, cwd: '/tmp/test', hook_event_name: 'UserPromptSubmit', turn_id: 'turn' });
  task = s.command({ action: 'bind', id: task.id, revision: task.revision, sessionId });
  const input = { id: task.id, revision: task.revision, confirmed: true };
  s.command({ action: 'focus', operation: 'start', taskId: task.id, revision: 0 });
  advance(30000);
  assert.throws(() => s.completeTask(input), { code: 'errors.completionActive' });
  assert.equal(s.snapshot().focus.status, 'running');
  s.observe({ session_id: sessionId, cwd: '/tmp/test', hook_event_name: 'PermissionRequest', turn_id: 'turn' });
  assert.throws(() => s.completeTask(input), { code: 'errors.completionActive' });
  s.observe({ session_id: sessionId, cwd: '/tmp/test', hook_event_name: 'Stop', turn_id: 'turn' });
  task = s.completeTask(input);
  const snapshot = s.snapshot();
  assert.equal(snapshot.focus.status, 'idle');
  assert.equal(snapshot.timeRecords[0].durationMs, 30000);
  assert.equal(snapshot.sessions.length, 1);
  assert.deepEqual(visibleExecutionSessions(snapshot.sessions, snapshot.tasks), []);
  assert.equal(task.delivery, undefined);
});

test('focus survives process restart, pause/resume excludes pause, stale clicks do not double record', t => {
  const { store: s, advance, path } = fixture(t); const task = create(s, 'task', { title: '专注' });
  let f = s.command({ action: 'focus', operation: 'start', taskId: task.id, revision: 0 });
  advance(30000); const reopened = new Store(path, s.now); assert.equal(reopened.snapshot().focus.totalMs, 30000); reopened.close();
  f = s.command({ action: 'focus', operation: 'pause', revision: f.revision }); advance(60000);
  assert.equal(s.snapshot().focus.totalMs, 30000);
  f = s.command({ action: 'focus', operation: 'resume', revision: f.revision }); advance(20000);
  const revision = f.revision; s.command({ action: 'focus', operation: 'finish', revision });
  assert.throws(() => s.command({ action: 'focus', operation: 'finish', revision }), /数据已更新/);
  assert.equal(s.snapshot().timeRecords.length, 1); assert.equal(s.snapshot().timeRecords[0].durationMs, 50000);
  assert.equal(s.snapshot().timeRecords[0].segments.length, 2);
  assert.throws(() => s.command({ action: 'delete', kind: 'task', id: task.id, revision: task.revision }), /保留/);
});

test('scheduler persists reminders, follow-up and review, deduplicates and catches up after downtime', t => {
  const { store: s, advance } = fixture(t); let task = create(s, 'task', { title: '跟进', criteria: '交付', remindAt: '2026-10-10T00:01:00Z' });
  s.command({ action: 'settings', revision: 0, data: { reminders: true, followUpMinutes: 1, reviewTime: '08:01', timezone: 'Asia/Shanghai' } });
  task = transition(s, task, 'ready'); task = transition(s, task, 'executing');
  s.tick(); assert.equal(s.snapshot().notices.length, 0);
  advance(120000); s.tick(); assert.equal(s.snapshot().notices.length, 3);
  s.tick(); assert.equal(s.snapshot().notices.length, 3);
  const notice = s.snapshot().notices[0]; s.command({ action: 'ack', id: notice.id }); assert.equal(s.snapshot().notices[0].read, true);
  advance(60000); s.tick(); assert.equal(s.snapshot().notices.length, 4);
});
