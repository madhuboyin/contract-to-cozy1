require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');

const { prisma } = require('../../src/lib/prisma.ts');
const decisionThreadService = require('../../src/services/decisionPlatform/decisionThreadService.ts');
const handler = require('../../src/services/ask/handlers/hvacDecision.handler.ts');
const { OPERATION_SPECIFIC_CONTINUATION_RECIPES } = require('../../src/services/ask/suggestedActions/operationSpecificContinuationRecipes.ts');
const { operationSpecificContinuationProducer } = require('../../src/services/ask/suggestedActions/suggestedNextActionProducers.ts');

const PROPERTY = '11111111-1111-4111-8111-111111111111';
const launch = (entityId) => ({ entityType: 'DECISION_THREAD', entityId, operationId: 'HVAC_DECISION_OUTCOME_VIEW' });

function stub(target, name, fn) {
  const original = target[name];
  target[name] = fn;
  return () => { target[name] = original; };
}

test('a chip launched from a decision thread operates on that thread\'s HVAC system, not on message text', async () => {
  const restore = [
    stub(prisma.decisionThread, 'findFirst', async ({ where }) => (where.id === 'thread-a' ? { primaryEntityId: 'item-a' } : null)),
    // Two HVAC systems, neither named in the message: without focus the handler could not choose and would ask which one.
    stub(prisma.inventoryItem, 'findMany', async () => [{ id: 'item-a', name: 'Upstairs furnace' }, { id: 'item-b', name: 'Basement furnace' }]),
    stub(decisionThreadService, 'selectHvacDecisionThread', async (_property, itemId) => { selected.push(itemId); return { kind: 'NONE' }; }),
  ];
  const selected = [];
  try {
    const result = await handler.hvacDecisionOutcomeViewResult('u1', PROPERTY, 'Show my recorded HVAC decision outcome', launch('thread-a'));
    assert.deepEqual(selected, ['item-a'], 'the focused thread\'s own system is used');
    assert.equal(result.reasonCode, 'HVAC_DECISION_NOT_STARTED');

    selected.length = 0;
    const unfocused = await handler.hvacDecisionOutcomeViewResult('u1', PROPERTY, 'Show my recorded HVAC decision outcome');
    assert.deepEqual(selected, [], 'without a launch thread the message is ambiguous and nothing is guessed');
    assert.equal(unfocused.status, 'NEEDS_ENTITY');
  } finally { restore.forEach((fn) => fn()); }
});

test('an inactive or foreign launch thread never falls back to a different decision', async () => {
  const restore = [
    stub(prisma.decisionThread, 'findFirst', async () => null),
    stub(prisma.inventoryItem, 'findMany', async () => [{ id: 'item-a', name: 'Furnace' }]),
    stub(decisionThreadService, 'selectHvacDecisionThread', async () => { throw new Error('must not select a thread'); }),
  ];
  try {
    for (const run of [
      () => handler.hvacDecisionOutcomeViewResult('u1', PROPERTY, 'outcome', launch('gone')),
      () => handler.hvacDecisionScenarioResult('u1', PROPERTY, 'quote', launch('gone')),
    ]) {
      const result = await run();
      assert.equal(result.status, 'NOT_APPLICABLE');
      assert.equal(result.reasonCode, 'HVAC_DECISION_SUBJECT_NOT_ACTIVE');
    }
  } finally { restore.forEach((fn) => fn()); }
});

test('thread-bound HVAC recipes are nominated only when exactly one HVAC decision is active', async () => {
  const run = async (hvacThreads) => (await operationSpecificContinuationProducer.nominate({
    sourceOperationId: 'HVAC_DECISION_START', propertyId: PROPERTY,
    loadOperationSpecificContinuationState: async () => ({}),
    loadActivePlanState: async () => ({ sellHoldRentActive: false, hvacThreads, guidanceJourneys: [] }),
  })).map((candidate) => candidate.operationId);
  const thread = (id) => ({ id, contextVersion: 'v' });
  assert.deepEqual(await run([thread('t1')]), ['HVAC_DECISION_CONTINUE', 'HOME_ACTIONS']);
  assert.deepEqual(await run([thread('t1'), thread('t2')]), ['HOME_ACTIONS'], 'several active decisions: recency is not a tie-breaker');
  assert.deepEqual(await run([]), ['HOME_ACTIONS']);
});

test('no recipe offers the HVAC scenario chip, which needs a quoted amount a compact chip cannot supply', () => {
  for (const recipes of Object.values(OPERATION_SPECIFIC_CONTINUATION_RECIPES)) {
    assert.ok(!recipes.some((recipe) => recipe.operationId === 'HVAC_DECISION_SCENARIO'));
  }
});
