import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readThreadItems } from '../src/wiki-thread-reader.ts';

test('reads every page in order and retains stable evidence identifiers', async () => {
  const calls = [];
  const request = async (method, params) => { calls.push(params.cursor); return params.cursor ? { data: [{ turnId: 't2', item: { type: 'agentMessage', id: 'i2', text: '发现根因' } }], nextCursor: null } : { data: [{ turnId: 't1', item: { type: 'userMessage', id: 'i1', content: [{ type: 'text', text: '排查问题' }] } }], nextCursor: 'next' }; };
  const result = await readThreadItems(request, 'thread-id');
  assert.deepEqual(calls, [null, 'next']); assert.equal(result.length, 2); assert.equal(result[1].item.id, 'i2');
});
test('refuses repeated cursors but accepts a long history without truncating it', async () => {
  const request = async () => ({ data: [], nextCursor: 'same' });
  await assert.rejects(readThreadItems(request, 'thread-id'), /分页/);
  const result = await readThreadItems(async () => ({ data: [{ turnId: 't', item: { type: 'agentMessage', id: 'i', text: 'x'.repeat(900000) } }], nextCursor: null }), 'thread-id');
  assert.equal(result[0].item.text.length, 900000);
});

test('fails if the conversation changes while its snapshot is read', async () => {
  const { readStableThreadItems } = await import('../src/wiki-thread-reader.ts');
  let count = 0;
  const request = async () => ({ data: [{ turnId: 't', item: { id: 'i', type: 'agentMessage', text: String(++count) } }], nextCursor: null });
  await assert.rejects(readStableThreadItems(request, 'thread-id'), /变化/);
});
