const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  buildOwnershipCostVariability,
  OwnershipCostVariabilityService,
} = require(
  '../../src/services/ownershipCosts/ownershipCostVariability.service.ts',
);

function observedLine(year, amountCents, overrides = {}) {
  return {
    category: 'PROPERTY_TAX',
    subcategory: null,
    annualizedAmountCents: amountCents,
    applicability: 'APPLICABLE',
    evidenceStatus: 'CONFIRMED',
    verificationStatus: 'VERIFIED',
    freshnessStatus: 'CURRENT',
    includedLenses: ['OPERATING_EXPENSE', 'CASH_OUTFLOW'],
    sourceObservation: {
      id: `tax-${year}`,
      periodStart: new Date(`${year}-01-01T00:00:00.000Z`),
      periodEnd: new Date(`${year}-12-31T23:59:59.999Z`),
      temporalKind: year === 2026
        ? 'CURRENT_PERIOD'
        : 'OBSERVED_PAST_PERIOD',
      sourceDomain: 'PROPERTY_TAX',
      sourceEntityType: 'PropertyTaxBillRecord',
      sourceEntityId: `tax-${year}`,
      sourceDocumentId: `document-${year}`,
    },
    ...overrides,
  };
}

function annualSnapshot(year, amountCents, extraLines = [], overrides = {}) {
  return {
    id: `snapshot-${year}`,
    inputFingerprint: `input-${year}`,
    methodVersion: 'ownership-cost-normalization-v1',
    categoryDefinitionVersion: 'ownership-cost-categories-v1',
    basePeriodStart: new Date(`${year}-01-01T00:00:00.000Z`),
    basePeriodEnd: new Date(`${year}-12-31T23:59:59.999Z`),
    computedAt: new Date(`${year}-12-31T23:59:59.999Z`),
    lines: [observedLine(year, amountCents), ...extraLines],
    ...overrides,
  };
}

function forecast(overrides = {}) {
  return {
    propertyId: 'property-1',
    forecastId: 'forecast-1',
    scenario: null,
    selectedLens: 'OPERATING_EXPENSE',
    forecastKind: 'FORWARD_PLANNING_RANGE',
    nominalDollars: true,
    methodVersion: 'ownership-cost-forecast-v1',
    categoryDefinitionVersion: 'ownership-cost-categories-v1',
    baseSnapshot: {
      id: 'snapshot-2026',
      inputFingerprint: 'input-2026',
      periodStart: '2026-01-01T00:00:00.000Z',
      periodEnd: '2026-12-31T23:59:59.999Z',
      annualCents: 270000,
    },
    forecastStart: '2027-01-01T00:00:00.000Z',
    forecastEnd: '2031-12-31T23:59:59.999Z',
    horizonYears: 5,
    stale: { isStale: false, reason: null },
    summary: {
      firstYear: { lowCents: 270000, baseCents: 280000, highCents: 290000 },
      endYear: { lowCents: 280000, baseCents: 300000, highCents: 312000 },
    },
    periods: [],
    drivers: [{
      category: 'PROPERTY_TAX',
      label: 'Property tax',
      baseAnnualCents: 270000,
      lowRate: 0,
      baseRate: 0.03,
      highRate: 0.06,
      rateSource: 'DEFAULT_ASSUMPTION',
      rateSourceLabel: 'Planning assumption',
      annualAdjustmentCents: 0,
      knownEvents: [],
      endRangeCents: {
        lowCents: 280000,
        baseCents: 300000,
        highCents: 312000,
      },
      sensitivityCents: 32000,
    }, {
      category: 'CAPITAL_PROJECT',
      label: 'Capital projects',
      baseAnnualCents: 0,
      lowRate: 0,
      baseRate: 0,
      highRate: 0,
      rateSource: 'DEFAULT_ASSUMPTION',
      rateSourceLabel: 'Known events only',
      annualAdjustmentCents: 0,
      knownEvents: [{
        year: 2029,
        deltaCents: 900000,
        label: 'Planned roof replacement',
        recurring: false,
      }],
      endRangeCents: {
        lowCents: 0,
        baseCents: 0,
        highCents: 0,
      },
      sensitivityCents: 0,
    }],
    overrides: {},
    limitations: [],
    disclaimer: 'Planning only',
    calculationFingerprint: 'forecast-fingerprint',
    ...overrides,
  };
}

function observedWindow() {
  const repair = observedLine(2025, 100000, {
    category: 'CAPITAL_PROJECT',
    subcategory: 'roof',
    sourceObservation: {
      ...observedLine(2025, 100000).sourceObservation,
      id: 'project-2025',
      sourceDomain: 'PROJECT',
      sourceEntityType: 'ProjectRecord',
      sourceEntityId: 'project-2025',
      sourceDocumentId: null,
    },
  });
  return [
    annualSnapshot(2026, 270000),
    annualSnapshot(2025, 300000, [repair]),
    annualSnapshot(2024, 240000),
  ];
}

test('Slice 6 measures dollar variability from three comparable observed periods', () => {
  const model = buildOwnershipCostVariability(
    'property-1',
    observedWindow(),
    forecast(),
    'OPERATING_EXPENSE',
  );

  assert.equal(model.eligibility.eligible, true);
  assert.equal(model.eligibility.comparableObservedPeriods, 3);
  assert.deepEqual(model.eligibility.measuredCategories, ['PROPERTY_TAX']);
  assert.deepEqual(
    model.measured.periods.map((period) => period.recurringCents),
    [240000, 300000, 270000],
  );
  assert.equal(model.measured.recurring.averageAnnualCents, 270000);
  assert.equal(model.measured.recurring.observedLowCents, 240000);
  assert.equal(model.measured.recurring.observedHighCents, 300000);
  assert.equal(model.measured.recurring.standardDeviationCents, 30000);
  assert.equal(model.measured.recurring.maxYearOverYearSwingCents, 60000);
  assert.match(model.measured.recurring.formula, /Sample standard deviation/);
});

test('one-time capital spend is disclosed but excluded from recurring variability', () => {
  const model = buildOwnershipCostVariability(
    'property-1',
    observedWindow(),
    forecast(),
    'CASH_OUTFLOW',
  );

  const capital2025 = model.measured.oneTimeCapital.observedByPeriod
    .find((period) => period.year === 2025);
  assert.equal(capital2025.amountCents, 100000);
  assert.equal(
    model.measured.periods.find((period) => period.year === 2025)
      .recurringCents,
    300000,
  );
  assert.equal(
    model.measured.oneTimeCapital.excludedFromRecurringVariability,
    true,
  );
});

test('synthetic, partial, and unstable history never produces measured variability', () => {
  const synthetic = observedWindow();
  synthetic[1].lines[0].evidenceStatus = 'ESTIMATED';
  assert.equal(buildOwnershipCostVariability(
    'property-1',
    synthetic,
    forecast(),
    'OPERATING_EXPENSE',
  ).eligibility.eligible, false);

  const partial = observedWindow();
  partial[1].lines[0].sourceObservation.periodStart =
    new Date('2025-07-01T00:00:00.000Z');
  assert.equal(buildOwnershipCostVariability(
    'property-1',
    partial,
    forecast(),
    'OPERATING_EXPENSE',
  ).eligibility.eligible, false);

  const unstable = observedWindow();
  unstable[1].categoryDefinitionVersion = 'ownership-cost-categories-v2';
  const unstableModel = buildOwnershipCostVariability(
    'property-1',
    unstable,
    forecast(),
    'OPERATING_EXPENSE',
  );
  assert.equal(unstableModel.eligibility.eligible, false);
  assert.equal(unstableModel.measured.status, 'INSUFFICIENT_HISTORY');
  assert.match(unstableModel.eligibility.reason, /Not enough cost history/);
});

test('scenario planning buffer separates monthly cash from known capital reserve', () => {
  const model = buildOwnershipCostVariability(
    'property-1',
    observedWindow().slice(0, 1),
    forecast(),
    'OPERATING_EXPENSE',
  );

  assert.equal(model.eligibility.eligible, false);
  assert.equal(model.planningBuffer.basis, 'SCENARIO_NOT_MEASURED_VOLATILITY');
  assert.equal(model.planningBuffer.monthlyCashBufferCents, 2667);
  assert.equal(model.planningBuffer.capitalReserveCents, 900000);
  assert.match(model.planningBuffer.nonDuplicationRule, /excludes one-time/);
  assert.equal(model.planningBuffer.monthlyHandoff.enabled, true);
  assert.equal(model.planningBuffer.capitalHandoff.enabled, true);
});

test('planning decision persists the exact non-duplicated amount and returns its handoff', async () => {
  const calls = [];
  const service = new OwnershipCostVariabilityService({
    authorize: async () => {
      calls.push('authorize');
      return true;
    },
    loadSnapshots: async () => {
      calls.push('snapshots');
      return observedWindow();
    },
    loadForecast: async () => {
      calls.push('forecast');
      return forecast();
    },
    persistDecision: async (input) => {
      calls.push(`persist:${input.decisionType}`);
      assert.equal(input.snapshotId, 'snapshot-2026');
      assert.equal(input.payload.amountCents, 2667);
      assert.equal(input.payload.target, 'BUDGET_PLANNER');
      return {
        id: 'decision-1',
        recordedAt: new Date('2026-07-28T12:00:00.000Z'),
      };
    },
  });
  const decision = await service.recordPlanningDecision(
    'property-1',
    'user-1',
    'OPERATING_EXPENSE',
    'MONTHLY_CASH_BUFFER',
  );

  assert.deepEqual(calls, [
    'authorize',
    'snapshots',
    'forecast',
    'persist:MONTHLY_CASH_BUFFER',
  ]);
  assert.equal(decision.amountCents, 2667);
  assert.equal(decision.handoff.target, 'BUDGET_PLANNER');
  assert.match(decision.handoff.href, /ownershipCostMonthlyBufferCents=2667/);
  assert.match(decision.handoff.href, /ownershipCostDecisionId=decision-1/);
});

test('Slice 6 API and UI expose observed eligibility and real planning handoffs', () => {
  const route = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/ownershipCosts.routes.ts'),
    'utf8',
  );
  const controller = fs.readFileSync(
    path.resolve(__dirname, '../../src/controllers/ownershipCosts.controller.ts'),
    'utf8',
  );
  const sourceRepository = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../src/services/ownershipCosts/ownershipCostSourceRepository.ts',
    ),
    'utf8',
  );
  const client = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/ownership-costs/OwnershipCostsClient.tsx',
    ),
    'utf8',
  );
  const budgetPage = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../frontend/src/app/(dashboard)/dashboard/budget/page.tsx',
    ),
    'utf8',
  );
  const reserveClient = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/reserve-fund/ReserveFundClient.tsx',
    ),
    'utf8',
  );
  assert.match(route, /ownership-costs\/variability/);
  assert.match(route, /variability\/decisions/);
  assert.match(route, /requireHouseholdRole\('CONTRIBUTOR'\)/);
  assert.match(controller, /MONTHLY_CASH_BUFFER/);
  assert.match(controller, /CAPITAL_RESERVE/);
  assert.match(sourceRepository, /HomeCapitalTimelineItem/);
  assert.match(sourceRepository, /CAPITAL_TIMELINE:/);
  assert.match(sourceRepository, /FORECAST_EVENT:/);
  assert.match(client, /Not enough cost history to measure variability/);
  assert.match(client, /Scenario planning buffer/);
  assert.match(client, /Send monthly buffer to Budget Planner/);
  assert.match(client, /Send capital need to Reserve Fund/);
  assert.match(budgetPage, /ownershipCostMonthlyBufferCents/);
  assert.match(budgetPage, /excludes known one-time capital needs/);
  assert.match(reserveClient, /ownershipCostCapitalReserveCents/);
  assert.match(reserveClient, /excludes the recurring monthly cash buffer/);
});
