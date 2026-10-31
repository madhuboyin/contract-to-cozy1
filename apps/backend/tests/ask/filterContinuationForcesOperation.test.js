const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { shouldForceAskOperation } = require('../../src/services/ask/askFollowUpContext.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');

// "Only show claims" / "Only show incidents" are declared chips on the claims list. Typed, the follow-up resolver prepends the prior question, and that
// text can route (locally, or to a clarification) to a different operation than the list the chip belongs to. The chip must still stay on that list.

const decide = (message, overrides = {}) => {
  const routing = resolveAskRoutingCascade(message, { localRoutingEnabled: true });
  return shouldForceAskOperation({
    forcedOperationId: 'INCIDENT_CLAIM_STATUS', routingStage: routing.stage, routingRequiresClarification: routing.requiresClarification,
    routedOperationId: routing.operation.operationId, isFilterRefinement: true, declaredItemAction: false, contextual: false, ...overrides,
  });
};

test('a filter refinement keeps the list it refines when the prior question routes to another operation locally', () => {
  const message = 'Show my insurance claims. Only show incidents';
  assert.equal(resolveAskRoutingCascade(message, { localRoutingEnabled: true }).operation.operationId, 'BUYER_INSURANCE_READINESS', 'the prior text alone would answer a different question');
  assert.equal(decide(message), true);
});

test('a filter refinement is not turned into a clarification', () => {
  assert.equal(shouldForceAskOperation({ forcedOperationId: 'INCIDENT_CLAIM_STATUS', routingStage: 'CLARIFICATION', routingRequiresClarification: true, routedOperationId: 'GROUNDED_GUIDANCE', isFilterRefinement: true, declaredItemAction: false, contextual: false }), true);
});

test('unchanged: safety always wins, the same operation needs no force, and other follow-ups keep the old rule', () => {
  assert.equal(decide('Show my claims. Only show claims', { routingStage: 'SAFETY' }), false);
  assert.equal(decide('Show my incidents', { routedOperationId: 'INCIDENT_CLAIM_STATUS' }), false);
  assert.equal(shouldForceAskOperation({ forcedOperationId: 'MAINTENANCE_TASK_COMPLETE', routingStage: 'LOCAL_CLASSIFIER', routingRequiresClarification: false, routedOperationId: 'PROPERTY_SUMMARY', isFilterRefinement: false, declaredItemAction: false, contextual: false }), false);
  assert.equal(shouldForceAskOperation({ forcedOperationId: 'X', routingStage: 'REMOTE_FALLBACK', routingRequiresClarification: false, routedOperationId: 'GROUNDED_GUIDANCE', isFilterRefinement: false, declaredItemAction: false, contextual: false }), true);
  assert.equal(shouldForceAskOperation({ forcedOperationId: null, routingStage: 'REMOTE_FALLBACK', routingRequiresClarification: false, routedOperationId: 'GROUNDED_GUIDANCE', isFilterRefinement: true, declaredItemAction: false, contextual: false }), false);
});
