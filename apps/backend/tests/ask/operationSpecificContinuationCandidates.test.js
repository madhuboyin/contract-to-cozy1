const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { ASK_OPERATION_DEFINITIONS } = require('../../src/services/ask/askOperationRegistry.ts');
const {
  OPERATION_SPECIFIC_CONTINUATION_RECIPES,
} = require('../../src/services/ask/suggestedActions/operationSpecificContinuationRecipes.ts');
const {
  OPERATION_SPECIFIC_CONTINUATION_PRODUCER_ID,
  operationSpecificContinuationCandidates,
} = require('../../src/services/ask/suggestedActions/operationSpecificContinuationCandidates.ts');
const {
  isRegisteredOutcome,
} = require('../../src/services/ask/suggestedActions/suggestedNextActionRegistry.ts');
const {
  currentOperationOwnsOutcome,
} = require('../../src/services/ask/suggestedActions/suggestedNextActionExactFourRegistry.ts');
const {
  SUGGESTED_NEXT_ACTION_PRODUCERS,
  operationSpecificContinuationProducer,
} = require('../../src/services/ask/suggestedActions/suggestedNextActionProducers.ts');

const PROPERTY_ID = '11111111-1111-4111-8111-111111111111';

test('every continuation recipe has a registered typed target and current-result ownership', () => {
  for (const [sourceOperationId, recipes] of Object.entries(OPERATION_SPECIFIC_CONTINUATION_RECIPES)) {
    assert.ok(ASK_OPERATION_DEFINITIONS[sourceOperationId], `${sourceOperationId}: source operation is not registered`);
    assert.ok(recipes.length >= 1 && recipes.length <= 3, `${sourceOperationId}: expected one to three focused continuations`);
    for (const recipe of recipes) {
      assert.ok(ASK_OPERATION_DEFINITIONS[recipe.operationId], `${sourceOperationId}: ${recipe.operationId} target is not registered`);
      assert.notEqual(recipe.operationId, sourceOperationId, `${sourceOperationId}: continuation must advance beyond the same operation`);
      assert.equal(isRegisteredOutcome(recipe.operationId, recipe.outcomeKey), true, `${sourceOperationId}: unregistered outcome ${recipe.operationId}:${recipe.outcomeKey}`);
      assert.equal(currentOperationOwnsOutcome(sourceOperationId, recipe), true, `${sourceOperationId}: missing ownership relationship for ${recipe.operationId}:${recipe.outcomeKey}`);
    }
  }
});

test('recipe candidates are property-scoped governed continuations', () => {
  for (const sourceOperationId of Object.keys(OPERATION_SPECIFIC_CONTINUATION_RECIPES)) {
    const candidates = operationSpecificContinuationCandidates(sourceOperationId, PROPERTY_ID);
    assert.equal(candidates.length, OPERATION_SPECIFIC_CONTINUATION_RECIPES[sourceOperationId].length);
    for (const candidate of candidates) {
      assert.equal(candidate.source, 'OPERATION_RESULT');
      assert.equal(candidate.sourceOperationId, sourceOperationId);
      assert.equal(candidate.interactionType, 'CONVERSATION_CONTINUE');
      assert.equal(candidate.tier, 'CONTINUE');
      assert.equal(candidate.slotClass, 'CONTINUE_WORK');
      assert.equal(candidate.entityContext.propertyId, PROPERTY_ID);
      assert.equal(candidate.signals.currentResultOwnership, true);
    }
  }
  assert.deepEqual(operationSpecificContinuationCandidates(null, PROPERTY_ID), []);
  assert.deepEqual(operationSpecificContinuationCandidates('MAINTENANCE_STATUS', null), []);
  assert.deepEqual(operationSpecificContinuationCandidates('PROPERTY_SUMMARY', PROPERTY_ID), []);
});

test('the operation-specific producer is registered as an essential result producer', () => {
  assert.equal(operationSpecificContinuationProducer.id, OPERATION_SPECIFIC_CONTINUATION_PRODUCER_ID);
  assert.equal(operationSpecificContinuationProducer.essential, true);
  assert.equal(operationSpecificContinuationProducer.source, 'OPERATION_RESULT');
  assert.ok(SUGGESTED_NEXT_ACTION_PRODUCERS.includes(operationSpecificContinuationProducer));
});

test('representative domain actions remain operation-specific', () => {
  assert.deepEqual(
    operationSpecificContinuationCandidates('MAINTENANCE_STATUS', PROPERTY_ID).map(({ label, operationId }) => ({ label, operationId })),
    [
      { label: 'See what may be coming up', operationId: 'MAINTENANCE_FORECAST' },
      { label: 'Review all home priorities', operationId: 'HOME_ACTIONS' },
    ],
  );
  assert.deepEqual(
    operationSpecificContinuationCandidates('INVENTORY_LOOKUP', PROPERTY_ID).map(({ label, operationId }) => ({ label, operationId })),
    [
      { label: 'Review recorded warranties', operationId: 'WARRANTY_LOOKUP' },
      { label: 'Review home documents', operationId: 'DOCUMENT_LOOKUP' },
      { label: 'Check recorded recalls', operationId: 'RECALL_REVIEW' },
    ],
  );
  assert.equal(operationSpecificContinuationCandidates('INCIDENT_CLAIM_STATUS', PROPERTY_ID)[0].operationId, 'INCIDENT_CONTINUATION');
});

test('completed command receipts return to their owning domain reads', () => {
  const expectedTargets = {
    MAINTENANCE_TASK_CREATE: ['MAINTENANCE_STATUS', 'MAINTENANCE_FORECAST'],
    MAINTENANCE_TASK_COMPLETE: ['MAINTENANCE_STATUS', 'HOME_ACTIONS'],
    DOCUMENT_PROMOTION_CONFIRM: ['DOCUMENT_PROMOTION_REVIEW', 'DOCUMENT_LOOKUP'],
    RECALL_MATCH_UPDATE: ['RECALL_REVIEW', 'HOME_ACTIONS'],
    INSPECTION_FINDING_UPDATE: ['INSPECTION_FINDINGS', 'HOME_ACTIONS'],
    INSPECTION_FINDING_DECISION_COMMAND: ['INSPECTION_FINDINGS', 'INSPECTION_REPORTS'],
    INSPECTION_REPORT_COMMAND: ['INSPECTION_REPORTS', 'INSPECTION_FINDINGS'],
    CLAIM_FILE: ['INCIDENT_CLAIM_STATUS', 'CLAIM_CHECKLIST_VIEW'],
    CLAIM_TRANSITION: ['INCIDENT_CLAIM_STATUS', 'CLAIM_CHECKLIST_VIEW'],
    CLAIM_ACTIVITY_COMMAND: ['INCIDENT_CLAIM_STATUS', 'CLAIM_CHECKLIST_VIEW'],
  };
  for (const [operationId, targets] of Object.entries(expectedTargets)) {
    assert.deepEqual(
      operationSpecificContinuationCandidates(operationId, PROPERTY_ID).map((candidate) => candidate.operationId),
      targets,
      operationId,
    );
  }
});

test('secondary domain reads continue into related status and workflow surfaces', () => {
  const expectedTargets = {
    MAINTENANCE_BUDGET_FORECAST: ['MAINTENANCE_FORECAST', 'MAINTENANCE_STATUS'],
    MAINTENANCE_TEMPLATES_BROWSE: ['MAINTENANCE_STATUS', 'MAINTENANCE_FORECAST'],
    INSPECTION_NEGOTIATION_PACKAGE: ['INSPECTION_FINDINGS', 'INSPECTION_REPORTS'],
    INSPECTION_REPORTS: ['INSPECTION_FINDINGS', 'DOCUMENT_LOOKUP'],
    INSPECTION_REPORT_FINDINGS: ['INSPECTION_REPORTS', 'INSPECTION_FINDINGS'],
    INSPECTION_REPORT_COMPARE: ['INSPECTION_REPORTS', 'INSPECTION_FINDINGS'],
    INCIDENT_CONTINUATION: ['INCIDENT_CLAIM_STATUS', 'CLAIM_CHECKLIST_VIEW'],
    CLAIM_CHECKLIST_VIEW: ['INCIDENT_CLAIM_STATUS', 'INCIDENT_CONTINUATION'],
  };
  for (const [operationId, targets] of Object.entries(expectedTargets)) {
    assert.deepEqual(
      operationSpecificContinuationCandidates(operationId, PROPERTY_ID).map((candidate) => candidate.operationId),
      targets,
      operationId,
    );
  }
});
