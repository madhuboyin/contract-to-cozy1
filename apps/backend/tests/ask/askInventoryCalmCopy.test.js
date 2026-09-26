const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { inventoryCalmCopy } = require('../../src/services/ask/handlers/inventory.handler.ts');

// ASK_COZY_INLINE_WORKSPACE_FRD IW-CALM-001, Inventory adoption (ACUI I-1, v1.121).
const counts = (overrides = {}) => ({ matchCount: 0, shownCount: 0, missingCount: 0, lifecycleCount: 0, incompleteFocus: false, lifecycleFocus: false, ...overrides });

test('a plain list states how many items are recorded and how many are missing details', () => {
  assert.equal(inventoryCalmCopy(counts({ matchCount: 12, shownCount: 12, missingCount: 5 })).headline, '12 items recorded, 5 with missing details.');
  assert.equal(inventoryCalmCopy(counts({ matchCount: 1, shownCount: 1, missingCount: 1 })).headline, '1 item recorded, 1 with missing details.');
});

test('"none missing" is scoped to the details Ask checks, never a claim that the records are complete', () => {
  assert.equal(inventoryCalmCopy(counts({ matchCount: 3, shownCount: 3 })).headline, '3 items recorded, none missing the details Ask checks.');
});

test('the incomplete and lifecycle focuses lead with what was asked', () => {
  assert.equal(inventoryCalmCopy(counts({ matchCount: 4, shownCount: 4, missingCount: 4, incompleteFocus: true })).headline, '4 records are missing details.');
  assert.equal(inventoryCalmCopy(counts({ matchCount: 1, shownCount: 1, missingCount: 1, incompleteFocus: true })).headline, '1 record is missing details.');
  assert.equal(inventoryCalmCopy(counts({ matchCount: 2, shownCount: 2, lifecycleCount: 2, lifecycleFocus: true })).headline, '2 items have a recorded end-of-life date in the next three years.');
  assert.equal(inventoryCalmCopy(counts({ matchCount: 1, shownCount: 1, lifecycleCount: 1, lifecycleFocus: true })).headline, '1 item has a recorded end-of-life date in the next three years.');
});

test('chips come from the same counts, and only a non-zero problem count is a caution', () => {
  const chips = inventoryCalmCopy(counts({ matchCount: 6, shownCount: 6, missingCount: 2, lifecycleCount: 0 })).chips;
  assert.deepEqual(chips, [
    { label: '6 records', tone: 'DEFAULT' },
    { label: '2 missing details', tone: 'CAUTION' },
    { label: '0 near end of life', tone: 'DEFAULT' },
  ]);
});

test('a truncated result says how many are shown; a complete one adds no support line', () => {
  assert.equal(inventoryCalmCopy(counts({ matchCount: 30, shownCount: 12, missingCount: 1 })).supportLine, 'Showing the first 12. Each row reflects the canonical inventory record.');
  assert.equal(inventoryCalmCopy(counts({ matchCount: 3, shownCount: 3 })).supportLine, undefined);
  for (const value of [inventoryCalmCopy(counts({ matchCount: 30, shownCount: 12 })), inventoryCalmCopy(counts({ matchCount: 3, shownCount: 3 }))]) {
    assert.ok(value.headline.length <= 200 && (value.supportLine ?? '').length <= 240);
  }
});
