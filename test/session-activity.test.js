import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionActivityRows } from '../ui/session-activity.ts';

test('activity timeline merges observed changes and older human confirmations without inventing history', () => {
  const sessions = [{ id: 's', title: '排查问题', state: 'running', observedState: 'running', observedAt: '2026-11-11T02:00:00Z', event: 'UserPromptSubmit', cwd: '/tmp', source: 'codex-hook', activityHistory: [{ at: '2026-11-11T02:00:00Z', state: 'running', event: 'UserPromptSubmit', turnId: '2' }], confirmationHistory: [{ at: '2026-11-11T01:00:00Z', turnId: '1' }] }];
  assert.deepEqual(sessionActivityRows(sessions, []).map(row => [row.state, row.at]), [['running', '2026-11-11T02:00:00Z'], ['confirmed', '2026-11-11T01:00:00Z']]);
});
