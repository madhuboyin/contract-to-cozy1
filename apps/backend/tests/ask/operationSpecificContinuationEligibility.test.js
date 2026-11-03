require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');

const { ASK_OPERATION_DEFINITIONS, getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
const { requiredAskTargetEntity } = require('../../src/services/ask/askEntityResolution.ts');
const { suggestionKey } = require('../../src/services/ask/askSuggestionPolicy.ts');
const { OPERATION_SPECIFIC_CONTINUATION_RECIPES } = require('../../src/services/ask/suggestedActions/operationSpecificContinuationRecipes.ts');
const { operationSpecificContinuationCandidates } = require('../../src/services/ask/suggestedActions/operationSpecificContinuationCandidates.ts');
const { activePlanCandidates } = require('../../src/services/ask/suggestedActions/activePlanCandidates.ts');
const { evaluateSuggestedNextActionEligibility } = require('../../src/services/ask/suggestedActions/suggestedNextActionEligibility.ts');
const registry = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');

const PROPERTY_ID = '11111111-1111-4111-8111-111111111111';
const THREAD = { id: 'thread-1', contextVersion: '2026-01-01T00:00:00.000Z' };

/**
 * Eligibility context for a fully-available operation set (owner, healthy, audience-applicable) with the given validated entities.
 * The point of this suite is the ENTITY rules: whatever a producer nominates must be something the gate can ever accept.
 */
function eligibilityContext({ entities = new Map(), validatedEntityTypes = new Set() } = {}) {
  return {
    mode: 'NORMAL',
    sourcePropertyId: PROPERTY_ID,
    operationAvailability: new Map(Object.keys(ASK_OPERATION_DEFINITIONS).map((id) => [id, null])),
    operationRequiresProperty: (id) => getAskOperationDefinition(id).requiresProperty,
    operationTargetEntityType: (id) => requiredAskTargetEntity(id),
    entities,
    validatedEntityTypes,
    pendingInteractionActive: false,
    completedSemanticKeyHashes: new Set(),
    askedMessageKeys: new Set(),
    messageKey: suggestionKey,
    currentOutcomeKeyHashes: new Set(),
  };
}

const threadContext = () => eligibilityContext({
  entities: new Map([[`DECISION_THREAD:${THREAD.id}`, { exists: true, propertyId: PROPERTY_ID, currentContextVersion: THREAD.contextVersion }]]),
  validatedEntityTypes: new Set(['DECISION_THREAD']),
});

test('every operation-specific recipe is eligible on its own once its real preconditions hold', () => {
  const ctx = threadContext();
  const failures = [];
  let checked = 0;
  for (const sourceOperationId of Object.keys(OPERATION_SPECIFIC_CONTINUATION_RECIPES)) {
    for (const candidate of operationSpecificContinuationCandidates(sourceOperationId, PROPERTY_ID, undefined, THREAD)) {
      checked += 1;
      const verdict = evaluateSuggestedNextActionEligibility(candidate, ctx);
      if (verdict.state !== 'ELIGIBLE') failures.push(`${sourceOperationId} -> ${candidate.operationId}:${candidate.outcomeKey} ${verdict.state} ${verdict.reasonCodes.join(',')}`);
    }
  }
  assert.ok(checked > 200, `expected the full recipe set to be evaluated, got ${checked}`);
  assert.deepEqual(failures, []);
});

test('thread-bound HVAC recipes carry the active thread and are dropped when there is none', () => {
  const withThread = operationSpecificContinuationCandidates('HVAC_DECISION_START', PROPERTY_ID, undefined, THREAD);
  const cont = withThread.find((candidate) => candidate.operationId === 'HVAC_DECISION_CONTINUE');
  assert.deepEqual(cont.entityContext, { propertyId: PROPERTY_ID, entityType: 'DECISION_THREAD', entityId: THREAD.id, contextVersion: THREAD.contextVersion });

  const without = operationSpecificContinuationCandidates('HVAC_DECISION_START', PROPERTY_ID, undefined, null);
  assert.deepEqual(without.map((candidate) => candidate.operationId), ['HOME_ACTIONS']);
});

test('a stale thread version is still rejected (supplied entities remain fully validated)', () => {
  const ctx = eligibilityContext({
    entities: new Map([[`DECISION_THREAD:${THREAD.id}`, { exists: true, propertyId: PROPERTY_ID, currentContextVersion: '2026-02-02T00:00:00.000Z' }]]),
    validatedEntityTypes: new Set(['DECISION_THREAD']),
  });
  const candidate = operationSpecificContinuationCandidates('HVAC_DECISION_START', PROPERTY_ID, undefined, THREAD).find((c) => c.operationId === 'HVAC_DECISION_CONTINUE');
  const verdict = evaluateSuggestedNextActionEligibility(candidate, ctx);
  assert.notEqual(verdict.state, 'ELIGIBLE');
  assert.deepEqual(verdict.reasonCodes, ['CONTEXT_VERSION_STALE']);
});

test('property-wide outcomes are an explicit reviewed allowlist; other entity-bound operations still require an entity', () => {
  assert.deepEqual([...registry.PROPERTY_WIDE_OUTCOMES].sort(), [
    'INVENTORY_LOOKUP:REVIEW_HOME_INVENTORY', 'INVENTORY_LOOKUP:REVIEW_RECOMMENDED_CAPABILITY', 'QUOTE_COMPARISON_REVIEW:REVIEW_QUOTES', 'REPLACEMENT_GUIDANCE:REVIEW_REPLACEMENT',
  ]);
  const itemBound = {
    source: 'OPERATION_RESULT', sourceOperationId: 'WARRANTY_LOOKUP', label: 'x', message: 'Show this item', operationId: 'INVENTORY_LOOKUP',
    interactionType: 'CONVERSATION_CONTINUE', outcomeKey: 'REVIEW_CURRENT_RECORD',
    entityContext: { propertyId: PROPERTY_ID, entityType: null, entityId: null, contextVersion: null },
  };
  const verdict = evaluateSuggestedNextActionEligibility(itemBound, eligibilityContext());
  assert.deepEqual(verdict.reasonCodes, ['ENTITY_REQUIRED']);
  assert.deepEqual(registry.validateSuggestedNextActionRegistry(), []);
});

test('active HVAC decisions and guidance journeys survive the freshness matrix', async () => {
  const candidates = await activePlanCandidates({ propertyId: PROPERTY_ID }, async () => ({
    sellHoldRentActive: false,
    hvacThreads: [THREAD],
    guidanceJourneys: [{ id: 'journey-1', contextVersion: '2026-01-01T00:00:00.000Z' }],
  }));
  assert.equal(candidates.length, 2);
  const ctx = eligibilityContext({
    entities: new Map([
      [`DECISION_THREAD:${THREAD.id}`, { exists: true, propertyId: PROPERTY_ID, currentContextVersion: THREAD.contextVersion }],
      ['GUIDANCE_JOURNEY:journey-1', { exists: true, propertyId: PROPERTY_ID, currentContextVersion: '2026-01-01T00:00:00.000Z' }],
    ]),
    validatedEntityTypes: new Set(['DECISION_THREAD', 'GUIDANCE_JOURNEY']),
  });
  for (const candidate of candidates) assert.equal(evaluateSuggestedNextActionEligibility(candidate, ctx).state, 'ELIGIBLE', candidate.operationId);
  assert.ok('DECISION_THREAD' in registry.DOMAIN_FRESHNESS_MATRIX && 'GUIDANCE_JOURNEY' in registry.DOMAIN_FRESHNESS_MATRIX);
});

test('generic capability recommendations: the inventory list is eligible, thread-specific operations are not converted', () => {
  const { capabilityRecommendationCandidates } = require('../../src/services/ask/suggestedActions/capabilityRecommendationCandidates.ts');
  const capability = (id, operationId) => ({ id, label: id, inlineLaunch: { operationId, message: `Open ${id}` } });
  const result = { status: 'ANSWERED', blocks: [{ type: 'CAPABILITY_LIST', capabilities: [capability('inventory', 'INVENTORY_LOOKUP'), capability('outcome', 'HVAC_DECISION_OUTCOME_VIEW'), capability('summary', 'PROPERTY_SUMMARY')] }] };
  const candidates = capabilityRecommendationCandidates(result, PROPERTY_ID);
  assert.deepEqual(candidates.map((candidate) => candidate.operationId), ['INVENTORY_LOOKUP', 'PROPERTY_SUMMARY']);
  for (const candidate of candidates) assert.equal(evaluateSuggestedNextActionEligibility(candidate, eligibilityContext()).state, 'ELIGIBLE', candidate.operationId);
  // Every safe capability operation, entity-bound or not, must be able to pass the entity rule with a null entity.
  for (const operationId of Object.keys(ASK_OPERATION_DEFINITIONS)) {
    if (!registry.isSafeCapabilityRecommendationOperation(operationId)) continue;
    const candidate = capabilityRecommendationCandidates({ status: 'ANSWERED', blocks: [{ type: 'CAPABILITY_LIST', capabilities: [capability('x', operationId)] }] }, PROPERTY_ID)[0];
    assert.equal(evaluateSuggestedNextActionEligibility(candidate, eligibilityContext()).state, 'ELIGIBLE', operationId);
  }
});
