import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkThreadItems } from '../src/wiki-chunks.ts';

test('splits long items without dropping text and retains evidence addresses', () => {
  const text = '甲😀\\n'.repeat(80000);
  const input = [{turnId:'turn-1',item:{id:'item-1',type:'agentMessage',text}}];
  const chunks = chunkThreadItems(input, 5000);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => Buffer.byteLength(JSON.stringify(chunk)) <= 5000));
  const parts = chunks.flat().filter(part => part.field === 'text');
  assert.equal(parts.map(part => part.value).join(''), text);
  assert.ok(parts.every(part => part.turnId === 'turn-1' && part.itemId === 'item-1'));
  assert.equal(parts[0].start, 0);
  assert.equal(parts.at(-1).end, text.length);
});

test('handles mixed nested fields and preserves ordering without conflating turns', () => {
  const input = [{turnId:'t1',item:{id:'i1',type:'userMessage',content:[{type:'text',text:'用户问题'}]}},{turnId:'t2',item:{id:'i2',type:'commandExecution',aggregatedOutput:'x'.repeat(10000),exitCode:0}}];
  const parts = chunkThreadItems(input, 1500).flat();
  assert.equal(parts.filter(part => part.field === 'content[0].text').map(part => part.value).join(''), '用户问题');
  assert.equal(parts.filter(part => part.field === 'aggregatedOutput').map(part => part.value).join(''), 'x'.repeat(10000));
  assert.ok(parts.some(part => part.field === 'exitCode' && part.value === '0'));
});
