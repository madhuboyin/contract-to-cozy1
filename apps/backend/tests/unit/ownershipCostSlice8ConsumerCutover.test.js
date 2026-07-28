const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  OwnershipCostConsumerProjectionService,
} = require(
  '../../src/services/ownershipCosts/ownershipCostConsumerProjection.service.ts',
);

const repoRoot = path.resolve(__dirname, '../../../..');
const read = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

function current(overrides = {}) {
  return {
    propertyId: 'property-1',
    propertyLabel: '1 Main St',
    definitionVersion: 'ownership-cost-v1',
    methodVersion: 'ownership-cost-normalization-v1',
    categoryDefinitionVersion: 'ownership-cost-categories-v1',
    selectedLens: 'OPERATING_EXPENSE',
    snapshot: {
      id: 'snapshot-1',
      calculatedAt: '2026-07-28T12:00:00.000Z',
      basePeriodStart: '2026-01-01T00:00:00.000Z',
      basePeriodEnd: '2026-12-31T23:59:59.999Z',
      coverageStatus: 'CREDIBLE',
      annualTotalCents: 600000,
      monthlyTotalCents: 50000,
      confirmedAnnualCents: 600000,
      estimatedAnnualCents: 0,
      materialMissingCategory: null,
      lastKnownGood: false,
    },
    coverage: {
      includedCategoryCount: 2,
      confirmedCategoryCount: 2,
      estimatedCategoryCount: 0,
      missingCategoryCount: 0,
      notApplicableCategoryCount: 0,
    },
    categories: [{
      category: 'PROPERTY_TAX',
      label: 'Property tax',
      amountCents: 400000,
      includedInSelectedLens: true,
    }, {
      category: 'MORTGAGE_PRINCIPAL',
      label: 'Mortgage principal',
      amountCents: 1200000,
      includedInSelectedLens: false,
    }, {
      category: 'UTILITIES',
      label: 'Utilities',
      amountCents: 200000,
      includedInSelectedLens: true,
    }],
    evidenceSummary: {
      confirmedAnnualCents: 600000,
      estimatedAnnualCents: 0,
      staleCategoryCount: 0,
      pendingConfirmationCount: 0,
    },
    rankedAction: {
      kind: 'NONE',
      title: 'No action',
      detail: '',
      href: null,
      label: null,
      category: null,
    },
    stale: { isStale: false, reason: null },
    limitations: ['Missing is not zero.'],
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
      id: 'snapshot-1',
      inputFingerprint: 'input-1',
      periodStart: '2026-01-01T00:00:00.000Z',
      periodEnd: '2026-12-31T23:59:59.999Z',
      annualCents: 600000,
    },
    forecastStart: '2027-01-01T00:00:00.000Z',
    forecastEnd: '2028-12-31T23:59:59.999Z',
    horizonYears: 2,
    stale: { isStale: false, reason: null },
    summary: {
      firstYear: { lowCents: 600000, baseCents: 620000, highCents: 650000 },
      endYear: { lowCents: 610000, baseCents: 640000, highCents: 690000 },
    },
    periods: [{
      year: 2027,
      periodStart: '2027-01-01T00:00:00.000Z',
      periodEnd: '2027-12-31T23:59:59.999Z',
      lowCents: 600000,
      baseCents: 620000,
      highCents: 650000,
    }, {
      year: 2028,
      periodStart: '2028-01-01T00:00:00.000Z',
      periodEnd: '2028-12-31T23:59:59.999Z',
      lowCents: 610000,
      baseCents: 640000,
      highCents: 690000,
    }],
    drivers: [],
    overrides: {},
    limitations: ['Planning range.'],
    disclaimer: 'Planning only.',
    calculationFingerprint: 'forecast-fingerprint',
    ...overrides,
  };
}

test('Slice 8 supplies one versioned, lens-locked projection to downstream consumers', async () => {
  const service = new OwnershipCostConsumerProjectionService({
    loadCurrent: async () => current(),
    loadForecast: async () => forecast(),
  });
  const projection = await service.getProjection({
    propertyId: 'property-1',
    userId: 'user-1',
    lens: 'OPERATING_EXPENSE',
    horizonYears: 2,
  });

  assert.equal(projection.contractVersion, 'ownership-cost-consumer-v1');
  assert.equal(projection.lens, 'OPERATING_EXPENSE');
  assert.equal(projection.snapshot.id, 'snapshot-1');
  assert.equal(projection.forecast.id, 'forecast-1');
  assert.equal(projection.forecast.calculationFingerprint, 'forecast-fingerprint');
  assert.equal(projection.currentAnnualDollars, 6000);
  assert.deepEqual(
    projection.forwardAnnualDollars.map((period) => period.base),
    [6200, 6400],
  );
  assert.equal(projection.categoryAnnualDollars.PROPERTY_TAX, 4000);
  assert.equal(projection.categoryAnnualDollars.MORTGAGE_PRINCIPAL, undefined);
  assert.match(projection.limitations.at(-1), /must not reinterpret/i);
});

test('consumer projection fails closed when snapshot or lens changes mid-read', async () => {
  const snapshotMismatch = new OwnershipCostConsumerProjectionService({
    loadCurrent: async () => current(),
    loadForecast: async () => forecast({
      baseSnapshot: { ...forecast().baseSnapshot, id: 'snapshot-2' },
    }),
  });
  await assert.rejects(
    snapshotMismatch.getProjection({
      propertyId: 'property-1',
      userId: 'user-1',
      lens: 'OPERATING_EXPENSE',
      horizonYears: 2,
    }),
    /snapshot changed/i,
  );
});

test('Break-Even and Sell Hold Rent retain canonical ownership-cost versions', () => {
  for (const servicePath of [
    'apps/backend/src/services/breakEven.service.ts',
    'apps/backend/src/services/sellHoldRent.service.ts',
  ]) {
    const service = read(servicePath);
    assert.match(service, /ownershipCostConsumerProjectionService/);
    assert.match(service, /ownershipCostContext/);
    assert.match(service, /lens: 'OPERATING_EXPENSE'/);
    assert.match(service, /calculationFingerprint/);
    assert.doesNotMatch(
      service,
      /HomeCostGrowthService|TrueCostOwnershipService/,
    );
  }
});

test('legacy APIs are retired without exposing contradictory totals', () => {
  const routes = read('apps/backend/src/routes/ownershipCosts.routes.ts');
  assert.match(routes, /OWNERSHIP_COST_LEGACY_API_RETIRED/);
  assert.ok(routes.includes('status(410)'));
  for (const legacy of [
    'true-cost',
    'cost-explainer',
    'cost-growth',
    'cost-volatility',
  ]) {
    assert.match(routes, new RegExp(`'${legacy}'`));
  }
  for (const removed of [
    'apps/backend/src/services/trueCostOwnership.service.ts',
    'apps/backend/src/services/homeCostGrowth.service.ts',
    'apps/backend/src/services/costExplainer.service.ts',
    'apps/backend/src/services/costVolatility.service.ts',
  ]) {
    assert.equal(fs.existsSync(path.join(repoRoot, removed)), false, removed);
  }
});

test('legacy browser URLs only redirect and canonical navigation has no dead peer entries', () => {
  const routes = {
    'true-cost': 'current',
    'cost-explainer': 'changes',
    'cost-growth': 'forecast',
    'cost-volatility': 'variability',
  };
  for (const [legacy, view] of Object.entries(routes)) {
    const page = read(
      `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/${legacy}/page.tsx`,
    );
    assert.match(page, new RegExp(`LegacyOwnershipCostsViewRedirect view="${view}"`));
    const directory = path.join(
      repoRoot,
      `apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/${legacy}`,
    );
    assert.deepEqual(fs.readdirSync(directory), ['page.tsx']);
  }

  const icons = read('apps/frontend/src/lib/icons/toolIcons.ts');
  const mobile = read(
    'apps/frontend/src/components/mobile/dashboard/mobileToolCatalog.ts',
  );
  assert.doesNotMatch(icons, /'true-cost'|'cost-growth'|'cost-explainer'|'cost-volatility'/);
  assert.doesNotMatch(mobile, /true-cost|cost-growth|cost-explainer|cost-volatility/);
});
