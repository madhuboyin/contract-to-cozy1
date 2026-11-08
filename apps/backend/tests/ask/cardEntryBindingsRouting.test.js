const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const { CARD_ENTRY_BINDINGS } = require('../../src/services/ask/askCapabilityBindings.ts');

// A capability card launches its entry read with launchContext.operationId. The same words typed or re-sent without it must reach the same operation.
const owner = Object.values(ASK_OPERATION_DEFINITIONS).filter((d) => !d.safetyClass.endsWith('_BOUNDARY') && !d.operationId.startsWith('BUYER_')).map((d) => d.operationId);
const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'p1', eligibleOperationIds: owner });

test('every card entry message routes to its declared operation without a launch context', () => {
  for (const [card, binding] of Object.entries(CARD_ENTRY_BINDINGS)) {
    assert.equal(route(binding.message).operation.operationId, binding.operationId, `${card}: ${binding.message}`);
  }
});
