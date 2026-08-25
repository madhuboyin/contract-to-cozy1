const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { loadOwnershipCostChangeActions } = require('../../src/services/homeActionSourcePromotion.service.ts');

const NOW = new Date('2026-08-24T12:00:00.000Z');

function mortgageChange(overrides = {}) {
  return {
    id: 'change-mortgage-1',
    category: 'MORTGAGE_INTEREST',
    amountDeltaCents: 120000,
    recurringDeltaCents: 120000,
    changeReason: 'RATE_ADJUSTMENT',
    explanationStatus: 'EXPLAINED',
    evidenceJson: {
      materiality: { material: true },
      confidence: 'HIGH',
      explanation: 'Mortgage interest increased due to a rate adjustment.',
      currentPeriod: { start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.999Z' },
      evidence: [{ observationId: 'obs-1', sourceDomain: 'FINANCING', periodEnd: '2026-12-31T23:59:59.999Z' }],
    },
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    toSnapshotId: 'snapshot-2026',
  };
}

function readyRefinanceStubs(overrides = {}) {
  return {
    propertyRefinanceRadarState: {
      findUnique: async () => ({
        radarState: 'OPEN',
        lastRateSnapshot: { date: new Date('2026-08-20T00:00:00.000Z'), source: 'FRED' },
        currentOpportunity: {
          id: 'refinance-opportunity-1',
          monthlySavings: 210,
          breakEvenMonths: 18,
          marketRate: 6.125,
          evaluationDate: new Date('2026-08-21T00:00:00.000Z'),
        },
      }),
    },
    propertyFinancingProfile: {
      findUnique: async () => ({
        id: 'financing-profile-1',
        mortgageStatus: 'FIXED',
        currentMortgageBalanceCents: 35_000_000,
        interestRateBps: 725,
        remainingTermMonths: 300,
        mortgageBalanceAsOfDate: new Date('2026-08-15T00:00:00.000Z'),
      }),
    },
    ...overrides,
  };
}

function baseStubs({ changes, refinance = {} } = {}) {
  return {
    ownershipCostSnapshot: { findFirst: async () => ({ id: 'snapshot-2026' }) },
    ownershipCostChange: { findMany: async () => changes },
    ...refinance,
  };
}

test('a mortgage cost change with a ready refinance opportunity is enriched: CTA, priority, and evidence', async () => {
  const actions = await loadOwnershipCostChangeActions(
    'property-1',
    baseStubs({ changes: [mortgageChange()], refinance: readyRefinanceStubs() }),
    NOW,
  );

  assert.equal(actions.length, 1);
  const [action] = actions;
  assert.equal(action.priority, 'SOON');
  assert.equal(action.primaryCta.href, '/dashboard/properties/property-1/tools/mortgage-refinance-radar');
  assert.equal(action.primaryCta.label, 'Compare refinance options');
  assert.ok(action.whyItMatters.includes('refinance comparison is currently ready'));
  // HI-CMP-003: base observed-change evidence, plus one entry per real
  // contributing entity (the refinance opportunity and the financing
  // profile) — not a synthetic aggregate.
  assert.equal(action.evidence.length, 3, 'observed-change evidence plus one entry per contributing entity');
  const opportunityEvidence = action.evidence.find((entry) => entry.id === 'refinance-opportunity-1');
  assert.ok(opportunityEvidence, 'the refinance opportunity\'s own id must appear as its own evidence entry');
  assert.ok(opportunityEvidence.label.includes('6.125'));
  assert.equal(opportunityEvidence.observedAt, '2026-08-21T00:00:00.000Z');
  const profileEvidence = action.evidence.find((entry) => entry.id === 'financing-profile-1');
  assert.ok(profileEvidence, 'the financing profile\'s own id must appear as its own evidence entry');
  assert.equal(profileEvidence.observedAt, '2026-08-15T00:00:00.000Z');
  // Identity/decision-lineage fields must be untouched by enrichment.
  assert.equal(action.id, 'ownership-cost-change:change-mortgage-1');
  assert.equal(action.lineageId, 'ownership-cost-change:property-1:MORTGAGE_INTEREST');
});

test('a mortgage cost change with no ready refinance opportunity falls back to the generic financing destination', async () => {
  const actions = await loadOwnershipCostChangeActions(
    'property-1',
    baseStubs({ changes: [mortgageChange()] }),
    NOW,
  );

  assert.equal(actions.length, 1);
  assert.equal(actions[0].primaryCta.href, `/dashboard/properties/property-1/tools/financing`);
  assert.ok(!actions[0].whyItMatters.includes('refinance comparison'));
});

test('a refinance radar state that is not OPEN does not enrich the mortgage change', async () => {
  const actions = await loadOwnershipCostChangeActions(
    'property-1',
    baseStubs({
      changes: [mortgageChange()],
      refinance: readyRefinanceStubs({
        propertyRefinanceRadarState: {
          findUnique: async () => ({
            radarState: 'SUPPRESSED',
            lastRateSnapshot: { date: new Date('2026-08-20T00:00:00.000Z'), source: 'FRED' },
            currentOpportunity: { monthlySavings: 210, breakEvenMonths: 18, marketRate: 6.125 },
          }),
        },
      }),
    }),
    NOW,
  );
  assert.equal(actions[0].primaryCta.href, `/dashboard/properties/property-1/tools/financing`);
});

test('an incomplete mortgage profile does not enrich the mortgage change', async () => {
  const actions = await loadOwnershipCostChangeActions(
    'property-1',
    baseStubs({
      changes: [mortgageChange()],
      refinance: readyRefinanceStubs({
        propertyFinancingProfile: { findUnique: async () => ({ mortgageStatus: 'NO_MORTGAGE' }) },
      }),
    }),
    NOW,
  );
  assert.equal(actions[0].primaryCta.href, `/dashboard/properties/property-1/tools/financing`);
});

test('a non-mortgage cost change (e.g. PROPERTY_TAX) is never enriched, even with a ready refinance opportunity available', async () => {
  const taxChange = {
    id: 'change-tax-1',
    category: 'PROPERTY_TAX',
    amountDeltaCents: 30000,
    recurringDeltaCents: 30000,
    changeReason: 'UNEXPLAINED',
    explanationStatus: 'UNEXPLAINED',
    evidenceJson: {
      materiality: { material: true },
      confidence: 'HIGH',
      explanation: 'Property tax increased.',
      evidence: [{ observationId: 'obs-tax', sourceDomain: 'PROPERTY_TAX', periodEnd: '2026-12-31T23:59:59.999Z' }],
    },
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    toSnapshotId: 'snapshot-2026',
  };
  const actions = await loadOwnershipCostChangeActions(
    'property-1',
    baseStubs({ changes: [taxChange], refinance: readyRefinanceStubs() }),
    NOW,
  );
  assert.equal(actions.length, 1);
  assert.ok(!actions[0].evidence.some((entry) => entry.label.includes('refinance')));
  assert.equal(actions[0].evidence.length, 1);
});

test('a db stub without refinance tables does not throw and simply skips enrichment', async () => {
  const actions = await loadOwnershipCostChangeActions(
    'property-1',
    baseStubs({ changes: [mortgageChange()] }),
    NOW,
  );
  assert.equal(actions.length, 1);
  assert.equal(actions[0].primaryCta.href, `/dashboard/properties/property-1/tools/financing`);
});
