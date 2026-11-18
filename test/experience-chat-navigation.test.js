import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

test('continuing a started capture opens immediately and survives a slow or unavailable Codex CLI', async t => {
  // 仅替换外部 CLI 和系统打开器，保留真实 Store、跳转流程和持久化边界。
  const dir = mkdtempSync(join(tmpdir(), 'experience-navigation-'));
  const previousPath = process.env.PATH, previousDataDir = process.env.AI_TODOS_DATA_DIR;
  process.env.PATH = `${dir}:${previousPath}`;
  process.env.AI_TODOS_DATA_DIR = dir;
  t.after(() => {
    process.env.PATH = previousPath;
    if (previousDataDir === undefined) delete process.env.AI_TODOS_DATA_DIR;
    else process.env.AI_TODOS_DATA_DIR = previousDataDir;
    rmSync(dir, { recursive: true, force: true });
  });
  const { Store } = await import('../src/domain.ts');
  const { openExperienceChat } = await import('../src/codex.ts');
  const { prepareExperienceContext, writeExperienceTask } = await import('../src/experience-chat.ts');
  const db = join(dir, 'db'), opened = join(dir, 'opened'), cliUsed = join(dir, 'cli-used');
  let store = new Store(db);
  t.after(() => store.close());
  function seedChat() {
    const sourceId = randomUUID(), threadId = randomUUID();
    store.observe({ session_id: sourceId, hook_event_name: 'Stop', cwd: dir });
    const context = prepareExperienceContext(join(dir, 'contexts'), sourceId, [
      { turnId: 'source-turn', item: { id: 'evidence', type: 'agentMessage', text: '原文证据' } },
    ]);
    const chat = writeExperienceTask({ ...context, sourceId, threadId, title: '跳转测试', createdAt: store.at(), wikiRoot: dir, vaultRoot: dir, ingestSkill: join(dir, 'SKILL.md') });
    store.registerExperienceChat(chat);
    return chat;
  }
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  writeFileSync(join(dir, opener), `#!/bin/sh\nprintf '%s' "$1" > '${opened}'\n`, { mode: 0o755 });
  const slowCli = `#!${process.execPath}\nimport { createInterface } from 'node:readline';import { existsSync, writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(cliUsed)},'started');
createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);if(m.id===undefined)return;setTimeout(()=>console.log(JSON.stringify({id:m.id,result:m.method==='thread/turns/list'?{data:existsSync(${JSON.stringify(join(dir, 'has-turn'))})?[{id:'turn'}]:[]}:{}})),m.method==='initialize'?800:0);});`;
  writeFileSync(join(dir, 'codex'), slowCli, { mode: 0o755 });

  await t.test('a trusted start hook bypasses CLI startup, including after a service restart', async () => {
    const { sourceId, threadId } = seedChat();
    store.observe({ session_id: threadId, hook_event_name: 'UserPromptSubmit', cwd: dir, turn_id: 'capture-turn' });
    store.observe({ session_id: threadId, hook_event_name: 'Stop', cwd: dir, turn_id: 'capture-turn' });
    store.close(); store = new Store(db);
    const start = performance.now();
    const result = await openExperienceChat(store, sourceId, dir, dir);
    const elapsed = Math.round(performance.now() - start);
    t.diagnostic(`continued capture opened in ${elapsed}ms with an 800ms CLI startup delay`);
    assert.equal(existsSync(cliUsed), false, '继续沉淀不应启动 CLI 并等待初始化');
    assert.equal(result.prefilled, false);
    assert.equal(readFileSync(opened, 'utf8'), `codex://threads/${threadId}`);
    writeFileSync(join(dir, 'codex'), '#!/bin/sh\nexit 127\n', { mode: 0o755 });
    const reopened = await openExperienceChat(store, sourceId, dir, dir);
    assert.equal(reopened.chat.threadId, threadId);
    assert.equal(reopened.prefilled, false);
  });

  await t.test('missing hook history is checked once; only a positive turn check is retained across restarts', async () => {
    const chat = seedChat();
    writeFileSync(join(dir, 'codex'), slowCli, { mode: 0o755 });
    const unstarted = await openExperienceChat(store, chat.sourceId, dir, dir);
    assert.equal(unstarted.prefilled, true);
    assert.match(new URL(readFileSync(opened, 'utf8')).searchParams.get('prompt'), /task\.md/);
    writeFileSync(join(dir, 'has-turn'), 'yes');
    const started = await openExperienceChat(store, chat.sourceId, dir, dir);
    assert.equal(started.prefilled, false, '空轮次查询不能永久缓存，用户发送后应停止预填');
    store.close(); store = new Store(db);
    writeFileSync(join(dir, 'codex'), '#!/bin/sh\nexit 127\n', { mode: 0o755 });
    const resumed = await openExperienceChat(store, chat.sourceId, dir, dir);
    assert.equal(resumed.prefilled, false);
    assert.equal(readFileSync(opened, 'utf8'), `codex://threads/${chat.threadId}`);
  });

  await t.test('an official runtime start also enables direct navigation without hook history', async () => {
    const chat = seedChat();
    store.syncCodexThreads([{ id: chat.threadId, title: chat.title, cwd: dir, state: 'running', updatedAt: store.at() }], false);
    const resumed = await openExperienceChat(store, chat.sourceId, dir, dir);
    assert.equal(resumed.prefilled, false);
    assert.equal(readFileSync(opened, 'utf8'), `codex://threads/${chat.threadId}`);
  });

  await t.test('a known turn stays fast when its prompt hook was missed and only tool hooks were observed', async () => {
    const chat = seedChat();
    store.observe({ session_id: chat.threadId, hook_event_name: 'PreToolUse', cwd: dir, turn_id: 'existing-turn' });
    store.syncCodexThreads([{ id: chat.threadId, title: chat.title, cwd: dir, state: 'running', updatedAt: store.at(), observation: { source: 'codex-app-server', event: 'thread/list', turnId: 'existing-turn', observedAt: store.at() } }], false);
    assert.equal((await openExperienceChat(store, chat.sourceId, dir, dir)).prefilled, false);
    store.observe({ session_id: chat.threadId, hook_event_name: 'Stop', cwd: dir, turn_id: 'existing-turn' });
    store.close(); store = new Store(db);
    assert.equal((await openExperienceChat(store, chat.sourceId, dir, dir)).prefilled, false);
  });
});
