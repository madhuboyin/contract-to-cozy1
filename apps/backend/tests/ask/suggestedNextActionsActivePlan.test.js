require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');
const { activePlanCandidates } = require('../../src/services/ask/suggestedActions/activePlanCandidates.ts');

test('a canonical active decision thread becomes a continuation action', async () => {
  const candidates = await activePlanCandidates({ propertyId: 'p1' }, async () => ({ sellHoldRentActive: true, hvacThreads: [], guidanceJourneys: [] }));
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].operationId, 'SELL_HOLD_RENT_ANALYSIS');
  assert.equal(candidates[0].outcomeKey, 'CONTINUE_SELL_HOLD_RENT_PLAN');
  assert.equal(candidates[0].slotClass, 'CONTINUE_WORK');
  assert.equal(candidates[0].signals.activeGoalMatch, true);
  assert.equal(candidates[0].entityContext.entityId, null, 'the analysis is property-scoped; a thread id is not target identity');
});

test('ambiguous or absent decision-thread state never guesses a continuation target', async () => {
  assert.deepEqual(await activePlanCandidates({ propertyId: 'p1' }, async () => ({ sellHoldRentActive: false, hvacThreads: [], guidanceJourneys: [] })), []);
});

test('active HVAC threads and guidance journeys retain exact typed launch identity', async () => {
  const candidates = await activePlanCandidates({ propertyId: 'p1' }, async () => ({
    sellHoldRentActive: false,
    hvacThreads: [{ id: 'thread-1', contextVersion: 'thread-v1' }],
    guidanceJourneys: [{ id: 'journey-1', contextVersion: 'journey-v1' }],
  }));
  assert.deepEqual(candidates.map((candidate) => [candidate.operationId, candidate.entityContext.entityType, candidate.entityContext.entityId]), [
    ['HVAC_DECISION_CONTINUE', 'DECISION_THREAD', 'thread-1'],
    ['GUIDANCE_JOURNEY_CONTINUE', 'GUIDANCE_JOURNEY', 'journey-1'],
  ]);
});
