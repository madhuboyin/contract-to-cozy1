const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  buildOwnershipCostChangeReadModel,
  compareOwnershipCostSnapshots,
  OwnershipCostChangeService,
} = require('../../src/services/ownershipCosts/ownershipCostChange.service.ts');
const {
  loadOwnershipCostChangeActions,
} = require('../../src/services/homeActionSourcePromotion.service.ts');

function line(overrides = {}) {
  return {
    category: 'PROPERTY_TAX',
    subcategory: null,
    annualizedAmountCents: 240000,
    applicability: 'APPLICABLE',
    evidenceStatus: 'CONFIRMED',
    verificationStatus: 'VERIFIED',
    freshnessStatus: 'CURRENT',
    includedLenses: ['OPERATING_EXPENSE', 'CASH_OUTFLOW'],
    sourceObservation: {
      id: 'observation-default',
      recurrence: 'ANNUAL',
      sourceDomain: 'PROPERTY_TAX',
      sourceEntityType: 'PropertyTaxBillRecord',
      sourceEntityId: 'tax-default',
      sourceDocumentId: 'document-default',
      periodStart: new Date('2025-01-01T00:00:00.000Z'),
      periodEnd: new Date('2025-12-31T23:59:59.999Z'),
      assumptionsJson: [],
    },
    ...overrides,
  };
}

function snapshot(year, lines, overrides = {}) {
  return {
    id: `snapshot-${year}`,
    methodVersion: 'ownership-cost-normalization-v1',
    categoryDefinitionVersion: 'ownership-cost-categories-v1',
    basePeriodStart: new Date(`${year}-01-01T00:00:00.000Z`),
    basePeriodEnd: new Date(`${year}-12-31T23:59:59.999Z`),
    computedAt: new Date(`${year}-12-31T23:59:59.999Z`),
    lines,
    ...overrides,
  };
}

function observedPair(currentOverrides = {}, priorOverrides = {}) {
  const prior = snapshot(2025, [line({
    ...priorOverrides,
    sourceObservation: {
      ...line().sourceObservation,
      id: 'tax-observation-2025',
      sourceEntityId: 'tax-2025',
      sourceDocumentId: 'tax-document-2025',
      periodStart: new Date('2025-01-01T00:00:00.000Z'),
      periodEnd: new Date('2025-12-31T23:59:59.999Z'),
      ...(priorOverrides.sourceObservation ?? {}),
    },
  })]);
  const current = snapshot(2026, [line({
    annualizedAmountCents: 270000,
    ...currentOverrides,
    sourceObservation: {
      ...line().sourceObservation,
      id: 'tax-observation-2026',
      sourceEntityId: 'tax-2026',
      sourceDocumentId: 'tax-document-2026',
      periodStart: new Date('2026-01-01T00:00:00.000Z'),
      periodEnd: new Date('2026-12-31T23:59:59.999Z'),
      ...(currentOverrides.sourceObservation ?? {}),
    },
  })]);
  return { prior, current };
}

test('Slice 4 creates a ranked change only from comparable observed periods', () => {
  const { prior, current } = observedPair();
  const changes = compareOwnershipCostSnapshots(
    'property-1',
    prior,
    current,
    'OPERATING_EXPENSE',
  );

  assert.equal(changes.length, 1);
  assert.equal(changes[0].category, 'PROPERTY_TAX');
  assert.equal(changes[0].deltaCents, 30000);
  assert.equal(changes[0].deltaPercent, 0.125);
  assert.equal(changes[0].impact, 'RECURRING');
  assert.equal(changes[0].recurringDeltaCents, 30000);
  assert.equal(changes[0].reason, 'UNEXPLAINED');
  assert.equal(changes[0].explanationStatus, 'UNEXPLAINED');
  assert.match(changes[0].explanation, /do not establish why/);
  assert.equal(changes[0].evidence.length, 2);
  assert.equal(changes[0].materiality.material, true);
});

test('explicit source reason is supported without inventing attribution', () => {
  const { prior, current } = observedPair({
    sourceObservation: { assumptionsJson: ['CHANGE_REASON:RATE'] },
  });
  const [change] = compareOwnershipCostSnapshots(
    'property-1',
    prior,
    current,
    'OPERATING_EXPENSE',
  );

  assert.equal(change.reason, 'RATE');
  assert.equal(change.explanationStatus, 'SUPPORTED');
  assert.match(change.explanation, /supported rate change/);
});

test('estimated, unverified, overlapping, missing, and incompatible data produce no change', () => {
  const estimated = observedPair({ evidenceStatus: 'ESTIMATED' });
  assert.equal(compareOwnershipCostSnapshots(
    'property-1',
    estimated.prior,
    estimated.current,
    'OPERATING_EXPENSE',
  ).length, 0);

  const unverified = observedPair({ verificationStatus: 'UNVERIFIED' });
  assert.equal(compareOwnershipCostSnapshots(
    'property-1',
    unverified.prior,
    unverified.current,
    'OPERATING_EXPENSE',
  ).length, 0);

  const overlapping = observedPair({
    sourceObservation: {
      periodStart: new Date('2025-06-01T00:00:00.000Z'),
    },
  });
  assert.equal(compareOwnershipCostSnapshots(
    'property-1',
    overlapping.prior,
    overlapping.current,
    'OPERATING_EXPENSE',
  ).length, 0);

  const missing = observedPair({ annualizedAmountCents: null });
  assert.equal(compareOwnershipCostSnapshots(
    'property-1',
    missing.prior,
    missing.current,
    'OPERATING_EXPENSE',
  ).length, 0);

  const incompatible = observedPair();
  incompatible.current.methodVersion = 'ownership-cost-normalization-v2';
  assert.equal(compareOwnershipCostSnapshots(
    'property-1',
    incompatible.prior,
    incompatible.current,
    'OPERATING_EXPENSE',
  ).length, 0);
});

test('one-time categories never contribute to recurring impact', () => {
  const priorLine = line({
    category: 'CAPITAL_PROJECT',
    annualizedAmountCents: 100000,
    sourceObservation: {
      ...line().sourceObservation,
      id: 'project-2025',
      recurrence: 'ONE_TIME',
      sourceDomain: 'PROJECT',
      sourceEntityType: 'ProjectRecord',
      sourceEntityId: 'project-2025',
      periodStart: new Date('2025-01-01T00:00:00.000Z'),
      periodEnd: new Date('2025-12-31T23:59:59.999Z'),
    },
  });
  const currentLine = line({
    category: 'CAPITAL_PROJECT',
    annualizedAmountCents: 400000,
    sourceObservation: {
      ...priorLine.sourceObservation,
      id: 'project-2026',
      sourceEntityId: 'project-2026',
      periodStart: new Date('2026-01-01T00:00:00.000Z'),
      periodEnd: new Date('2026-12-31T23:59:59.999Z'),
    },
  });
  const [change] = compareOwnershipCostSnapshots(
    'property-1',
    snapshot(2025, [priorLine]),
    snapshot(2026, [currentLine]),
    'CASH_OUTFLOW',
  );

  assert.equal(change.impact, 'ONE_TIME');
  assert.equal(change.recurringDeltaCents, null);
  assert.equal(change.reason, 'ONE_TIME_EVENT');
});

test('read model withholds change conclusions without a comparable pair', () => {
  const model = buildOwnershipCostChangeReadModel(
    'property-1',
    [observedPair().current],
    'OPERATING_EXPENSE',
  );
  assert.equal(model.comparable, false);
  assert.equal(model.changes.length, 0);
  assert.match(model.reason, /At least two non-overlapping snapshots/);
});

test('change service authorizes before loading and persists comparable records', async () => {
  const { prior, current } = observedPair();
  const calls = [];
  const service = new OwnershipCostChangeService({
    authorize: async () => {
      calls.push('authorize');
      return true;
    },
    loadSnapshots: async () => {
      calls.push('load');
      return [current, prior];
    },
    persist: async (_propertyId, changes) => {
      calls.push('persist');
      return changes.map((change) => ({ ...change, id: 'change-1' }));
    },
  });

  const result = await service.refreshObservedChanges(
    'property-1',
    'user-1',
    'OPERATING_EXPENSE',
  );
  assert.deepEqual(calls, ['authorize', 'load', 'persist']);
  assert.equal(result.changes[0].id, 'change-1');
});

test('material latest changes become lifecycle-aware canonical Home Actions', async () => {
  const actions = await loadOwnershipCostChangeActions('property-1', {
    ownershipCostSnapshot: {
      findFirst: async () => ({ id: 'snapshot-2026' }),
    },
    ownershipCostChange: {
      findMany: async () => [{
        id: 'change-1',
        category: 'PROPERTY_TAX',
        amountDeltaCents: 30000,
        recurringDeltaCents: 30000,
        changeReason: 'UNEXPLAINED',
        explanationStatus: 'UNEXPLAINED',
        evidenceJson: {
          materiality: { material: true },
          confidence: 'HIGH',
          explanation: 'Property tax increased, but the records do not establish why.',
          currentPeriod: {
            start: '2026-01-01T00:00:00.000Z',
            end: '2026-12-31T23:59:59.999Z',
          },
          evidence: [{
            observationId: 'tax-observation-2026',
            sourceDomain: 'PROPERTY_TAX',
            sourceDocumentId: 'document-2026',
            periodEnd: '2026-12-31T23:59:59.999Z',
          }],
          action: {
            href: '/dashboard/properties/property-1/tools/property-tax',
            label: 'Review tax evidence',
          },
        },
        createdAt: new Date('2026-12-31T23:59:59.999Z'),
        toSnapshotId: 'snapshot-2026',
      }],
    },
  });

  assert.equal(actions.length, 1);
  assert.equal(actions[0].source.kind, 'SYSTEM');
  assert.equal(actions[0].governance.safetyTier, 'MATERIAL_FINANCIAL');
  assert.ok(actions[0].feedbackControls.includes('DISMISS'));
  assert.ok(actions[0].feedbackControls.includes('SNOOZE'));
  assert.match(actions[0].primaryCta.href, /tools\/property-tax/);
  assert.match(actions[0].recommendedAction, /source evidence|home information/i);
});

test('Slice 4 API and UI expose observed evidence without legacy history', () => {
  const route = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/ownershipCosts.routes.ts'),
    'utf8',
  );
  const client = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/ownership-costs/OwnershipCostsClient.tsx',
    ),
    'utf8',
  );
  assert.match(route, /ownership-costs\/changes/);
  assert.match(client, /Ranked observed changes/);
  assert.match(client, /Reason unknown — no cause was inferred/);
  assert.match(client, /View source evidence/);
  assert.doesNotMatch(client, /modeledSeries|projection.*What changed/);
});
