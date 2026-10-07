require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { urgentWorkCandidates } = require('../../src/services/ask/suggestedActions/urgentWorkCandidates.ts');

test('urgent-work producer uses only the canonical NOW count and opens the governed Home Actions read', async () => {
  const seen = [];
  const candidates = await urgentWorkCandidates(
    { userId: 'user-1', propertyId: 'property-1' },
    async (input) => { seen.push(input); return { nowCount: 2 }; },
  );
  assert.deepEqual(seen, [{ userId: 'user-1', propertyId: 'property-1' }]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].label, 'Review 2 urgent home actions');
  assert.equal(candidates[0].operationId, 'HOME_ACTIONS');
  assert.equal(candidates[0].outcomeKey, 'REVIEW_URGENT_HOME_ACTIONS');
  assert.equal(candidates[0].slotClass, 'URGENT_WORK');
  assert.equal(candidates[0].interactionType, 'CONVERSATION_CONTINUE');
  assert.equal(candidates[0].entityContext.entityId, null);
});

test('urgent-work producer stays silent when canonical Home Actions has no NOW work', async () => {
  assert.deepEqual(await urgentWorkCandidates(
    { userId: 'user-1', propertyId: 'property-1' }, async () => ({ nowCount: 0 }),
  ), []);
});
