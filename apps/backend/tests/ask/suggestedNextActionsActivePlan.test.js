require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { activePlanCandidates } = require('../../src/services/ask/suggestedActions/activePlanCandidates.ts');

test('a canonical active decision thread becomes a continuation action', async () => {
  const candidates = await activePlanCandidates({ propertyId: 'p1' }, async () => ({ sellHoldRentActive: true }));
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].operationId, 'SELL_HOLD_RENT_ANALYSIS');
  assert.equal(candidates[0].outcomeKey, 'CONTINUE_SELL_HOLD_RENT_PLAN');
  assert.equal(candidates[0].slotClass, 'CONTINUE_WORK');
  assert.equal(candidates[0].signals.activeGoalMatch, true);
  assert.equal(candidates[0].entityContext.entityId, null, 'the analysis is property-scoped; a thread id is not target identity');
});

test('ambiguous or absent decision-thread state never guesses a continuation target', async () => {
  assert.deepEqual(await activePlanCandidates({ propertyId: 'p1' }, async () => ({ sellHoldRentActive: false })), []);
});
