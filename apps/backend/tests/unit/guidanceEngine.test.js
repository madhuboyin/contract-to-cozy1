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
  freeze_risk: {
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

function mapIncidentTypeToSignalFamily(typeKey) {
  const normalized = String(typeKey || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');

  if (normalized.includes('RECALL')) return 'recall_detected';
  if (normalized.includes('FREEZE') || normalized.includes('WEATHER') || normalized.includes('CLIMATE')) {
    return 'freeze_risk';
  }
  if (normalized.includes('COVERAGE') || normalized.includes('POLICY')) {
    return 'coverage_lapse_detected';
  }
  if (normalized.includes('INSPECTION')) return 'inspection_followup_needed';
  if (normalized.includes('LIFECYCLE') || normalized.includes('END_OF_LIFE')) {
    return 'lifecycle_end_or_past_life';
  }
  if (normalized.includes('MAINTENANCE')) return 'maintenance_failure_risk';
  if (normalized.includes('FINANCIAL') || normalized.includes('BUDGET') || normalized.includes('CAPITAL')) {
    return 'financial_exposure';
  }
  return 'generic_actionable_signal';
}

function computePriorityScore({
  severityScore = 0,
  urgency = 0,
  financialImpact = 0,
  safetyBoost = 0,
  confidenceScore = 0.5,
  readinessWeight = 0,
}) {
  const raw =
    severityScore * 0.35 +
    urgency +
    financialImpact * 0.28 +
    safetyBoost +
    confidenceScore * 12 +
    readinessWeight;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function suppressActions(actions) {
  const byKey = new Map();
  const suppressed = [];

  for (const action of actions) {
    const key = action.groupKey;
    const existing = byKey.get(key);
    if (!existing || action.priorityScore > existing.priorityScore) {
      if (existing) suppressed.push({ id: existing.id, reason: 'DUPLICATE_SIGNAL_MERGED' });
      byKey.set(key, action);
    } else {
      suppressed.push({ id: action.id, reason: 'DUPLICATE_SIGNAL_MERGED' });
    }
  }

  const filtered = [];
  for (const action of byKey.values()) {
    if (action.executionReadiness === 'TRACKING_ONLY') {
      suppressed.push({ id: action.id, reason: 'TRACKING_ONLY' });
      continue;
    }
    if (action.isWeakSignal) {
      suppressed.push({ id: action.id, reason: 'WEAK_SIGNAL' });
      continue;
    }
    filtered.push(action);
  }

  filtered.sort((a, b) => b.priorityScore - a.priorityScore);

  return { filtered, suppressed };
}

function confidenceLabel(score) {
  if (score >= 0.72) return 'HIGH';
  if (score < 0.45) return 'LOW';
  return 'MEDIUM';
}

function polishCtaLabel(label, stepKey) {
  if (stepKey === 'repair_replace_decision') return 'Compare Repair vs Replace';
  if (stepKey === 'check_coverage') return 'Check Coverage First';
  if (label.toLowerCase() === 'view details') return 'Review Next Step';
  return label;
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

test('incident mapping routes freeze and weather incidents to freeze risk guidance', () => {
  assert.equal(mapIncidentTypeToSignalFamily('FREEZE_RISK'), 'freeze_risk');
  assert.equal(mapIncidentTypeToSignalFamily('weather_alert_high_wind'), 'freeze_risk');
  const template = resolveTemplate('freeze_risk');
  assert.equal(template.key, 'recall_safety_resolution');
  assert.deepEqual(template.steps, ['safety_alert', 'review_remedy_instructions', 'recall_resolution']);
});

test('incident mapping routes coverage and recall incidents to correct guidance families', () => {
  assert.equal(mapIncidentTypeToSignalFamily('COVERAGE_LAPSE'), 'coverage_lapse_detected');
  assert.equal(mapIncidentTypeToSignalFamily('recall_match_detected'), 'recall_detected');
});

test('priority scoring ranks urgent high-severity actions above optimization actions', () => {
  const immediate = computePriorityScore({
    severityScore: 90,
    urgency: 18,
    financialImpact: 65,
    safetyBoost: 18,
    confidenceScore: 0.8,
    readinessWeight: 6,
  });
  const optimization = computePriorityScore({
    severityScore: 24,
    urgency: 4,
    financialImpact: 10,
    safetyBoost: 0,
    confidenceScore: 0.55,
    readinessWeight: -10,
  });

  assert.ok(immediate > optimization);
  assert.ok(immediate >= 72);
});

test('suppression removes duplicate and weak/tracking signals from surfaced actions', () => {
  const actions = [
    { id: 'a1', groupKey: 'hvac', priorityScore: 70, executionReadiness: 'NEEDS_CONTEXT', isWeakSignal: false },
    { id: 'a2', groupKey: 'hvac', priorityScore: 65, executionReadiness: 'NEEDS_CONTEXT', isWeakSignal: false },
    { id: 'a3', groupKey: 'weather', priorityScore: 22, executionReadiness: 'TRACKING_ONLY', isWeakSignal: false },
    { id: 'a4', groupKey: 'minor', priorityScore: 18, executionReadiness: 'NEEDS_CONTEXT', isWeakSignal: true },
  ];

  const { filtered, suppressed } = suppressActions(actions);

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'a1');
  assert.ok(suppressed.some((entry) => entry.id === 'a2' && entry.reason === 'DUPLICATE_SIGNAL_MERGED'));
  assert.ok(suppressed.some((entry) => entry.id === 'a3' && entry.reason === 'TRACKING_ONLY'));
  assert.ok(suppressed.some((entry) => entry.id === 'a4' && entry.reason === 'WEAK_SIGNAL'));
});

test('financial context with funding gap increases priority pressure', () => {
  const withoutGap = computePriorityScore({
    severityScore: 62,
    urgency: 10,
    financialImpact: 24,
    confidenceScore: 0.7,
  });
  const withGap = computePriorityScore({
    severityScore: 62,
    urgency: 10,
    financialImpact: 58,
    confidenceScore: 0.7,
  });
  assert.ok(withGap > withoutGap);
});

test('low confidence downgrades label and copy stays action-oriented', () => {
  assert.equal(confidenceLabel(0.81), 'HIGH');
  assert.equal(confidenceLabel(0.5), 'MEDIUM');
  assert.equal(confidenceLabel(0.31), 'LOW');
  assert.equal(polishCtaLabel('View Details', 'review_signal'), 'Review Next Step');
  assert.equal(polishCtaLabel('Anything', 'repair_replace_decision'), 'Compare Repair vs Replace');
});
