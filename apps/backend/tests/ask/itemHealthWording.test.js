const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');

// Review screenshot (2026-11-07): "how is my water heater doing? will it be good for next few years" was left to the generic fallback. The repair-or-replace
// answer is the verdict for one item (keep, repair, replace soon); the existing wording covered "keep using", "still good" and "worth repairing" but not a
// health check or a longevity question.

const owner = Object.values(ASK_OPERATION_DEFINITIONS).filter((definition) => !definition.safetyClass.endsWith('_BOUNDARY') && !definition.operationId.startsWith('BUYER_')).map((definition) => definition.operationId);
const decide = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'p1', eligibleOperationIds: owner });
const op = (message) => decide(message).operation.operationId;

test('a health check or longevity question about a named item reaches the repair-or-replace answer', () => {
  for (const message of [
    'how is my water heater doing? will it be good for next few years',
    'how is my furnace doing',
    "how's my roof holding up",
    'how is my dryer looking',
    'will my dishwasher last another 5 years',
    'will the microwave be good for the next few years',
    'how many more years does my fridge have left',
    'how long until my water heater needs replacing',
    'is my washing machine going to last',
    'how is my hvac doing',
  ]) {
    const decision = decide(message);
    assert.equal(decision.stage, 'DETERMINISTIC', message);
    assert.equal(decision.operation.operationId, 'REPLACEMENT_GUIDANCE', message);
  }
});

test('the same words without a named item are not taken by the repair-or-replace answer', () => {
  for (const message of ['how is my mortgage doing', 'how is the weather doing', 'how many years left on my warranty', 'how many years old is my roof', 'how is my kitchen looking', 'will it last', 'how is my dishwasher rated']) {
    assert.notEqual(op(message), 'REPLACEMENT_GUIDANCE', message);
  }
});

test('the existing keep-or-replace wording and the neighbouring routes are unchanged', () => {
  assert.equal(op('is my water heater still good'), 'REPLACEMENT_GUIDANCE');
  assert.equal(op('can i keep using my old dishwasher'), 'REPLACEMENT_GUIDANCE');
  assert.equal(op('do i need a new roof'), 'REPLACEMENT_GUIDANCE');
  assert.equal(op('which of my appliances are most likely to fail'), 'APPLIANCE_FAILURE_RISK');
  assert.equal(op('show me the history of my washing machine repairs'), 'INVENTORY_LOOKUP');
  assert.equal(op('what is the model number of my dishwasher'), 'INVENTORY_LOOKUP');
});
