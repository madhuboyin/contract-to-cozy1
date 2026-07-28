const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  buildOwnershipCostReadModel,
  OwnershipCostReadModelService,
} = require('../../src/services/ownershipCosts/ownershipCostReadModel.service.ts');

function line(overrides) {
  return {
    category: 'PROPERTY_TAX',
    subcategory: null,
    amountCents: 240000,
    annualizedAmountCents: 240000,
    applicability: 'APPLICABLE',
    evidenceStatus: 'CONFIRMED',
    verificationStatus: 'VERIFIED',
    freshnessStatus: 'CURRENT',
    includedLenses: ['OPERATING_EXPENSE', 'CASH_OUTFLOW', 'ECONOMIC_COST'],
    sourceObservation: {
      sourceDomain: 'PROPERTY_TAX',
      sourceEntityType: 'PropertyTaxBillRecord',
      sourceEntityId: 'tax-1',
      sourceDocumentId: 'document-1',
      periodStart: new Date('2026-01-01T00:00:00.000Z'),
      periodEnd: new Date('2026-12-31T23:59:59.999Z'),
      confidence: 'HIGH',
      assumptionsJson: [],
      missingDependencies: [],
    },
    ...overrides,
  };
}

function snapshot(lines) {
  return {
    id: 'snapshot-1',
    methodVersion: 'ownership-cost-method-v1',
    categoryDefinitionVersion: 'ownership-cost-categories-v1',
    basePeriodStart: new Date('2026-01-01T00:00:00.000Z'),
    basePeriodEnd: new Date('2026-12-31T23:59:59.999Z'),
    coverageStatus: 'PARTIAL',
    computedAt: new Date('2026-07-28T12:00:00.000Z'),
    property: {
      address: '1 Main Street',
      city: 'Raleigh',
      state: 'NC',
      zipCode: '27601',
    },
    lines,
  };
}

test('Slice 3 separates confirmed, estimated, missing, and not-applicable amounts', () => {
  const model = buildOwnershipCostReadModel(
    'property-1',
    snapshot([
      line({}),
      line({
        category: 'INSURANCE',
        amountCents: 180000,
        annualizedAmountCents: 180000,
        evidenceStatus: 'ESTIMATED',
        verificationStatus: 'UNVERIFIED',
        sourceObservation: {
          ...line({}).sourceObservation,
          sourceDomain: 'COVERAGE',
          sourceEntityType: 'InsurancePolicyTerm',
          sourceEntityId: 'policy-1',
          sourceDocumentId: null,
          confidence: 'LOW',
        },
      }),
      line({
        category: 'HOA',
        amountCents: null,
        annualizedAmountCents: null,
        applicability: 'NOT_APPLICABLE',
        evidenceStatus: null,
        sourceObservation: {
          ...line({}).sourceObservation,
          sourceDomain: 'HOA',
          sourceEntityType: 'HoaAssociation',
          sourceEntityId: 'hoa-1',
          sourceDocumentId: null,
        },
      }),
    ]),
    'OPERATING_EXPENSE',
  );

  assert.equal(model.snapshot.annualTotalCents, 420000);
  assert.equal(model.snapshot.confirmedAnnualCents, 240000);
  assert.equal(model.snapshot.estimatedAnnualCents, 180000);
  assert.equal(model.coverage.confirmedCategoryCount, 1);
  assert.equal(model.coverage.estimatedCategoryCount, 1);
  assert.equal(model.coverage.notApplicableCategoryCount, 1);
  assert.ok(model.coverage.missingCategoryCount > 0);
  assert.equal(
    model.categories.find((item) => item.category === 'UTILITIES').amountCents,
    null,
  );
  assert.equal(
    model.categories.find((item) => item.category === 'HOA').amountKind,
    'NOT_APPLICABLE',
  );
  assert.equal(model.rankedAction.kind, 'ADD_MISSING');
  assert.match(model.rankedAction.href, /dashboard\/expenses/);
});

test('operating expense excludes principal while cash outflow includes it', () => {
  const persisted = snapshot([
    line({}),
    line({
      category: 'MORTGAGE_PRINCIPAL',
      amountCents: 1200000,
      annualizedAmountCents: 1200000,
      evidenceStatus: 'CONFIRMED',
      sourceObservation: {
        ...line({}).sourceObservation,
        sourceDomain: 'FINANCING',
        sourceEntityType: 'PropertyFinancingProfile',
        sourceEntityId: 'financing-1',
        sourceDocumentId: null,
      },
    }),
  ]);
  const operating = buildOwnershipCostReadModel(
    'property-1',
    persisted,
    'OPERATING_EXPENSE',
  );
  const cash = buildOwnershipCostReadModel(
    'property-1',
    persisted,
    'CASH_OUTFLOW',
  );

  assert.equal(operating.snapshot.annualTotalCents, 240000);
  assert.equal(cash.snapshot.annualTotalCents, 1440000);
  assert.equal(
    operating.categories.find(
      (item) => item.category === 'MORTGAGE_PRINCIPAL',
    ).includedInSelectedLens,
    false,
  );
});

test('read service authorizes first and falls back to last-known-good snapshot', async () => {
  const calls = [];
  const service = new OwnershipCostReadModelService({
    authorize: async () => {
      calls.push('authorize');
      return true;
    },
    refresh: async () => {
      calls.push('refresh');
      throw new Error('coverage source timeout');
    },
    loadSnapshot: async () => {
      calls.push('load');
      return snapshot([line({})]);
    },
  });

  const result = await service.getCurrent(
    'property-1',
    'user-1',
    'OPERATING_EXPENSE',
  );
  assert.deepEqual(calls, ['authorize', 'refresh', 'load']);
  assert.equal(result.snapshot.lastKnownGood, true);
  assert.equal(result.stale.isStale, true);
  assert.match(result.stale.reason, /coverage source timeout/);
});

test('read service does not load or refresh an unauthorized property', async () => {
  const service = new OwnershipCostReadModelService({
    authorize: async () => false,
    refresh: async () => {
      assert.fail('refresh should not run');
    },
    loadSnapshot: async () => {
      assert.fail('load should not run');
    },
  });

  await assert.rejects(
    () => service.getCurrent(
      'other-property',
      'user-1',
      'OPERATING_EXPENSE',
    ),
    /access denied/i,
  );
});

test('Slice 3 route exposes read and explicit recalculation endpoints', () => {
  const route = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/ownershipCosts.routes.ts'),
    'utf8',
  );
  const controller = fs.readFileSync(
    path.resolve(__dirname, '../../src/controllers/ownershipCosts.controller.ts'),
    'utf8',
  );
  assert.match(route, /router\.get\(/);
  assert.match(route, /router\.post\(/);
  assert.match(route, /ownership-costs\/recalculate/);
  assert.match(route, /requireHouseholdRole\('CONTRIBUTOR'\)/);
  assert.match(controller, /z\.enum\(OWNERSHIP_COST_CURRENT_LENSES\)/);
  assert.match(controller, /lastKnownGood/);
});

test('canonical current-cost UI consumes the read model and exposes accessible evidence', () => {
  const client = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/ownership-costs/OwnershipCostsClient.tsx',
    ),
    'utf8',
  );
  const api = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/ownership-costs/ownershipCostsApi.ts',
    ),
    'utf8',
  );

  assert.doesNotMatch(client, /getTrueCostOwnership/);
  assert.match(client, /OPERATING_EXPENSE/);
  assert.match(client, /CASH_OUTFLOW/);
  assert.match(client, /Where the numbers come from/);
  assert.match(client, /<caption className="sr-only">/);
  assert.match(client, /correction\.href/);
  assert.match(client, /readiness_/);
  assert.match(api, /endpoint\(propertyId, lens, '\/recalculate'\)/);
});
