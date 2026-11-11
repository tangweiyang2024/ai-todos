import type { LiveSession, Task } from '../src/types.ts';

export function sessionActivityRows(sessions: LiveSession[], tasks: Task[]) {
  return sessions.flatMap(session => {
    const activity = [...(session.activityHistory ?? [])];
    const confirmations = [...(session.confirmationHistory ?? []).map(entry => ({ at: entry.at, state: 'confirmed', event: 'human_confirmation', turnId: entry.turnId }))];
    if (session.confirmedAt && !confirmations.some(entry => entry.at === session.confirmedAt)) confirmations.push({ at: session.confirmedAt, state: 'confirmed', event: 'human_confirmation', turnId: session.turnId ?? null });
    const task = tasks.find(item => item.sessionId === session.id && item.state !== 'cancelled');
    if (task?.review?.decision === 'accept') confirmations.push({ at: task.review.at, state: 'confirmed', event: 'task_confirmation', turnId: null });
    for (const entry of confirmations) if (!activity.some(item => item.state === 'confirmed' && item.at === entry.at)) activity.push(entry);
    if (!activity.length && session.observedAt) activity.push({ at: session.observedAt, state: session.state, event: session.event, turnId: session.turnId ?? null });
    return activity.map(entry => ({ ...entry, session, task }));
  }).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
