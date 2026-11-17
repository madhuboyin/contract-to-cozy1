const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { warrantiesFromRecords, WARRANTY_RECALL_CONDITION } = require('../../src/services/ask/handlers/warranties.handler.ts');

// FR-PLAN-5 (live prompt #61): "show appliances that have open recalls and no active warranty" answered only the warranty half.
const record = { id: 'w1', propertyId: 'p1', providerName: 'Acme', category: 'APPLIANCE', coverageDetails: null, startDate: new Date('2024-01-01'), expiryDate: new Date('2030-01-01'), updatedAt: new Date('2026-09-01'), inventoryItem: null, documents: [] };
const run = (message, records = [record]) => warrantiesFromRecords({ message, propertyId: 'p1', records, canWrite: true, ownedIds: new Set(), priorViewState: null });

test('a warranty request that also names recalls is not answered as a warranty-only list', () => {
  for (const records of [[record], []]) {
    const result = run('show appliances that have open recalls and no active warranty', records);
    assert.equal(result.reasonCode, 'WARRANTY_UNAPPLIED_RECALL_CONDITION');
    assert.ok(!result.blocks.some((block) => block.type === 'GROUPED_LIST'), 'no list that could pass as the combined answer');
    assert.ok(result.blocks.some((block) => block.id === 'warranty-no-match' && /recalls/.test(block.title)));
    assert.deepEqual(result.suggestions, ['Show appliances that have open recalls', 'Show appliances with no active warranty']);
  }
});

test('an ordinary warranty question is unaffected', () => {
  assert.notEqual(run('show my warranties').reasonCode, 'WARRANTY_UNAPPLIED_RECALL_CONDITION');
  assert.ok(!WARRANTY_RECALL_CONDITION.test('show warranties expiring soon'));
});
