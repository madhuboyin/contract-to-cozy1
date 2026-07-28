const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  OWNERSHIP_COST_ADAPTERS,
  adaptOwnershipCostSources,
  emptyOwnershipCostSourceBundle,
  ownershipCostInputFingerprint,
} = require('../../src/services/ownershipCosts/ownershipCostAdapters.ts');
const {
  buildOwnershipCostSnapshotDraft,
} = require('../../src/services/ownershipCosts/ownershipCostSnapshot.ts');
const {
  OwnershipCostAccessDeniedError,
  OwnershipCostObservationService,
} = require('../../src/services/ownershipCosts/ownershipCostObservation.service.ts');

const asOf = new Date('2026-07-28T12:00:00.000Z');

function input(overrides = {}) {
  return {
    sourceDomain: 'PROPERTY_TAX',
    sourceEntityType: 'PropertyTaxBillRecord',
    sourceEntityId: 'tax-1',
    sourceUpdatedAt: '2026-07-01T00:00:00.000Z',
    category: 'PROPERTY_TAX',
    amountCents: 120000,
    recurrence: 'ANNUAL',
    periodStart: '2026-01-01T00:00:00.000Z',
    periodEnd: '2026-12-31T23:59:59.999Z',
    evidenceStatus: 'OBSERVED',
    verificationStatus: 'VERIFIED',
    freshnessStatus: 'CURRENT',
    ...overrides,
  };
}

test('Slice 2 defines all ten canonical source adapters', () => {
  assert.deepEqual(
    OWNERSHIP_COST_ADAPTERS.map((adapter) => adapter.key),
    [
      'tax',
      'insurance',
      'financing',
      'expense',
      'utility',
      'hoa',
      'maintenance',
      'recurring-service',
      'project',
      'reserve',
    ],
  );
});

test('adapters normalize recurrence and reject unsupported claims', () => {
  const bundle = emptyOwnershipCostSourceBundle();
  bundle.utility.push(input({
    sourceDomain: 'UTILITY',
    sourceEntityType: 'Expense',
    sourceEntityId: 'utility-1',
    category: 'UTILITIES',
    amountCents: 20000,
    recurrence: 'MONTHLY',
  }));
  const [observation] = adaptOwnershipCostSources(bundle, asOf);
  assert.equal(observation.amountCents, 20000);
  assert.equal(observation.annualizedAmountCents, 240000);

  bundle.utility = [input({
    sourceDomain: 'UTILITY',
    sourceEntityType: 'Expense',
    sourceEntityId: 'utility-missing',
    category: 'UTILITIES',
    amountCents: null,
    recurrence: 'MONTHLY',
    evidenceStatus: null,
    missingDependencies: [],
  })];
  assert.throws(
    () => adaptOwnershipCostSources(bundle, asOf),
    /must name at least one dependency/,
  );
});

test('canonical domain observations win over duplicate expense projections', () => {
  const bundle = emptyOwnershipCostSourceBundle();
  bundle.tax.push(input({ dedupeKey: 'PROPERTY_TAX:2026' }));
  bundle.expense.push(input({
    sourceDomain: 'EXPENSE',
    sourceEntityType: 'Expense',
    sourceEntityId: 'expense-tax-1',
    verificationStatus: 'UNVERIFIED',
    dedupeKey: 'PROPERTY_TAX:2026',
  }));

  const observations = adaptOwnershipCostSources(bundle, asOf);
  assert.equal(observations.length, 1);
  assert.equal(observations[0].sourceDomain, 'PROPERTY_TAX');
  assert.equal(observations[0].sourceEntityId, 'tax-1');
});

test('fingerprints and snapshot calculation are deterministic across input order', () => {
  const firstBundle = emptyOwnershipCostSourceBundle();
  firstBundle.tax.push(input());
  firstBundle.insurance.push(input({
    sourceDomain: 'COVERAGE',
    sourceEntityType: 'InsurancePolicyTerm',
    sourceEntityId: 'policy-term-1',
    category: 'INSURANCE',
    amountCents: 240000,
  }));
  const first = adaptOwnershipCostSources(firstBundle, asOf);

  const secondBundle = emptyOwnershipCostSourceBundle();
  secondBundle.insurance.push(firstBundle.insurance[0]);
  secondBundle.tax.push(firstBundle.tax[0]);
  const second = adaptOwnershipCostSources(secondBundle, asOf);

  assert.deepEqual(second, first);
  assert.equal(
    ownershipCostInputFingerprint(second),
    ownershipCostInputFingerprint(first),
  );
  assert.deepEqual(
    buildOwnershipCostSnapshotDraft(second, asOf),
    buildOwnershipCostSnapshotDraft(first, asOf),
  );
});

test('snapshot keeps missing distinct from zero and separates cost lenses', () => {
  const bundle = emptyOwnershipCostSourceBundle();
  bundle.tax.push(input());
  bundle.financing.push(input({
    sourceDomain: 'FINANCING',
    sourceEntityType: 'PropertyFinancingProfile',
    sourceEntityId: 'finance-1',
    category: 'MORTGAGE_PRINCIPAL',
    amountCents: 50000,
    recurrence: 'MONTHLY',
    evidenceStatus: 'CONFIRMED',
  }));
  const snapshot = buildOwnershipCostSnapshotDraft(
    adaptOwnershipCostSources(bundle, asOf),
    asOf,
  );

  assert.ok(snapshot.missingCategories.includes('UTILITIES'));
  assert.equal(snapshot.totalsByLens.OPERATING_EXPENSE, 120000);
  assert.equal(snapshot.totalsByLens.CASH_OUTFLOW, 720000);
  assert.equal(snapshot.totalsByLens.ECONOMIC_COST, 120000);
  assert.equal(snapshot.coverageStatus, 'PARTIAL');
});

test('current snapshot never counts observed past periods as current cost', () => {
  const bundle = emptyOwnershipCostSourceBundle();
  bundle.tax.push(
    input(),
    input({
      sourceEntityId: 'tax-2025',
      amountCents: 90000,
      periodStart: '2025-01-01T00:00:00.000Z',
      periodEnd: '2025-12-31T23:59:59.999Z',
      temporalKind: 'OBSERVED_PAST_PERIOD',
    }),
  );
  const observations = adaptOwnershipCostSources(bundle, asOf);
  const snapshot = buildOwnershipCostSnapshotDraft(observations, asOf);
  assert.equal(observations.length, 2);
  assert.equal(snapshot.lines.length, 1);
  assert.equal(snapshot.totalsByLens.OPERATING_EXPENSE, 120000);
});

test('service authorizes before loading sources or persisting', async () => {
  let loaded = false;
  let persisted = false;
  const service = new OwnershipCostObservationService({
    authorize: async () => false,
    loadSources: async () => {
      loaded = true;
      return emptyOwnershipCostSourceBundle();
    },
    persist: async () => {
      persisted = true;
      throw new Error('must not persist');
    },
    now: () => asOf,
  });

  await assert.rejects(
    service.refresh('property-1', 'user-1'),
    OwnershipCostAccessDeniedError,
  );
  assert.equal(loaded, false);
  assert.equal(persisted, false);
});

test('authorized service passes deterministic observations to persistence', async () => {
  const bundle = emptyOwnershipCostSourceBundle();
  bundle.tax.push(input());
  let captured;
  const service = new OwnershipCostObservationService({
    authorize: async () => true,
    loadSources: async () => bundle,
    persist: async (value) => {
      captured = value;
      return {
        propertyId: value.propertyId,
        definitionVersion: 'ownership-cost-v1',
        adapterVersion: 'ownership-cost-adapters-v1',
        inputFingerprint: value.snapshot.inputFingerprint,
        snapshotId: 'snapshot-1',
        coverageStatus: value.snapshot.coverageStatus,
        observationCount: value.observations.length,
        missingCategories: value.snapshot.missingCategories,
        totalsByLens: value.snapshot.totalsByLens,
        reusedSnapshot: false,
      };
    },
    now: () => asOf,
  });

  const result = await service.refresh('property-1', 'user-1');
  assert.equal(result.snapshotId, 'snapshot-1');
  assert.equal(captured.observations[0].sourceEntityId, 'tax-1');
  assert.equal(
    captured.snapshot.inputFingerprint,
    ownershipCostInputFingerprint(captured.observations),
  );
});

test('Prisma schema contains source-referenced Slice 2 records without a migration', () => {
  const schema = fs.readFileSync(
    path.resolve(__dirname, '../../prisma/schema.prisma'),
    'utf8',
  );
  for (const model of [
    'OwnershipCostDefinition',
    'OwnershipCostAdapterRun',
    'OwnershipCostObservation',
    'OwnershipCostSnapshot',
    'OwnershipCostSnapshotLine',
    'OwnershipCostScenario',
    'OwnershipCostForecast',
    'OwnershipCostForecastLine',
    'OwnershipCostChange',
    'OwnershipCostDecision',
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  assert.match(schema, /sourceEntityType\s+String\?/);
  assert.match(schema, /sourceEntityId\s+String\?/);
  assert.match(schema, /sourceFingerprint\s+String/);
  assert.match(schema, /correctionOfId\s+String\?/);

  const migrationRoot = path.resolve(__dirname, '../../prisma/migrations');
  const ownershipMigrations = fs.existsSync(migrationRoot)
    ? fs.readdirSync(migrationRoot).filter((name) =>
      name.toLowerCase().includes('ownership_cost'))
    : [];
  assert.deepEqual(ownershipMigrations, []);
});
