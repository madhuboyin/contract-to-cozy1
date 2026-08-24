const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home Operations Slice 2: proposeWorkItemFromHomeAction maps an already-
// built HomeAction into a ProposedWorkItem for the Slice 1 identity
// resolver. This file has zero runtime imports (everything it pulls in is
// type-only), so no prisma/ioredis mocking is needed.

const {
  isWorkItemEligible,
  proposeWorkItemFromHomeAction,
  WORK_ITEM_ELIGIBLE_SOURCE_KINDS,
} = require('../../src/modules/homeOperations/adapters/homeActionWorkItem.adapter.ts');

function actionFixture(overrides = {}) {
  return {
    id: 'guidance:journey-1',
    propertyId: 'property-1',
    lineageId: 'lineage-1',
    source: { kind: 'GUIDANCE', entityId: 'journey-1', version: 'v1' },
    priority: 'SOON',
    signal: 'Resolve the HVAC decision',
    whyItMatters: 'The unit needs a repair-or-replace decision.',
    expectedOutcome: 'A clear next step is chosen.',
    timing: { dueAt: null, windowStart: '2026-08-01T00:00:00.000Z', windowEnd: null, rationale: '...' },
    confidence: { score: 0.7, label: 'MEDIUM', missing: [] },
    governance: { safetyTier: 'LOW_CONSEQUENCE' },
    ...overrides,
  };
}

test('WORK_ITEM_ELIGIBLE_SOURCE_KINDS is exactly the 6 work-shaped sources', () => {
  assert.deepEqual(
    [...WORK_ITEM_ELIGIBLE_SOURCE_KINDS].sort(),
    ['COVERAGE', 'GUIDANCE', 'INCIDENT', 'MAINTENANCE', 'PROJECT', 'RECALL'].sort(),
  );
});

for (const kind of ['PERSONALIZATION', 'SYSTEM', 'SAVINGS_BENEFITS']) {
  test(`${kind}-sourced actions are not work-item eligible (advisory recommendation only)`, () => {
    const action = actionFixture({ source: { kind, entityId: 'x-1', version: 'v1' } });
    assert.equal(isWorkItemEligible(action), false);
    assert.equal(proposeWorkItemFromHomeAction(action, 'property-1'), null);
  });
}

test('the seasonal-checklist aggregate action is excluded even though its source kind is MAINTENANCE', () => {
  const action = actionFixture({
    id: 'seasonal-checklist:checklist-1',
    source: { kind: 'MAINTENANCE', entityId: 'checklist-1', version: 'v1' },
  });
  assert.equal(isWorkItemEligible(action), false);
  assert.equal(proposeWorkItemFromHomeAction(action, 'property-1'), null);
});

test('a PROJECT action gets a PROJECT subject using the real project id', () => {
  const action = actionFixture({
    id: 'project:project-1',
    source: { kind: 'PROJECT', entityId: 'project-1', version: '2026-01-01T00:00:00.000Z' },
  });
  const proposed = proposeWorkItemFromHomeAction(action, 'property-1');
  assert.deepEqual(proposed.subject, { type: 'PROJECT', id: 'project-1' });
  assert.equal(proposed.obligationType, 'PROJECT_EXECUTION');
  assert.equal(proposed.occurrence.obligationSlug, 'execution');
  assert.equal(proposed.source.sourceType, 'PROJECT');
});

// Only orchestration.service.ts's coverage-gap detector (action id
// prefixed COVERAGE_GAP::, built from a real relatedEntity.type ===
// 'INVENTORY_ITEM') genuinely carries an inventory item id in
// source.entityId — this is the one COVERAGE-kind shape that resolves to
// an INVENTORY_ITEM subject.
test('a genuine coverage-gap-detector action (COVERAGE_GAP:: id prefix) gets an INVENTORY_ITEM subject', () => {
  const action = actionFixture({
    id: 'COVERAGE_GAP::inventory-1',
    source: { kind: 'COVERAGE', entityId: 'inventory-1', version: 'v1' },
  });
  const proposed = proposeWorkItemFromHomeAction(action, 'property-1');
  assert.deepEqual(proposed.subject, { type: 'INVENTORY_ITEM', id: 'inventory-1' });
  assert.equal(proposed.obligationType, 'COVERAGE_ACTION');
  assert.equal(proposed.occurrence.obligationSlug, 'coverage-gap');
});

// loadCoverageActions' source.entityId is a CoverageReview.id, and
// loadCoverageRenewalActions' is a Warranty/InsurancePolicy.id — neither is
// an inventory item id (an InsurancePolicy in particular may not identify
// one at all). Both must fall back to a PROPERTY subject with a
// record-specific obligationSlug rather than mint a nonsensical
// INVENTORY_ITEM subject out of the wrong id.
test('a coverage-review action (CoverageReview.id, not an inventory item id) gets a PROPERTY subject with a record-specific slug', () => {
  const action = actionFixture({
    id: 'coverage-review:review-1',
    source: { kind: 'COVERAGE', entityId: 'review-1', version: 'v1' },
  });
  const proposed = proposeWorkItemFromHomeAction(action, 'property-1');
  assert.deepEqual(proposed.subject, { type: 'PROPERTY', id: 'property-1' });
  assert.equal(proposed.obligationType, 'COVERAGE_ACTION');
  assert.equal(proposed.occurrence.obligationSlug, 'coverage-gap-review-1');
});

test('a coverage-renewal action (Warranty/InsurancePolicy.id, not an inventory item id) gets a PROPERTY subject with a record-specific slug', () => {
  const action = actionFixture({
    id: 'coverage-renewal:insurance:policy-1',
    source: { kind: 'COVERAGE', entityId: 'policy-1', version: 'v1' },
  });
  const proposed = proposeWorkItemFromHomeAction(action, 'property-1');
  assert.deepEqual(proposed.subject, { type: 'PROPERTY', id: 'property-1' });
  assert.equal(proposed.obligationType, 'COVERAGE_ACTION');
  assert.equal(proposed.occurrence.obligationSlug, 'coverage-gap-policy-1');
});

test('a GUIDANCE action with REGULATED_COVERAGE safety tier is treated as coverage-shaped', () => {
  const action = actionFixture({
    source: { kind: 'GUIDANCE', entityId: 'inventory-1', version: 'v1' },
    governance: { safetyTier: 'REGULATED_COVERAGE' },
  });
  const proposed = proposeWorkItemFromHomeAction(action, 'property-1');
  assert.deepEqual(proposed.subject, { type: 'INVENTORY_ITEM', id: 'inventory-1' });
  assert.equal(proposed.obligationType, 'COVERAGE_ACTION');
});

test('a non-coverage GUIDANCE action falls back to a PROPERTY subject, uniqueness carried by obligationSlug', () => {
  const action = actionFixture();
  const proposed = proposeWorkItemFromHomeAction(action, 'property-1');
  assert.deepEqual(proposed.subject, { type: 'PROPERTY', id: 'property-1' });
  assert.equal(proposed.obligationType, 'DECISION');
  assert.equal(proposed.occurrence.obligationSlug, 'guidance-journey-1');
});

// Finding: loadRepairReplaceDecisionActions keys source.entityId to the
// ReplaceRepairAnalysis id, not the journey — but a Booking launched from
// that journey resolves origin via guidanceJourneyId, keyed to the
// journey's own id. Without preferring relatedJourneyId, the two would
// never converge on the same work item.
test('a GUIDANCE action whose entityId diverges from its relatedJourneyId (e.g. repair/replace) keys its obligation on the journey, not the entityId', () => {
  const action = actionFixture({
    id: 'repair-replace:analysis-1',
    source: { kind: 'GUIDANCE', entityId: 'analysis-1', version: 'v1' },
    relatedJourneyId: 'journey-42',
  });
  const proposed = proposeWorkItemFromHomeAction(action, 'property-1');
  assert.deepEqual(proposed.subject, { type: 'PROPERTY', id: 'property-1' });
  assert.equal(proposed.obligationType, 'DECISION');
  assert.equal(proposed.occurrence.obligationSlug, 'guidance-journey-42', 'must match whatever obligationSlug a Booking resolved via guidanceJourneyId=journey-42 would key to');
});

test('MAINTENANCE, INCIDENT, and RECALL all resolve to a PROPERTY subject with a distinguishing slug', () => {
  const maintenance = proposeWorkItemFromHomeAction(
    actionFixture({ id: 'checklist:x', source: { kind: 'MAINTENANCE', entityId: 'chk-1', version: 'v1' } }),
    'property-1',
  );
  assert.equal(maintenance.obligationType, 'MAINTENANCE_TASK');
  assert.equal(maintenance.occurrence.obligationSlug, 'maintenance-chk-1');

  const incident = proposeWorkItemFromHomeAction(
    actionFixture({ id: 'incident:x', source: { kind: 'INCIDENT', entityId: 'inc-1', version: 'v1' } }),
    'property-1',
  );
  assert.equal(incident.obligationType, 'INCIDENT_RESPONSE');
  assert.equal(incident.occurrence.obligationSlug, 'incident-inc-1');

  const recall = proposeWorkItemFromHomeAction(
    actionFixture({ id: 'recall:x', source: { kind: 'RECALL', entityId: 'rec-1', version: 'v1' } }),
    'property-1',
  );
  assert.equal(recall.obligationType, 'INCIDENT_RESPONSE');
  assert.equal(recall.occurrence.obligationSlug, 'recall-rec-1');
});

test('presentation fields are copied straight from the HomeAction, not re-derived', () => {
  const action = actionFixture({
    signal: 'Custom title',
    whyItMatters: 'Custom reason',
    expectedOutcome: 'Custom outcome',
    priority: 'NOW',
    confidence: { score: 0.4, label: 'LOW', missing: ['Roof age'] },
    timing: { dueAt: '2026-09-01T00:00:00.000Z', windowStart: '2026-08-15T00:00:00.000Z', windowEnd: '2026-09-15T00:00:00.000Z', rationale: '...' },
  });
  const proposed = proposeWorkItemFromHomeAction(action, 'property-1');
  assert.equal(proposed.title, 'Custom title');
  assert.equal(proposed.homeownerReason, 'Custom reason');
  assert.equal(proposed.expectedOutcome, 'Custom outcome');
  assert.equal(proposed.priority, 'NOW');
  assert.equal(proposed.confidence, 0.4);
  assert.deepEqual(proposed.missingContext, ['Roof age']);
  assert.equal(proposed.dueAt.toISOString(), '2026-09-01T00:00:00.000Z');
  assert.equal(proposed.dueWindowStart.toISOString(), '2026-08-15T00:00:00.000Z');
  assert.equal(proposed.dueWindowEnd.toISOString(), '2026-09-15T00:00:00.000Z');
});
