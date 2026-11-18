import test from 'node:test';
import assert from 'node:assert/strict';
import { selectSummaryCandidates, summaryTranscript } from '../src/session-summary.ts';

test('recent legacy summaries are refreshed in activity order while current summaries stay cached', () => {
  const now = Date.parse('2026-11-17T12:00:00Z');
  const sessions = [
    { id: 'old', catalogUpdatedAt: '2026-11-01T00:00:00Z', state: 'idle' },
    { id: 'fresh', catalogUpdatedAt: '2026-11-17T10:00:00Z', state: 'idle' },
    { id: 'cached', catalogUpdatedAt: '2026-11-16T10:00:00Z', state: 'idle', summary: { format: 'goal', text: '排查订单未免佣的原因', sourceUpdatedAt: '2026-11-16T10:00:00Z' } },
    { id: 'legacy', catalogUpdatedAt: '2026-11-16T09:00:00Z', state: 'idle', summary: { text: '用户要求排查订单未免佣的原因，助手检查了订单历史和计费记录。', sourceUpdatedAt: '2026-11-16T09:00:00Z' } },
    { id: 'changed', catalogUpdatedAt: '2026-11-15T10:00:00Z', state: 'idle', summary: { format: 'goal', text: '旧目标', sourceUpdatedAt: '2026-11-14T10:00:00Z' } },
    { id: 'running', catalogUpdatedAt: '2026-11-17T11:00:00Z', state: 'running' },
  ];
  assert.deepEqual(selectSummaryCandidates(sessions, 7, now).map(s => s.id), ['fresh', 'legacy', 'changed']);
  assert.deepEqual(selectSummaryCandidates(sessions, 1, now).map(s => s.id), ['fresh']);
});

test('transcript includes user and assistant text and marks omissions for long conversations', () => {
  const items = [{turnId:'a', item:{id:'1',type:'userMessage',content:[{type:'text',text:'目标'}]}}, {turnId:'a', item:{id:'2',type:'commandExecution',aggregatedOutput:'secret'}}, {turnId:'b', item:{id:'3',type:'agentMessage',text:'最终结果'}}];
  const result = summaryTranscript(items, 1000);
  assert.match(result.text, /目标/); assert.match(result.text, /最终结果/); assert.doesNotMatch(result.text, /secret/); assert.equal(result.partial, false);
  assert.equal(summaryTranscript([{turnId:'x',item:{id:'x',type:'agentMessage',text:'a'.repeat(3000)}}], 1000).partial, true);
});

test('summary generation reads conversation as data and uses an isolated temporary model thread', async t => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { randomUUID } = await import('node:crypto');
  const { Store } = await import('../src/domain.ts');
  const { generateSessionSummary } = await import('../src/codex.ts');
  const dir = mkdtempSync(join(tmpdir(), 'summary-test-')), oldPath = process.env.PATH, id = randomUUID();
  const responsePath = join(dir, 'response.json');
  const store = new Store(join(dir, 'test.sqlite'));
  t.after(() => { process.env.PATH = oldPath; store.close(); rmSync(dir, { recursive: true, force: true }); });
  store.syncCodexThreads([{ id, title: '测试会话', preview: '第一句', cwd: dir, updatedAt: new Date().toISOString(), state: 'idle' }]);
  writeFileSync(join(dir, 'codex'), `#!${process.execPath}
import {createInterface} from 'node:readline';
import {readFileSync} from 'node:fs';
if(process.argv.includes('proxy')) process.exit(1);
createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line); if(m.id===undefined)return;
 let result={};
 if(m.method==='thread/read')result={thread:{id:m.params.threadId}};
 if(m.method==='thread/items/list')result={data:[{turnId:'t',item:{id:'u',type:'userMessage',content:[{type:'text',text:'帮我查一下这个订单为什么没有免佣'}]}},{turnId:'t',item:{id:'a',type:'agentMessage',text:'查了订单和计费日志，已定位原因。'}}],nextCursor:null};
 if(m.method==='mcpServerStatus/list')result={data:[],nextCursor:null};
 if(m.method==='thread/start')result={thread:{id:'summary-thread'}};
 console.log(JSON.stringify({id:m.id,result}));
 if(m.method==='turn/start') { console.log(JSON.stringify({method:'item/completed',params:{threadId:'summary-thread',item:{type:'agentMessage',text:readFileSync(${JSON.stringify(responsePath)},'utf8')}}})); console.log(JSON.stringify({method:'turn/completed',params:{threadId:'summary-thread',turn:{status:'completed'}}})); }
});`, { mode: 0o755 });
  process.env.PATH = `${dir}:${oldPath}`;
  await t.test('returns the short goal in the current summary format', async () => {
    writeFileSync(responsePath, JSON.stringify({ summary: '排查订单未免佣的原因' }));
    assert.deepEqual(await generateSessionSummary(store, id), { format: 'goal', text: '排查订单未免佣的原因', partial: false });
  });
  await t.test('rejects model output that would expand the card into a detailed recap', async () => {
    const detail = '读取订单、核对计费记录、检查处理流程。';
    for (const summary of [detail.repeat(10), `排查订单未免佣的原因\n${detail}`]) {
      writeFileSync(responsePath, JSON.stringify({ summary }));
      await assert.rejects(generateSessionSummary(store, id), /概要生成结果无效/);
    }
  });
});

test('session visibility defaults to two days and survives legacy settings updates', async t => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { Store } = await import('../src/domain.ts');
  const dir = mkdtempSync(join(tmpdir(), 'visibility-test-'));
  const store = new Store(join(dir, 'test.sqlite'));
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  assert.equal(store.settings().sessionMaxAgeDays, 2);
  const { revision, ...data } = store.settings();
  store.command({ action: 'settings', revision, data: { ...data, sessionMaxAgeDays: 9 } });
  const current = store.settings();
  store.command({ action: 'settings', revision: current.revision, data: { reminders: current.reminders, followUpMinutes: current.followUpMinutes, reviewTime: current.reviewTime, timezone: current.timezone } });
  assert.equal(store.settings().sessionMaxAgeDays, 9);
});
