import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionActivityRows } from '../ui/session-activity.ts';

test('activity timeline merges observed changes and older human confirmations without inventing history', () => {
  const sessions = [{ id: 's', title: '排查问题', state: 'running', observedState: 'running', observedAt: '2026-11-11T02:00:00Z', event: 'UserPromptSubmit', cwd: '/tmp', source: 'codex-hook', activityHistory: [{ at: '2026-11-11T02:00:00Z', state: 'running', event: 'UserPromptSubmit', turnId: '2' }], confirmationHistory: [{ at: '2026-11-11T01:00:00Z', turnId: '1' }] }];
  assert.deepEqual(sessionActivityRows(sessions, []).map(row => [row.state, row.at]), [['running', '2026-11-11T02:00:00Z'], ['confirmed', '2026-11-11T01:00:00Z']]);
});

test('classifying a historical session does not create a human confirmation record', () => {
  const session = { id: 'legacy', title: '历史会话', state: 'unknown', observedState: 'unknown', observedAt: '2026-11-09T00:00:00Z', event: 'thread/list', cwd: '/tmp', source: 'codex-app-server', catalogVisible: true, catalogUpdatedAt: '2026-11-09T00:00:00Z' };
  const rows = sessionActivityRows([session], []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, 'unknown');
  assert.equal(rows.some(row => row.state === 'confirmed'), false);
});
