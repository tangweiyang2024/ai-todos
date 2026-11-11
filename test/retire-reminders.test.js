import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { Store } from '../src/domain.ts';

test('starting the service preserves old reminders but does not create daily reviews', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-todos-retire-reminders-'));
  const portServer = createServer(); await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
  const port = portServer.address().port; await new Promise(resolve => portServer.close(resolve));
  const store = new Store(join(dir, 'ai-todos.sqlite'));
  store.command({ action: 'settings', revision: 0, data: { reminders: true, followUpMinutes: 1, reviewTime: '00:00', timezone: 'Asia/Shanghai' } });
  const notice = { id: randomUUID(), key: 'legacy', title: '旧提醒', taskId: null, createdAt: store.at(), read: false };
  store.db.prepare('INSERT INTO notices VALUES (?,?)').run(notice.id, JSON.stringify(notice)); store.close();
  const child = spawn(process.execPath, ['src/server.ts'], { env: { ...process.env, AI_TODOS_DATA_DIR: dir, AI_TODOS_PORT: String(port) }, stdio: 'ignore' });
  t.after(async () => { child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); rmSync(dir, { recursive: true, force: true }); });
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) { try { ready = (await fetch(`http://127.0.0.1:${port}/health`)).ok; } catch {} if (!ready) await new Promise(resolve => setTimeout(resolve, 30)); }
  assert.ok(ready, 'service started');
  const reopened = new Store(join(dir, 'ai-todos.sqlite'));
  try { assert.deepEqual(reopened.snapshot().notices.map(item => item.id), [notice.id]); assert.equal(reopened.settings().reviewTime, '00:00'); }
  finally { reopened.close(); }
});
