import type { Page } from '@playwright/test';

export const PROPERTY_ID = 'ownership-cost-acceptance-property';
export const VIEWS = [
  ['current', 'Current cost and completeness'],
  ['changes', 'What changed'],
  ['forecast', 'What may change'],
  ['variability', 'Plan for variability'],
] as const;

const now = '2026-07-28T12:00:00.000Z';
const categories = [
  ['PROPERTY_TAX', 'Property tax', 720000],
  ['INSURANCE', 'Home insurance', 240000],
  ['UTILITIES', 'Utilities', 360000],
  ['ROUTINE_MAINTENANCE', 'Routine maintenance', 300000],
] as const;

const current = {
  propertyId: PROPERTY_ID,
  propertyLabel: '123 Acceptance Lane',
  definitionVersion: 'ownership-cost-definition-v1',
  methodVersion: 'ownership-cost-snapshot-v1',
  categoryDefinitionVersion: 'ownership-cost-categories-v1',
  selectedLens: 'OPERATING_EXPENSE',
  snapshot: {
    id: 'snapshot-current',
    calculatedAt: now,
    basePeriodStart: '2026-01-01T00:00:00.000Z',
    basePeriodEnd: '2026-12-31T23:59:59.999Z',
    coverageStatus: 'CREDIBLE',
    annualTotalCents: 1620000,
    monthlyTotalCents: 135000,
    confirmedAnnualCents: 1620000,
    estimatedAnnualCents: 0,
    materialMissingCategory: null,
    lastKnownGood: false,
  },
  coverage: {
    includedCategoryCount: 4,
    confirmedCategoryCount: 4,
    estimatedCategoryCount: 0,
    missingCategoryCount: 0,
    notApplicableCategoryCount: 0,
  },
  categories: categories.map(([category, label, amountCents]) => ({
    category,
    label,
    amountCents,
    monthlyAmountCents: Math.round(amountCents / 12),
    applicability: 'APPLICABLE',
    amountKind: 'CONFIRMED',
    includedInSelectedLens: true,
    evidenceStatus: 'CONFIRMED',
    verificationStatus: 'VERIFIED',
    freshnessStatus: 'CURRENT',
    sourceDomain: category,
    sourceEntityType: 'AcceptanceFixture',
    sourceEntityId: `fixture-${category}`,
    sourceDocumentId: null,
    periodStart: '2026-01-01T00:00:00.000Z',
    periodEnd: '2026-12-31T23:59:59.999Z',
    confidence: 'HIGH',
    assumptions: [],
    missingDependencies: [],
    correction: { href: '#fixture-correction', label: `Review ${label.toLowerCase()}` },
  })),
  evidenceSummary: {
    confirmedAnnualCents: 1620000,
    estimatedAnnualCents: 0,
    staleCategoryCount: 0,
    pendingConfirmationCount: 0,
  },
  rankedAction: {
    kind: 'NONE',
    title: 'Current evidence is complete',
    detail: 'Every included category has current confirmed evidence.',
    href: null,
    label: null,
    category: null,
  },
  stale: { isStale: false, reason: null },
  limitations: ['Forecasts are planning ranges, not guarantees.'],
};

const decisions = {
  contractVersion: 'ownership-cost-decision-read-v1',
  decisions: [],
  revisitEvents: [],
  notificationPreferences: {
    MATERIAL_CHANGE: true,
    UPCOMING_EVENT: true,
    STALE_SCENARIO: true,
    MISSING_HIGH_IMPACT_FACT: true,
  },
  lifecycleRule: 'Engagement is distinct from resolution.',
};

const changes = {
  propertyId: PROPERTY_ID,
  selectedLens: 'OPERATING_EXPENSE',
  comparable: true,
  reason: null,
  comparison: {
    fromSnapshotId: 'snapshot-prior',
    toSnapshotId: 'snapshot-current',
    priorPeriodStart: '2025-01-01T00:00:00.000Z',
    priorPeriodEnd: '2025-12-31T23:59:59.999Z',
    currentPeriodStart: '2026-01-01T00:00:00.000Z',
    currentPeriodEnd: '2026-12-31T23:59:59.999Z',
  },
  totalRecurringDeltaCents: 120000,
  totalOneTimeDeltaCents: 0,
  changes: [{
    id: 'change-tax',
    category: 'PROPERTY_TAX',
    label: 'Property tax',
    fromSnapshotId: 'snapshot-prior',
    toSnapshotId: 'snapshot-current',
    priorPeriod: { start: '2025-01-01T00:00:00.000Z', end: '2025-12-31T23:59:59.999Z' },
    currentPeriod: { start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.999Z' },
    priorAnnualCents: 600000,
    currentAnnualCents: 720000,
    deltaCents: 120000,
    deltaPercent: 0.2,
    impact: 'RECURRING',
    recurringDeltaCents: 120000,
    reason: 'ASSESSMENT',
    explanationStatus: 'SUPPORTED',
    explanation: 'The confirmed assessed amount increased for the current period.',
    evidence: [],
    confidence: 'HIGH',
    materiality: { material: true, absoluteThresholdCents: 5000, percentageThreshold: 0.05 },
    rankScore: 1,
    action: { href: '#review-tax', label: 'Review property tax', actionable: true },
  }],
  limitations: ['Only comparable observed periods are included.'],
};

const forecast = {
  propertyId: PROPERTY_ID,
  forecastId: 'forecast-1',
  scenario: null,
  selectedLens: 'OPERATING_EXPENSE',
  forecastKind: 'FORWARD_PLANNING_RANGE',
  nominalDollars: true,
  methodVersion: 'ownership-cost-forecast-v1',
  categoryDefinitionVersion: 'ownership-cost-categories-v1',
  baseSnapshot: {
    id: 'snapshot-current',
    inputFingerprint: 'a'.repeat(64),
    periodStart: '2026-01-01T00:00:00.000Z',
    periodEnd: '2026-12-31T23:59:59.999Z',
    annualCents: 1620000,
  },
  forecastStart: '2027-01-01T00:00:00.000Z',
  forecastEnd: '2031-12-31T23:59:59.999Z',
  horizonYears: 5,
  stale: { isStale: false, reason: null },
  summary: {
    firstYear: { lowCents: 1620000, baseCents: 1660000, highCents: 1700000 },
    endYear: { lowCents: 1700000, baseCents: 1820000, highCents: 1960000 },
  },
  periods: [1, 2, 3, 4, 5].map((year) => ({
    year,
    periodStart: `${2026 + year}-01-01T00:00:00.000Z`,
    periodEnd: `${2026 + year}-12-31T23:59:59.999Z`,
    lowCents: 1620000 + year * 16000,
    baseCents: 1620000 + year * 40000,
    highCents: 1620000 + year * 68000,
  })),
  drivers: [{
    category: 'PROPERTY_TAX',
    label: 'Property tax',
    baseAnnualCents: 720000,
    lowRate: 0.01,
    baseRate: 0.03,
    highRate: 0.05,
    rateSource: 'SOURCE_BACKED',
    rateSourceLabel: 'Reviewed planning assumption',
    annualAdjustmentCents: 0,
    knownEvents: [],
    endRangeCents: { lowCents: 756000, baseCents: 835000, highCents: 919000 },
    sensitivityCents: 163000,
  }],
  overrides: {},
  limitations: ['Planning ranges do not guarantee future costs.'],
  disclaimer: 'Use this range for planning, not as a prediction.',
  calculationFingerprint: 'b'.repeat(64),
};

const variability = {
  propertyId: PROPERTY_ID,
  selectedLens: 'OPERATING_EXPENSE',
  eligibility: {
    eligible: true,
    requiredComparablePeriods: 3,
    comparableObservedPeriods: 3,
    reason: 'Three comparable observed periods are available.',
    stableMethodVersion: 'ownership-cost-snapshot-v1',
    stableCategoryDefinitionVersion: 'ownership-cost-categories-v1',
    measuredCategories: ['PROPERTY_TAX', 'INSURANCE', 'UTILITIES'],
    excludedCategories: [],
  },
  measured: {
    status: 'MEASURED_OBSERVED',
    currency: 'USD',
    periods: [2024, 2025, 2026].map((year, index) => ({
      snapshotId: `snapshot-${year}`,
      year,
      periodStart: `${year}-01-01T00:00:00.000Z`,
      periodEnd: `${year}-12-31T23:59:59.999Z`,
      recurringCents: 1500000 + index * 60000,
      oneTimeCents: 0,
    })),
    recurring: {
      averageAnnualCents: 1560000,
      observedLowCents: 1500000,
      observedHighCents: 1620000,
      standardDeviationCents: 48990,
      maxYearOverYearSwingCents: 60000,
      variabilityRatio: 0.031,
      formula: 'Observed standard deviation divided by average recurring annual cost.',
    },
    categoryBreakdown: [],
    oneTimeCapital: { excludedFromRecurringVariability: true, observedByPeriod: [] },
  },
  planningBuffer: {
    basis: 'SCENARIO_NOT_MEASURED_VOLATILITY',
    forecastId: 'forecast-1',
    horizonYears: 5,
    monthlyCashBufferCents: 12500,
    capitalReserveCents: 500000,
    monthlyMethod: 'Scenario high minus base divided by twelve.',
    capitalMethod: 'Known capital needs remain separate.',
    nonDuplicationRule: 'Monthly cash and capital reserve amounts do not overlap.',
    monthlyHandoff: { target: 'BUDGET_PLANNER', enabled: true, label: 'Send to Budget Planner' },
    capitalHandoff: { target: 'RESERVE_FUND', enabled: true, label: 'Send to Reserve Fund' },
  },
  limitations: ['Observed variability is not a forecast.'],
};

export async function installOwnershipCostRoutes(page: Page) {
  await page.route('**/context/feature-requirements/evaluate', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          featureKey: 'OWNERSHIP_COSTS',
          operationKey: 'VIEW_ANALYSIS',
          policyVersion: 'acceptance-v1',
          contextVersion: 'acceptance-context-v1',
          readiness: 'READY',
          canExecute: true,
          requirements: [],
        },
      },
    }));
  await page.route('**/ownership-costs/recalculate?*', (route) =>
    route.fulfill({ json: { ownershipCosts: current } }));
  await page.route('**/ownership-costs/changes?*', (route) =>
    route.fulfill({ json: { ownershipCostChanges: changes } }));
  await page.route('**/ownership-costs/decisions', (route) =>
    route.fulfill({ json: { ownershipCostDecisions: decisions } }));
  await page.route('**/ownership-costs/forecast?*', (route) =>
    route.fulfill({ json: { ownershipCostForecast: forecast } }));
  await page.route('**/ownership-costs/scenarios?*', (route) =>
    route.fulfill({ json: { ownershipCostScenarios: [] } }));
  await page.route('**/ownership-costs/variability?*', (route) =>
    route.fulfill({ json: { ownershipCostVariability: variability } }));
  await page.route('**/ownership-costs?*', (route) =>
    route.fulfill({ json: { ownershipCosts: current } }));
}
