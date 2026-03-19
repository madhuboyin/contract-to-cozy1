const test = require('node:test');
const assert = require('node:assert/strict');

const TEMPLATE_BY_FAMILY = {
  lifecycle_end_or_past_life: {
    key: 'asset_lifecycle_resolution',
    steps: [
      'repair_replace_decision',
      'check_coverage',
      'validate_price',
      'prepare_negotiation',
      'book_service',
    ],
  },
  coverage_gap: {
    key: 'coverage_gap_resolution',
    steps: [
      'check_coverage',
      'estimate_exposure',
      'compare_coverage_options',
      'update_policy_or_documents',
    ],
  },
  recall_detected: {
    key: 'recall_safety_resolution',
    steps: ['safety_alert', 'review_remedy_instructions', 'recall_resolution'],
  },
  inspection_followup_needed: {
    key: 'inspection_followup_resolution',
    steps: ['assess_urgency', 'estimate_repair_cost', 'route_specialist', 'track_resolution'],
  },
};

function resolveTemplate(signalFamily) {
  return TEMPLATE_BY_FAMILY[signalFamily] || { key: 'generic_guidance_resolution', steps: ['review_signal'] };
}

function resolveNextStep(steps) {
  return steps.find((step) => ['PENDING', 'IN_PROGRESS', 'BLOCKED'].includes(step.status)) || null;
}

function evaluateExecutionGuard(steps) {
  const executionStep = steps.find((step) => step.stepKey === 'book_service' || step.stepKey === 'route_specialist');
  if (!executionStep) return { blocked: false, reasons: [] };

  const incompleteRequired = steps.filter(
    (step) => step.isRequired && step.stepOrder < executionStep.stepOrder && step.status !== 'COMPLETED'
  );

  return {
    blocked: incompleteRequired.length > 0,
    reasons: incompleteRequired.map((step) => step.stepKey),
  };
}

function shouldReuseJourney(existing, incoming) {
  return (
    existing.propertyId === incoming.propertyId &&
    existing.journeyTypeKey === incoming.journeyTypeKey &&
    existing.inventoryItemId === incoming.inventoryItemId &&
    existing.homeAssetId === incoming.homeAssetId &&
    existing.mergedSignalGroupKey === incoming.mergedSignalGroupKey &&
    existing.status === 'ACTIVE'
  );
}

test('lifecycle signal maps to deterministic lifecycle journey template', () => {
  const template = resolveTemplate('lifecycle_end_or_past_life');
  assert.equal(template.key, 'asset_lifecycle_resolution');
  assert.deepEqual(template.steps, [
    'repair_replace_decision',
    'check_coverage',
    'validate_price',
    'prepare_negotiation',
    'book_service',
  ]);
});

test('coverage gap signal maps to coverage journey template', () => {
  const template = resolveTemplate('coverage_gap');
  assert.equal(template.key, 'coverage_gap_resolution');
  assert.deepEqual(template.steps, [
    'check_coverage',
    'estimate_exposure',
    'compare_coverage_options',
    'update_policy_or_documents',
  ]);
});

test('recall signal maps to safety-first recall journey', () => {
  const template = resolveTemplate('recall_detected');
  assert.equal(template.key, 'recall_safety_resolution');
  assert.deepEqual(template.steps, ['safety_alert', 'review_remedy_instructions', 'recall_resolution']);
});

test('inspection follow-up signal maps to ordered inspection remediation steps', () => {
  const template = resolveTemplate('inspection_followup_needed');
  assert.equal(template.key, 'inspection_followup_resolution');
  assert.deepEqual(template.steps, ['assess_urgency', 'estimate_repair_cost', 'route_specialist', 'track_resolution']);
});

test('execution guard blocks premature booking when required steps are incomplete', () => {
  const steps = [
    { stepOrder: 1, stepKey: 'repair_replace_decision', status: 'COMPLETED', isRequired: true },
    { stepOrder: 2, stepKey: 'check_coverage', status: 'PENDING', isRequired: true },
    { stepOrder: 3, stepKey: 'validate_price', status: 'PENDING', isRequired: true },
    { stepOrder: 4, stepKey: 'book_service', status: 'PENDING', isRequired: true },
  ];

  const guard = evaluateExecutionGuard(steps);
  assert.equal(guard.blocked, true);
  assert.deepEqual(guard.reasons, ['check_coverage', 'validate_price']);
});

test('next-step resolver returns first actionable step in deterministic order', () => {
  const steps = [
    { stepOrder: 1, stepKey: 'check_coverage', status: 'COMPLETED' },
    { stepOrder: 2, stepKey: 'estimate_exposure', status: 'IN_PROGRESS' },
    { stepOrder: 3, stepKey: 'compare_coverage_options', status: 'PENDING' },
  ];

  const next = resolveNextStep(steps);
  assert.equal(next.stepKey, 'estimate_exposure');
});

test('duplicate active journey reuse evaluates true for same property/scope/group', () => {
  const existing = {
    propertyId: 'p1',
    journeyTypeKey: 'asset_lifecycle_resolution',
    inventoryItemId: 'item1',
    homeAssetId: null,
    mergedSignalGroupKey: 'p1:ASSET_LIFECYCLE:lifecycle_end_or_past_life:item1',
    status: 'ACTIVE',
  };

  const incoming = {
    propertyId: 'p1',
    journeyTypeKey: 'asset_lifecycle_resolution',
    inventoryItemId: 'item1',
    homeAssetId: null,
    mergedSignalGroupKey: 'p1:ASSET_LIFECYCLE:lifecycle_end_or_past_life:item1',
  };

  assert.equal(shouldReuseJourney(existing, incoming), true);
});
