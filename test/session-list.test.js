import test from 'node:test';
import assert from 'node:assert/strict';
import { groupSessionItems } from '../ui/session-list.ts';

test('session list groups linked tasks once and prioritizes attention with recent activity first', () => {
  const runtime = (id, state, at) => ({ id, state, observedState: state, observedAt: at, event: 'Stop', source: 'codex-hook', cwd: '/tmp' });
  const sessions = [runtime('a', 'idle', '2026-01-01T12:00:00Z'), runtime('b', 'waiting_input', '2026-01-01T11:00:00Z'), runtime('c', 'running', '2026-01-01T10:00:00Z')];
  const task = { id: 't', state: 'executing', sessionId: 'a', ai: sessions[0], updatedAt: '2026-01-01T12:00:00Z' };
  const groups = groupSessionItems([task], sessions);
  assert.deepEqual(groups.attention.map(row => row.id), ['b', 't']);
  assert.deepEqual(groups.running.map(row => row.id), ['c']);
  assert.equal(Object.values(groups).flat().length, 3);
});

test('authorization and input requests remain visible ahead of newer historical sessions', () => {
  const historical = Array.from({ length: 60 }, (_, i) => ({ id: `old-${i}`, state: 'unknown', observedState: 'unknown', observedAt: '2026-01-01T12:00:00Z', source: 'codex-hook', event: 'x', cwd: '/tmp' }));
  const approval = { id: 'approval', state: 'waiting_approval', observedState: 'waiting_approval', observedAt: '2026-01-01T10:00:00Z', source: 'codex-hook', event: 'PermissionRequest', cwd: '/tmp' };
  const input = { ...approval, id: 'input', state: 'waiting_input', observedState: 'waiting_input', observedAt: '2026-01-01T11:00:00Z' };
  assert.deepEqual(groupSessionItems([], [...historical, approval, input]).attention.slice(0, 2).map(item => item.id), ['input', 'approval']);
});

test('existing tasks without a session appear in progress without an unstarted group', () => {
  const tasks = ['defining', 'ready', 'changes_requested'].map(state => ({ id: state, state, updatedAt: '2026-01-01T12:00:00Z' }));
  const groups = groupSessionItems(tasks, []);
  assert.deepEqual(groups.running.map(item => item.id), tasks.map(item => item.id));
  assert.equal('unstarted' in groups, false);
});

test('session age filter uses real activity and keeps unknown dates visible', async () => {
  const { sessionWithinDays } = await import('../ui/session-list.ts');
  const now = Date.parse('2026-11-17T12:00:00Z');
  assert.equal(sessionWithinDays({ source: 'codex-app-server', catalogUpdatedAt: '2026-11-10T12:00:00Z', observedAt: '2026-11-17T12:00:00Z' }, 7, now), true);
  assert.equal(sessionWithinDays({ source: 'codex-app-server', catalogUpdatedAt: '2026-11-10T11:59:59Z', observedAt: '2026-11-17T12:00:00Z' }, 7, now), false);
  assert.equal(sessionWithinDays({ source: 'codex-hook', observedAt: '2026-11-17T11:00:00Z', catalogUpdatedAt: '2026-01-01T00:00:00Z' }, 7, now), true);
  assert.equal(sessionWithinDays({ source: 'codex-rollout', event: 'request_user_input_async', observedAt: '2026-11-17T12:00:00Z', catalogUpdatedAt: '2026-11-01T00:00:00Z' }, 2, now), false);
  assert.equal(sessionWithinDays({ source: 'codex-app-server' }, 7, now), true);
  assert.equal(sessionWithinDays({ source: 'codex-app-server', catalogUpdatedAt: '2020-01-01T00:00:00Z' }, 0, now), true);
});

test('session date ranges include overlaps and keep sessions with unknown endpoints visible', async () => {
  const { sessionOverlapsRange } = await import('../ui/session-list.ts');
  const range = { start: Date.parse('2026-11-15T00:00:00Z'), end: Date.parse('2026-11-16T00:00:00Z') };
  const base = { source: 'codex-app-server', observedAt: '2026-11-17T10:00:00Z' };
  assert.equal(sessionOverlapsRange({ ...base, catalogCreatedAt: '2026-11-01T00:00:00Z', catalogUpdatedAt: '2026-11-17T00:00:00Z' }, range), true);
  assert.equal(sessionOverlapsRange({ ...base, catalogCreatedAt: '2026-11-16T00:00:00Z', catalogUpdatedAt: '2026-11-17T00:00:00Z' }, range), true);
  assert.equal(sessionOverlapsRange({ ...base, catalogCreatedAt: '2026-11-17T00:00:00Z', catalogUpdatedAt: '2026-11-18T00:00:00Z' }, range), false);
  assert.equal(sessionOverlapsRange({ ...base, catalogCreatedAt: '2026-11-01T00:00:00Z', catalogUpdatedAt: '2026-11-14T23:59:59Z' }, range), false);
  assert.equal(sessionOverlapsRange({ ...base, catalogUpdatedAt: '2026-11-14T23:59:59Z' }, range), false);
  assert.equal(sessionOverlapsRange({ ...base, catalogUpdatedAt: '2026-11-17T00:00:00Z' }, range), true);
  assert.equal(sessionOverlapsRange({ ...base, catalogCreatedAt: '2026-11-01T00:00:00Z', catalogUpdatedAt: '2026-11-20T00:00:00Z' }, { start: Date.parse('2026-11-16T00:00:00Z'), end: Date.parse('2026-11-15T00:00:00Z') }), false);
});

test('project grouping respects task project and session workspace and preserves unassigned sessions', async () => {
  const { sessionProject } = await import('../ui/session-list.ts');
  const projects = [{ id: 'one', title: 'Project One', codex: { workspacePath: '/repo/one' } }, { id: 'two', title: 'Project Two', codex: { workspacePath: '/repo/two' } }];
  assert.equal(sessionProject(projects, { projectId: 'two' }, { cwd: '/repo/one' }).id, 'two');
  assert.equal(sessionProject(projects, undefined, { cwd: '/repo/one' }).id, 'one');
  assert.equal(sessionProject(projects, undefined, { cwd: '/elsewhere' }).id, '');
});

test('project completion excludes running and interrupted sessions even when a linked task is awaiting review', async () => {
  const { eligibleProjectPending } = await import('../ui/session-list.ts');
  const task = { state: 'awaiting_acceptance' };
  assert.equal(eligibleProjectPending({ id: '1', state: 'running' }, task), false);
  assert.equal(eligibleProjectPending({ id: '2', state: 'interrupted' }, task), false);
  assert.equal(eligibleProjectPending({ id: '3', state: 'idle' }, task), true);
  assert.equal(eligibleProjectPending({ id: '4', state: 'idle', confirmedAt: '2026-11-18T00:00:00Z' }), false);
});


test('catalog polling does not replace the real last activity timestamp', async () => {
  const { sessionLastActivity, groupSessionItems } = await import('../ui/session-list.ts');
  const session = { id: 's', state: 'idle', observedState: 'idle', source: 'codex-app-server', catalogUpdatedAt: '2026-11-10T10:00:00Z', observedAt: '2026-11-18T12:00:00Z' };
  assert.equal(sessionLastActivity(session), '2026-11-10T10:00:00Z');
  assert.equal(groupSessionItems([], [session]).attention[0].at, '2026-11-10T10:00:00Z');
  assert.equal(sessionLastActivity({ ...session, source: 'codex-rollout', event: 'request_user_input_async' }), '2026-11-10T10:00:00Z');
});

test('linked tasks and standalone sessions use the same summary-aware search', async () => {
  const { matchesSessionSearch } = await import('../ui/session-list.ts');
  const session = { id: 'source', title: '会话标题', preview: '排查支付链路', summary: { text: '支付对账的确定根因' } };
  const task = { title: '处理异常', description: '检查规则' };
  assert.equal(matchesSessionSearch('支付对账', task, session), true);
  assert.equal(matchesSessionSearch('支付对账', undefined, session), true);
  assert.equal(matchesSessionSearch('检查规则', task, session), true);
  assert.equal(matchesSessionSearch('unrelated', task, session), false);
});
