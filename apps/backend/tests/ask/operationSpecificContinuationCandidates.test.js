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
  assert.deepEqual(operationSpecificContinuationCandidates('APPLIANCE_FAILURE_RISK', PROPERTY_ID), []);
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

test('projects, DIY, plants, habits, seasonal, renovation, and permit operations all have tailored continuations', () => {
  const migratedOperations = [
    'SEASONAL_CHECKLIST_SETUP', 'SEASONAL_ITEM_COMMAND',
    'PROJECT_TRACKER_PROJECTS', 'PROJECT_TRACKER_CREATE', 'PROJECT_TRACKER_COMMAND',
    'DIY_PROJECT_GUIDE', 'DIY_STEP_UPDATE', 'DIY_PROJECT_COMPLETE', 'DIY_PROJECT_ABANDON', 'DIY_PROJECT_START',
    'DIY_COMPLETION_RECOVER', 'DIY_PROJECT_NOTE_COMMAND', 'DIY_SKILL_PROFILE_COMMAND',
    'PLANT_CARE_OUTLOOK', 'ROOM_PLANT_RECOMMENDATIONS', 'HOME_PLANT_ADD',
    'HOME_HABIT_UPDATE', 'HOME_HABIT_PREFERENCES_COMMAND', 'HOME_HABITS_GENERATE',
    'RENOVATION_PERMIT_READINESS', 'RENOVATION_CASE_START', 'RENOVATION_READINESS_COMMAND',
    'PERMIT_TRACKER_COMMAND', 'PERMIT_TRACKER_STATUS',
  ];
  for (const operationId of migratedOperations) {
    const candidates = operationSpecificContinuationCandidates(operationId, PROPERTY_ID);
    assert.ok(candidates.length >= 1, `${operationId}: missing tailored continuation`);
    assert.ok(candidates.every((candidate) => candidate.sourceOperationId === operationId), operationId);
  }
});

test('general financial reads and receipts all have tailored continuations', () => {
  const migratedOperations = [
    'COVERAGE_GAPS', 'COVERAGE_COMPARISON_STATUS', 'COVERAGE_REVIEW_STATUS', 'COVERAGE_COMMAND',
    'SAVINGS_OPPORTUNITIES', 'SAVINGS_BENEFIT_COMMAND', 'OWNERSHIP_COSTS', 'OWNERSHIP_COST_COMMAND',
    'FINANCING_OVERVIEW', 'FINANCING_PROFILE_COMMAND', 'REFINANCE_ANALYSIS', 'REFINANCE_RATE_MONITOR',
    'CAPITAL_RESERVE_PLAN', 'CAPITAL_TIMELINE_COMMAND',
    'PROPERTY_TAX_APPEAL_READINESS', 'PROPERTY_TAX_APPEAL_COMMAND', 'PROPERTY_TAX_COMPARABLE_COMMAND',
    'SERVICE_PRICE_CHECKS', 'SERVICE_PRICE_CHECK_RUN',
    'QUOTE_COMPARISON_CREATE', 'QUOTE_COMPARISON_REVIEW', 'QUOTE_COMPARISON_COMMAND',
    'PRICE_FINALIZATIONS_LIST', 'PRICE_FINALIZATION_COMMAND',
  ];
  for (const operationId of migratedOperations) {
    const candidates = operationSpecificContinuationCandidates(operationId, PROPERTY_ID);
    assert.ok(candidates.length >= 1, `${operationId}: missing tailored continuation`);
    assert.ok(candidates.every((candidate) => candidate.sourceOperationId === operationId), operationId);
  }
});

test('guidance, seller, negotiation, major-event, and HVAC operations all have tailored continuations', () => {
  const migratedOperations = [
    'REPLACEMENT_GUIDANCE',
    'GUIDANCE_JOURNEYS_LIST', 'GUIDANCE_JOURNEY_CONTINUE', 'GUIDANCE_STEP_SKIP', 'GUIDANCE_JOURNEY_DISMISS', 'GUIDANCE_JOURNEY_CREATE',
    'NEGOTIATION_SHIELD_CASES', 'NEGOTIATION_SHIELD_CASE_START', 'NEGOTIATION_SHIELD_BUYER_COMMAND',
    'NEGOTIATION_SHIELD_CASE_ATTACH', 'NEGOTIATION_SHIELD_CASE_UPDATE', 'NEGOTIATION_SHIELD_CASE_ANALYZE',
    'SELL_HOLD_RENT_ANALYSIS', 'SELL_HOLD_RENT_GOAL_CAPTURE',
    'SELLER_PREP_CHECKLIST', 'SELLER_PREP_ITEM_DECISION', 'SELLER_PREP_CASE_COMMAND',
    'MAJOR_EVENT_ENTRY',
    'HVAC_DECISION_START', 'HVAC_DECISION_CONTINUE', 'HVAC_SPECIALIST_ENGAGE', 'HVAC_DECISION_SCENARIO',
    'HVAC_DECISION_ABANDON', 'HVAC_PREFERENCE_SAVE', 'HVAC_PREFERENCE_FORGET',
    'HVAC_DECISION_OUTCOME_REPORT', 'HVAC_DECISION_OUTCOME_VIEW', 'HVAC_DECISION_OUTCOME_UNLINK',
  ];
  for (const operationId of migratedOperations) {
    const candidates = operationSpecificContinuationCandidates(operationId, PROPERTY_ID);
    assert.ok(candidates.length >= 1, `${operationId}: missing tailored continuation`);
    assert.ok(candidates.every((candidate) => candidate.sourceOperationId === operationId), operationId);
  }
});

test('buyer lifecycle reads and command receipts all have tailored closing continuations', () => {
  const migratedOperations = [
    'BUYER_PLAN_STATUS', 'BUYER_DEADLINES', 'BUYER_DOCUMENT_READINESS', 'BUYER_INSPECTION_REVIEW',
    'BUYER_FINANCING_READINESS', 'BUYER_TITLE_ESCROW_READINESS', 'BUYER_WALKTHROUGH_READINESS',
    'BUYER_DISCLOSURE_FUNDS_READINESS', 'BUYER_CLOSING_DAY_READINESS', 'BUYER_CONTRACT_TIMELINE',
    'BUYER_NEGOTIATION_READINESS', 'BUYER_COST_READINESS', 'BUYER_MOVE_STATUS', 'BUYER_LOAN_ESTIMATES',
    'BUYER_INSURANCE_READINESS', 'BUYER_CONTRACT_COMMAND', 'BUYER_CLOSING_DISCLOSURE_COMMAND',
    'BUYER_LOAN_ESTIMATE_COMMAND', 'BUYER_PLAN_SETUP_COMMAND', 'BUYER_INSURANCE_COMMAND',
    'BUYER_CLOSING_ITEM_COMMAND', 'BUYER_WALKTHROUGH_COMMAND', 'BUYER_TASK_COMPLETE', 'BUYER_TASK_CREATE',
    'BUYER_TASK_UPDATE', 'BUYER_FINDING_DISPOSITION', 'BUYER_LIFECYCLE_UPDATE',
  ];
  for (const operationId of migratedOperations) {
    const candidates = operationSpecificContinuationCandidates(operationId, PROPERTY_ID);
    assert.ok(candidates.length >= 1, `${operationId}: missing tailored continuation`);
    assert.ok(candidates.every((candidate) => candidate.sourceOperationId === operationId), operationId);
    assert.ok(candidates.every((candidate) => candidate.operationId.startsWith('BUYER_')), `${operationId}: buyer flow escaped its closing journey`);
  }
});

test('home intelligence reads and command receipts all have tailored continuations', () => {
  const migratedOperations = [
    'HOME_STATUS_BOARD', 'STATUS_BOARD_COMMAND', 'HOME_TIMELINE_EVENTS', 'HOME_EVENT_VISIBILITY',
    'HOME_CHANGE_SUMMARY', 'HOME_BRIEFING_VIEW', 'HOME_BRIEFING_COMMAND', 'HOME_BRIEFING_SHARE_COMMAND',
    'HOME_EVENT_RADAR_FEED', 'HOME_EVENT_RADAR_STATE', 'HOME_EVENT_RADAR_MARK_DONE',
    'HOME_EVENT_RADAR_FEEDBACK', 'HOME_EVENT_RADAR_PREFERENCES', 'HOME_EVENT_RADAR_TASK',
    'HOME_WORK_ITEMS', 'HOME_WORK_ITEM_COMMAND', 'PROPERTY_SUMMARY', 'HOME_DEADLINE_MONITOR',
  ];
  for (const operationId of migratedOperations) {
    const candidates = operationSpecificContinuationCandidates(operationId, PROPERTY_ID);
    assert.ok(candidates.length >= 1, `${operationId}: missing tailored continuation`);
    assert.ok(candidates.every((candidate) => candidate.sourceOperationId === operationId), operationId);
  }
});
