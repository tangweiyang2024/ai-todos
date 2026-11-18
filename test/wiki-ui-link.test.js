import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWikiLink, selectWikiRecord } from '../ui/wiki-link.ts';

const sessionId = '11111111-1111-4111-8111-111111111111';
const firstId = '22222222-2222-4222-8222-222222222222';
const secondId = '33333333-3333-4333-8333-333333333333';

test('local approval link selects exactly the candidate requested from the embedded UI', () => {
  const parsed = parseWikiLink(`#experience=${sessionId}&record=${secondId}&revision=2`);
  assert.deepEqual(parsed, { sessionId, recordId: secondId, revision: 2 });
  const records = [{ id: firstId, revision: 1 }, { id: secondId, revision: 2 }];
  assert.equal(selectWikiRecord(records, parsed.recordId, parsed.revision).id, secondId);
  assert.throws(() => selectWikiRecord(records, parsed.recordId, 1), /wiki\.recordChanged/);
  assert.throws(() => selectWikiRecord(records, '44444444-4444-4444-8444-444444444444'), /wiki\.recordMissing/);
  assert.equal(parseWikiLink(`#experience=${sessionId}&record=bad`), null);
});
