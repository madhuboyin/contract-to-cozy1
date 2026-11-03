require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');

const { ASK_OPERATION_DEFINITIONS, getAskOperationDefinition } = require('../../src/services/ask/askOperationRegistry.ts');
const { requiredAskTargetEntity } = require('../../src/services/ask/askEntityResolution.ts');
const { suggestionKey } = require('../../src/services/ask/askSuggestionPolicy.ts');
const registry = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const { COOLDOWN_MS } = require('../../src/services/ask/suggestedActions/suggestedNextActionExactFourRegistry.ts');
const { suggestedNextActionSemanticKeyHash } = require('../../src/services/ask/suggestedActions/suggestedNextActionIdentity.ts');
const { candidateIdentityFields } = require('../../src/services/ask/suggestedActions/suggestedNextActionCandidate.ts');
const { operationSpecificContinuationCandidates } = require('../../src/services/ask/suggestedActions/operationSpecificContinuationCandidates.ts');
const { evaluateSuggestedNextActionEligibility } = require('../../src/services/ask/suggestedActions/suggestedNextActionEligibility.ts');

const PROPERTY = '11111111-1111-4111-8111-111111111111';

test('the recurring hub allowlist is exactly the reviewed set, separate from REPEATABLE_OUTCOMES, and passes registry validation', () => {
  assert.deepEqual([...registry.RECURRING_HUB_OUTCOMES].sort(), [
    'BUYER_PLAN_STATUS:REVIEW_BUYER_PLAN', 'DIY_PROJECTS:REVIEW_DIY_PROJECTS', 'DOCUMENT_LOOKUP:REVIEW_DOCUMENTS', 'GUIDANCE_JOURNEYS_LIST:REVIEW_GUIDANCE_JOURNEYS',
    'HOME_ACTIONS:REVIEW_HOME_ACTIONS', 'HOME_ACTIONS:REVIEW_URGENT_HOME_ACTIONS', 'HOME_EVENT_RADAR_FEED:REVIEW_RADAR_FEED', 'HOME_STATUS_BOARD:REVIEW_STATUS_BOARD',
    'HOME_TIMELINE_EVENTS:REVIEW_HOME_TIMELINE', 'INSPECTION_FINDINGS:REVIEW_INSPECTION_FINDINGS', 'INVENTORY_LOOKUP:REVIEW_HOME_INVENTORY',
    'MAINTENANCE_STATUS:REVIEW_MAINTENANCE_STATUS', 'OWNERSHIP_COSTS:REVIEW_OWNERSHIP_COSTS', 'WARRANTY_LOOKUP:REVIEW_WARRANTIES', 'WORK_OVERVIEW:REVIEW_WORK',
  ]);
  for (const key of registry.RECURRING_HUB_OUTCOMES) assert.ok(!registry.REPEATABLE_OUTCOMES.has(key), `${key} must not be in the cooldown-free repeatable set`);
  assert.deepEqual(registry.validateSuggestedNextActionRegistry(), []);
  assert.equal(COOLDOWN_MS.recurringHubReoffer, 24 * 3600 * 1000);
});

test('every recurring hub is a registered, read-only, property-scoped, non-boundary outcome; commands, decisions and guided steps are never hubs', () => {
  for (const key of registry.RECURRING_HUB_OUTCOMES) {
    const [operationId, outcomeKey] = key.split(':');
    const definition = ASK_OPERATION_DEFINITIONS[operationId];
    assert.ok(registry.isRegisteredOutcome(operationId, outcomeKey), key);
    assert.ok(['RECORD_QUERY', 'STATUS_SUMMARY'].includes(definition.family), `${key}: ${definition.family}`);
    assert.equal(definition.requiresProperty, true, key);
    assert.ok(['STANDARD', 'MATERIAL_DECISION'].includes(definition.safetyClass), key);
    assert.ok(!requiredAskTargetEntity(operationId) || registry.isPropertyWideOutcome(operationId, outcomeKey), `${key}: record-bound`);
  }
  for (const [operationId, outcomes] of Object.entries(registry.SUGGESTED_ACTION_OUTCOMES)) {
    const family = ASK_OPERATION_DEFINITIONS[operationId]?.family;
    if (['COMMAND', 'MONITOR', 'DECISION_ANALYSIS', 'WORKFLOW_GUIDANCE'].includes(family)) {
      for (const outcomeKey of outcomes) assert.equal(registry.isRecurringHubOutcome(operationId, outcomeKey), false, `${operationId}:${outcomeKey} must stay one-shot`);
    }
  }
});

test('the registry validator rejects a hub that is a command, unregistered, record-bound, or also repeatable', () => {
  const original = new Set(registry.RECURRING_HUB_OUTCOMES);
  try {
    for (const bad of ['MAINTENANCE_TASK_COMPLETE:COMPLETE_TASK', 'HOME_ACTIONS:NOT_A_REAL_OUTCOME', 'INVENTORY_LOOKUP:REVIEW_CURRENT_RECORD', 'CAPITAL_RESERVE_PLAN:REVIEW_CAPITAL_OUTLOOK']) {
      registry.RECURRING_HUB_OUTCOMES.add(bad);
      assert.ok(registry.validateSuggestedNextActionRegistry().some((problem) => problem.startsWith('recurring hub:')), bad);
      registry.RECURRING_HUB_OUTCOMES.delete(bad);
    }
  } finally {
    for (const key of [...registry.RECURRING_HUB_OUTCOMES]) if (!original.has(key)) registry.RECURRING_HUB_OUTCOMES.delete(key);
  }
});

test('completing a hub this session does not retire it (the durable window governs); a one-shot outcome stays retired', () => {
  const ctx = (completed) => ({
    mode: 'NORMAL', sourcePropertyId: PROPERTY,
    operationAvailability: new Map(Object.keys(ASK_OPERATION_DEFINITIONS).map((id) => [id, null])),
    operationRequiresProperty: (id) => getAskOperationDefinition(id).requiresProperty, operationTargetEntityType: (id) => requiredAskTargetEntity(id),
    entities: new Map(), validatedEntityTypes: new Set(), pendingInteractionActive: false,
    completedSemanticKeyHashes: new Set(completed), askedMessageKeys: new Set(), messageKey: suggestionKey, currentOutcomeKeyHashes: new Set(),
  });
  const hub = operationSpecificContinuationCandidates('MAINTENANCE_BUDGET_FORECAST', PROPERTY).find((c) => c.operationId === 'MAINTENANCE_STATUS');
  const oneShot = operationSpecificContinuationCandidates('MAINTENANCE_BUDGET_FORECAST', PROPERTY).find((c) => c.operationId === 'MAINTENANCE_FORECAST');
  const hash = (c) => suggestedNextActionSemanticKeyHash(candidateIdentityFields(c));
  assert.equal(evaluateSuggestedNextActionEligibility(hub, ctx([hash(hub)])).state, 'ELIGIBLE');
  assert.deepEqual(evaluateSuggestedNextActionEligibility(oneShot, ctx([hash(oneShot)])).reasonCodes, ['EQUIVALENT_COMPLETED']);
});
