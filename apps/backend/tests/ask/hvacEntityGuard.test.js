const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { messageNamesOnlyNonHvacItem } = require('../../src/services/ask/askOperationRegistry.ts');

const decide = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'p1' });
const route = (message) => decide(message).operation?.operationId;

// Routing sweep (2026-11-07): "can i continue to use my microwave…" scored HVAC_DECISION_CONTINUE (the word "continue"), and the handler answered
// about "HVAC Furnace". "Water heater" also matched the HVAC keyword through the bare word "heater", although the module's own comment says every
// other item keeps routing to REPLACEMENT_GUIDANCE.

test('keep-or-replace wording about any named item reaches the repair-or-replace operation, not an HVAC decision', () => {
  for (const message of [
    'can i continue to use my microwave or should i need to buy new one',
    'is my microwave good enough or do i need to replace it',
    'can i continue to use my fridge',
    'can I keep using my old dishwasher',
    'is my dishwasher worth repairing',
    'how much longer will my fridge last',
    'is my water heater still good',
    'should I replace my water heater',
    'do I need a new roof',
    'my oven is old should i get a new one',
  ]) assert.equal(route(message), 'REPLACEMENT_GUIDANCE', message);
});

test('a water heater is not an HVAC system', () => {
  assert.notEqual(route('should I replace my water heater'), 'HVAC_DECISION_START');
  assert.notEqual(route('my water heater quote is 2400 compare'), 'HVAC_DECISION_SCENARIO');
  assert.notEqual(route('new quote for the water heater compare'), 'HVAC_DECISION_SCENARIO');
});

test('real HVAC wording still reaches the HVAC decision operations', () => {
  assert.equal(route('should i replace my furnace'), 'HVAC_DECISION_START');
  assert.equal(route('should I repair or replace my heat pump'), 'HVAC_DECISION_START');
  assert.equal(route('update on my furnace decision'), 'HVAC_DECISION_CONTINUE');
  assert.equal(route('continue my furnace decision'), 'HVAC_DECISION_CONTINUE');
  assert.equal(route('report the outcome of my furnace replacement'), 'HVAC_DECISION_OUTCOME_VIEW');
  // Natural wording about an HVAC item goes to the shared operation, which hands an HVAC item to the HVAC decision itself.
  assert.equal(route('can i keep using my heat pump'), 'REPLACEMENT_GUIDANCE');
  assert.equal(route('is my heat pump worth fixing'), 'REPLACEMENT_GUIDANCE');
});

test('only a message that names a non-HVAC item and no HVAC system is guarded', () => {
  for (const message of ['how old is my water heater', 'is my microwave ok', 'what about my fridge', 'the dishwasher']) assert.equal(messageNamesOnlyNonHvacItem(message), true, message);
  for (const message of ['my furnace and my dishwasher', 'heat pump quote', 'the hvac decision', 'is my heater ok', 'something unrelated']) assert.equal(messageNamesOnlyNonHvacItem(message), false, message);
});

test('no HVAC decision operation is even a candidate when the message names only another item', () => {
  for (const message of ['how old is my water heater', 'continue with my dishwasher plan', 'what happened with my fridge decision', 'update on my dryer']) {
    const decision = decide(message);
    assert.ok(!decision.operation.operationId.startsWith('HVAC_'), `${message} -> ${decision.operation.operationId}`);
    assert.deepEqual(decision.candidates.filter((candidate) => candidate.operationId.startsWith('HVAC_')), [], message);
  }
});
