const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home Operations Slice 5: inspectionFindingSourceAdapter.propose() is the
// gate for "unaccepted extraction does not become committed work" — pure,
// no prisma mocking needed for propose()/resolveInspectionFindingWorkKey().

const {
  inspectionFindingSourceAdapter,
  resolveInspectionFindingWorkKey,
} = require('../../src/modules/homeOperations/adapters/inspectionFinding.adapter.ts');

function findingFixture(overrides = {}) {
  return {
    id: 'finding-1',
    reportId: 'report-1',
    propertyId: 'property-1',
    homeSystem: 'HVAC',
    inspectorDescription: 'The furnace heat exchanger shows visible cracking.',
    inspectorRecommendation: 'Have a licensed HVAC technician evaluate immediately.',
    severity: 'SAFETY',
    status: 'OPEN',
    estimatedCostCentsLow: null,
    estimatedCostCentsHigh: null,
    updatedAt: new Date('2026-07-20T00:00:00.000Z'),
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    report: { status: 'CONFIRMED' },
    ...overrides,
  };
}

test('an INFORMATIONAL finding proposes nothing', () => {
  const proposed = inspectionFindingSourceAdapter.propose(findingFixture({ severity: 'INFORMATIONAL' }), 'property-1');
  assert.equal(proposed, null);
});

test('a finding whose report has not been confirmed proposes nothing — unaccepted extraction', () => {
  const proposed = inspectionFindingSourceAdapter.propose(
    findingFixture({ report: { status: 'REVIEW_PENDING' } }),
    'property-1',
  );
  assert.equal(proposed, null);
});

test('a RESOLVED, DISMISSED, or ACCEPTED_AS_IS finding proposes nothing (terminal)', () => {
  for (const status of ['RESOLVED', 'DISMISSED', 'ACCEPTED_AS_IS']) {
    const proposed = inspectionFindingSourceAdapter.propose(findingFixture({ status }), 'property-1');
    assert.equal(proposed, null, `expected null for status ${status}`);
  }
});

test('an OPEN, non-INFORMATIONAL finding on a CONFIRMED report proposes a FINDING-subject work item', () => {
  const proposed = inspectionFindingSourceAdapter.propose(findingFixture(), 'property-1');
  assert.ok(proposed);
  assert.deepEqual(proposed.subject, { type: 'FINDING', id: 'finding-1' });
  assert.equal(proposed.obligationType, 'FINDING_RESOLUTION');
  assert.equal(proposed.occurrence.obligationSlug, 'finding-resolution');
  assert.equal(proposed.source.sourceType, 'INSPECTION_FINDING');
  assert.equal(proposed.source.sourceEntityId, 'finding-1');
  assert.equal(proposed.source.sourceRole, 'TRIGGER');
});

test('priority maps SAFETY/MAJOR/MINOR/MONITOR to NOW/SOON/PLAN/CONSIDER', () => {
  assert.equal(inspectionFindingSourceAdapter.propose(findingFixture({ severity: 'SAFETY' }), 'property-1').priority, 'NOW');
  assert.equal(inspectionFindingSourceAdapter.propose(findingFixture({ severity: 'MAJOR' }), 'property-1').priority, 'SOON');
  assert.equal(inspectionFindingSourceAdapter.propose(findingFixture({ severity: 'MINOR' }), 'property-1').priority, 'PLAN');
  assert.equal(inspectionFindingSourceAdapter.propose(findingFixture({ severity: 'MONITOR' }), 'property-1').priority, 'CONSIDER');
});

test('safetyTier: SAFETY is SAFETY_EMERGENCY, high-cost MAJOR is MATERIAL_FINANCIAL, everything else LOW_CONSEQUENCE', () => {
  assert.equal(inspectionFindingSourceAdapter.propose(findingFixture({ severity: 'SAFETY' }), 'property-1').safetyTier, 'SAFETY_EMERGENCY');
  assert.equal(
    inspectionFindingSourceAdapter.propose(
      findingFixture({ severity: 'MAJOR', estimatedCostCentsHigh: 200_000 }),
      'property-1',
    ).safetyTier,
    'MATERIAL_FINANCIAL',
  );
  assert.equal(
    inspectionFindingSourceAdapter.propose(
      findingFixture({ severity: 'MAJOR', estimatedCostCentsHigh: 50_000 }),
      'property-1',
    ).safetyTier,
    'LOW_CONSEQUENCE',
  );
  assert.equal(inspectionFindingSourceAdapter.propose(findingFixture({ severity: 'MINOR' }), 'property-1').safetyTier, 'LOW_CONSEQUENCE');
});

test('two different findings never collide on workKey', () => {
  const keyA = resolveInspectionFindingWorkKey('finding-a', 'property-1');
  const keyB = resolveInspectionFindingWorkKey('finding-b', 'property-1');
  assert.notEqual(keyA, keyB);
});

test('resolveInspectionFindingWorkKey matches the workKey propose() would produce', () => {
  const { resolveWorkKey } = require('../../src/modules/homeOperations/domain/workKey.ts');
  const proposed = inspectionFindingSourceAdapter.propose(findingFixture(), 'property-1');
  const fromPropose = resolveWorkKey({
    propertyId: 'property-1',
    subject: proposed.subject,
    obligationType: proposed.obligationType,
    occurrence: proposed.occurrence,
  });
  assert.equal(fromPropose, resolveInspectionFindingWorkKey('finding-1', 'property-1'));
});

test('cost range is folded into homeownerReason when present, omitted when absent', () => {
  const withCost = inspectionFindingSourceAdapter.propose(
    findingFixture({ estimatedCostCentsLow: 50_000, estimatedCostCentsHigh: 90_000 }),
    'property-1',
  );
  assert.match(withCost.homeownerReason, /\$500.{1}\$900/);

  const withoutCost = inspectionFindingSourceAdapter.propose(findingFixture(), 'property-1');
  assert.doesNotMatch(withoutCost.homeownerReason, /Estimated cost range/);
});
