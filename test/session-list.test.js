import test from 'node:test';
import assert from 'node:assert/strict';
import { groupSessionItems } from '../ui/session-list.ts';

test('session list groups linked tasks once and prioritizes attention with recent activity first', () => {
  const runtime = (id, state, at) => ({ id, state, observedState: state, observedAt: at, event: 'Stop', source: 'codex-hook', cwd: '/tmp' });
  const sessions = [runtime('a', 'idle', '2026-01-01T12:00:00Z'), runtime('b', 'waiting_input', '2026-01-01T11:00:00Z'), runtime('c', 'running', '2026-01-01T10:00:00Z')];
  const task = { id: 't', state: 'executing', sessionId: 'a', ai: sessions[0], updatedAt: '2026-01-01T12:00:00Z' };
  const groups = groupSessionItems([task], sessions);
  assert.deepEqual(groups.attention.map(row => row.id), ['t', 'b']);
  assert.deepEqual(groups.running.map(row => row.id), ['c']);
  assert.equal(Object.values(groups).flat().length, 3);
});
