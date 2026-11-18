import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChunkAnalysis } from '../src/wiki-analysis.ts';

test('persists successful chunks and resumes only missing chunks after failure', async () => {
  const chunks = [[{turnId:'t1',itemId:'i1',type:'text',field:'text',start:0,end:1,value:'a'}],[{turnId:'t2',itemId:'i2',type:'text',field:'text',start:0,end:1,value:'b'}]];
  const saved = {}; let fail = true; const calls = [];
  const ask = async (kind, value) => { calls.push([kind,value]); if (kind === 'chunk' && value.index === 1 && fail) throw Error('timeout'); return {sessionSummary:kind === 'chunk' ? `段${value.index}` : '全会话',items:[]}; };
  const load = index => saved[index]; const save = (index,result) => {saved[index] = result};
  await assert.rejects(runChunkAnalysis(chunks, ask, load, save), /timeout/);
  assert.ok(saved[0]); assert.equal(saved[1], undefined);
  fail = false; calls.length = 0;
  const result = await runChunkAnalysis(chunks, ask, load, save);
  assert.equal(result.sessionSummary, '全会话');
  assert.deepEqual(calls.filter(([kind])=>kind==='chunk').map(([,value])=>value.index),[1]);
});

test('a one chunk session skips merge but still receives a final knowledge review', async () => {
  const chunks=[[{turnId:'t',itemId:'i',type:'text',field:'text',start:0,end:1,value:'a'}]];
  const calls = [];
  const result = await runChunkAnalysis(chunks, async kind => { calls.push(kind); return {sessionSummary:'完成',items:[]}; }, () => undefined, () => {});
  assert.equal(result.sessionSummary,'完成');
  assert.deepEqual(calls, ['chunk', 'curate']);
});

test('cached observations cannot bypass curation and the final review can reject all routine activity', async () => {
  const chunks = [[{ turnId: 't', itemId: 'u', type: 'userMessage', field: 'content[0].text', start: 0, end: 15, value: '比较三个 STE 技能的适用场景' }]];
  const routine = { title: '检查响应正文', conclusion: 'curl 退出码不能代替业务成功。', scope: '网络请求', evidence: 't/tool', unverified: '' };
  const cached = { sessionSummary: '比较 STE 技能，读取 GitHub 时发生限流。', items: [routine] };
  let calls = 0;
  const result = await runChunkAnalysis(chunks, async (kind, input) => {
    calls++;
    assert.equal(kind, 'curate');
    assert.equal(input.data.items[0].title, routine.title);
    assert.ok(input.context.some(fragment => fragment.value.includes('比较三个 STE')));
    return { sessionSummary: cached.sessionSummary, items: [] };
  }, () => cached, () => assert.fail('cached chunk must not be regenerated'));
  assert.equal(calls, 1);
  assert.deepEqual(result.items, [], 'a supported but low-value observation must not become a review candidate');
});

test('curation follows merge and receives bounded conversation context instead of the tool transcript', async () => {
  const fragment = (type, value, id) => ({ turnId: 't', itemId: id, type, field: 'text', start: 0, end: value.length, value });
  const chunks = [[fragment('userMessage', '选型目标：中文开发回复简洁。', 'u')], [fragment('commandExecution', 'network-log'.repeat(10000), 'tool')], [fragment('agentMessage', 'ste-zh 适合会话汇报；文本改写应比较另一技能。', 'a')]];
  const calls = [];
  const result = await runChunkAnalysis(chunks, async (kind, input) => {
    calls.push(kind);
    if (kind === 'curate') {
      assert.ok(input.context.some(fragment => fragment.itemId === 'u'));
      assert.ok(input.context.some(fragment => fragment.itemId === 'a'));
      assert.ok(input.context.every(fragment => fragment.itemId !== 'tool'));
      assert.ok(Buffer.byteLength(JSON.stringify(input.context)) <= 16000);
      return { sessionSummary: '选型', items: [{ title: '中文会话汇报选用 ste-zh 的适用边界', conclusion: '具体差异与局限', scope: '中文会话', evidence: 't/a', unverified: '没有效果对照测试' }] };
    }
    return { sessionSummary: '过程摘要', items: [] };
  }, () => undefined, () => {});
  assert.equal(calls.at(-1), 'curate');
  assert.equal(calls.filter(kind => kind === 'curate').length, 1);
  assert.match(result.items[0].title, /ste-zh/);
});

test('large conversation excerpts retain initial goals and later corrections within the context budget', async () => {
  const chunks = Array.from({ length: 30 }, (_, index) => [{
    turnId: `t${index}`, itemId: `i${index}`, type: index % 2 ? 'agentMessage' : 'userMessage', field: 'content[0].text',
    start: 0, end: 5002, value: `${index === 0 ? '最初目标' : index === 29 ? '最后修正' : '讨论'}${'🙂'.repeat(2500)}`,
  }]);
  const original = structuredClone(chunks);
  await runChunkAnalysis(chunks, async (kind, input) => {
    if (kind === 'curate') {
      assert.ok(input.context.some(fragment => fragment.itemId === 'i0'));
      assert.ok(input.context.some(fragment => fragment.itemId === 'i29'));
      assert.ok(Buffer.byteLength(JSON.stringify(input.context)) <= 16000);
      for (const fragment of input.context) {
        assert.equal(fragment.end, fragment.start + fragment.value.length);
        assert.ok(!/[\uD800-\uDBFF]$/.test(fragment.value), 'an excerpt must not end with half of a surrogate pair');
      }
    }
    return { sessionSummary: '讨论', items: [] };
  }, () => undefined, () => {});
  assert.deepEqual(chunks, original, 'the editorial context must not truncate source evidence');
});

test('neighboring fragments from the same turn retain explicitly marked overlap', async () => {
  const chunks=[[{turnId:'t',itemId:'i',type:'text',field:'text',start:0,end:3,value:'abc'}],[{turnId:'t',itemId:'i',type:'text',field:'text',start:3,end:6,value:'def'}]];
  let overlap;
  await runChunkAnalysis(chunks, async (kind, input) => { if(kind==='chunk' && input.index===1) overlap=input.previousContext; return {sessionSummary:'完成',items:[]}; }, () => undefined, () => {});
  assert.equal(overlap.value,'abc'); assert.equal(overlap.start,0); assert.equal(overlap.end,3);
});
