const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  PropertyTaxAppealReadinessService,
} = require('../../src/services/propertyTax/propertyTaxAppealReadiness.service');

const reviewedProfile = {
  id: 'profile-1',
  title: 'Reviewed Bronx rules',
  version: 1,
  reviewedAt: '2026-07-27T12:00:00.000Z',
  expiresAt: '2027-01-14T23:59:59.000Z',
  assessmentRatio: 0.06,
  appealGrounds: {
    outcomePredictionAllowed: false,
    grounds: [
      {
        code: 'ASSESSED_VALUE',
        label: 'Assessed value or overvaluation',
        formCode: 'TC108',
        requirements: {
          canonicalFields: [
            'totalAssessedValue',
            'valuationDate',
            'classification',
          ],
          assessmentRatioRequired: true,
          minimumQualifiedComparables: 3,
          comparableWindowDays: 365,
        },
      },
      {
        code: 'TAX_CLASS',
        label: 'Incorrect tax class',
        formCode: 'TC106',
        requirements: {
          canonicalFields: ['classification'],
        },
      },
      {
        code: 'EXEMPTION',
        label: 'Exemption decision',
        formCode: 'TC106',
        requirements: {
          acceptedDecisionTypes: ['DENIED', 'REVOKED', 'REDUCED', 'OMITTED'],
        },
      },
    ],
  },
};

function known(value) {
  return { state: 'KNOWN', value };
}

function center(overrides = {}) {
  return {
    latestTaxYear: 2027,
    parcel: {
      fields: {
        parcelId: known('parcel-1'),
        ...(overrides.parcel ?? {}),
      },
    },
    assessment: {
      fields: {
        valuationDate: known('2026-01-05T05:00:00.000Z'),
        classification: known('1'),
        totalAssessedValue: known(30000),
        taxableValue: known(28000),
        assessmentRatio: { state: 'UNKNOWN', value: null },
        ...(overrides.assessment ?? {}),
      },
    },
    bill: {
      fields: {
        effectiveTaxRate: known(0.2),
        billAmount: known(5600),
        ...(overrides.bill ?? {}),
      },
    },
    conflicts: overrides.conflicts ?? [],
  };
}

function rules(result = {}) {
  return {
    async getForProperty() {
      return {
        coverage: 'REVIEWED',
        reason: null,
        profile: reviewedProfile,
        ...result,
      };
    },
  };
}

function comparable(id, salePrice) {
  return {
    id,
    comparableKey: id,
    address: `${id} Main Street`,
    saleDate: new Date('2025-11-01T05:00:00.000Z'),
    salePrice,
    propertyClass: '1',
    sourceUrl: `https://example.gov/sales/${id}`,
    sourceDocumentId: null,
    timeAdjustment: 0,
    conditionAdjustment: 0,
    sizeAdjustment: 0,
    otherAdjustment: 0,
    adjustmentRationale: null,
  };
}

function database({ evidence = [], comparables = [] } = {}) {
  return {
    propertyTaxAppealEvidence: {
      async findMany() {
        return evidence;
      },
    },
    propertyTaxAppealComparable: {
      async findMany() {
        return comparables;
      },
    },
  };
}

test('appeal readiness fails closed when no reviewed jurisdiction rule applies', async () => {
  const service = new PropertyTaxAppealReadinessService(
    database(),
    rules({
      coverage: 'UNAVAILABLE',
      reason: 'No reviewed release',
      profile: null,
    }),
    { async getCenter() { return center(); } },
  );

  const result = await service.evaluate(
    'property-1',
    'user-1',
    'ASSESSED_VALUE',
  );

  assert.equal(result.status, 'NOT_COVERED');
  assert.equal(result.taxAtStake, null);
  assert.deepEqual(result.reviewedGrounds, []);
});

test('an unreviewed ground returns no supported ground instead of generic advice', async () => {
  const service = new PropertyTaxAppealReadinessService(
    database(),
    rules(),
    { async getCenter() { return center(); } },
  );

  const result = await service.evaluate(
    'property-1',
    'user-1',
    'OTHER',
  );

  assert.equal(result.status, 'NO_SUPPORTED_GROUND');
  assert.match(result.reason, /does not support/);
});

test('assessed-value readiness reports exact evidence gaps', async () => {
  const service = new PropertyTaxAppealReadinessService(
    database({
      comparables: [comparable('comp-1', 400000)],
    }),
    rules(),
    {
      async getCenter() {
        return center({
          assessment: {
            valuationDate: { state: 'UNKNOWN', value: null },
          },
          bill: {
            effectiveTaxRate: { state: 'UNKNOWN', value: null },
            billAmount: { state: 'UNKNOWN', value: null },
          },
        });
      },
    },
  );

  const result = await service.evaluate(
    'property-1',
    'user-1',
    'ASSESSED_VALUE',
  );

  assert.equal(result.status, 'NOT_READY');
  assert.ok(result.gaps.some((gap) => gap.includes('valuationDate')));
  assert.ok(result.gaps.some((gap) => gap.includes('3 more')));
  assert.ok(result.gaps.some((gap) => gap.includes('effective tax rate')));
  assert.equal(result.taxAtStake, null);
});

test('qualified comparable evidence produces readiness and a bounded tax-at-stake range', async () => {
  const service = new PropertyTaxAppealReadinessService(
    database({
      comparables: [
        comparable('comp-1', 400000),
        comparable('comp-2', 420000),
        comparable('comp-3', 440000),
      ],
    }),
    rules(),
    { async getCenter() { return center(); } },
  );

  const result = await service.evaluate(
    'property-1',
    'user-1',
    'ASSESSED_VALUE',
    new Date('2026-07-27T12:00:00.000Z'),
  );

  assert.equal(result.status, 'READY');
  assert.equal(result.gaps.length, 0);
  assert.ok(result.comparables.every((item) =>
    item.qualification === 'QUALIFIED'
  ));
  assert.deepEqual(
    { low: result.taxAtStake.low, high: result.taxAtStake.high },
    { low: 720, high: 1200 },
  );
  assert.equal('probability' in result, false);
  assert.match(result.professionalBoundary, /does not predict success/);
});

test('complete evidence with no indicated reduction returns no supported ground', async () => {
  const service = new PropertyTaxAppealReadinessService(
    database({
      comparables: [
        comparable('comp-1', 500000),
        comparable('comp-2', 520000),
        comparable('comp-3', 540000),
      ],
    }),
    rules(),
    { async getCenter() { return center(); } },
  );

  const result = await service.evaluate(
    'property-1',
    'user-1',
    'ASSESSED_VALUE',
  );

  assert.equal(result.status, 'NO_SUPPORTED_GROUND');
  assert.equal(result.taxAtStake.high, 0);
  assert.match(result.reason, /does not indicate/);
});

test('readiness requires an open reviewed filing window', async () => {
  const service = new PropertyTaxAppealReadinessService(
    database({
      comparables: [
        comparable('comp-1', 400000),
        comparable('comp-2', 420000),
        comparable('comp-3', 440000),
      ],
    }),
    rules({
      deadlines: [
        { type: 'ASSESSMENT_APPEAL', status: 'PAST_DUE', availability: 'AVAILABLE' },
        {
          type: 'ASSESSMENT_APPEAL',
          status: 'INPUT_REQUIRED',
          availability: 'NEEDS_NOTICE_DATE',
        },
      ],
    }),
    { async getCenter() { return center(); } },
  );

  const result = await service.evaluate(
    'property-1',
    'user-1',
    'ASSESSED_VALUE',
  );

  assert.equal(result.status, 'NOT_READY');
  assert.ok(result.gaps.some((gap) => gap.includes('revised-notice date')));
});

test('tax-class and exemption grounds require sourced ground-specific facts', async () => {
  const factualEvidence = {
    id: 'evidence-1',
    evidenceKey: 'tax-class-primary',
    ground: 'TAX_CLASS',
    type: 'FACTUAL_ERROR',
    title: 'Class record',
    description: null,
    factsJson: {
      claimedClassification: '2',
      officialRecordMismatch: true,
    },
    sourceUrl: 'https://example.gov/class-record',
    supportingDocumentId: null,
    confirmedAt: new Date('2026-07-27T12:00:00.000Z'),
  };
  const service = new PropertyTaxAppealReadinessService(
    database({ evidence: [factualEvidence] }),
    rules(),
    { async getCenter() { return center(); } },
  );

  const taxClass = await service.evaluate(
    'property-1',
    'user-1',
    'TAX_CLASS',
  );
  assert.equal(taxClass.status, 'READY');

  const exemption = await service.evaluate(
    'property-1',
    'user-1',
    'EXEMPTION',
  );
  assert.equal(exemption.status, 'NOT_READY');
  assert.ok(exemption.gaps.some((gap) => gap.includes('exemption notice')));
});

test('comparable adjustments require an explicit rationale', async () => {
  const service = new PropertyTaxAppealReadinessService(
    {},
    rules(),
    {},
  );

  await assert.rejects(
    () => service.upsertComparable({
      propertyId: 'property-1',
      userId: 'user-1',
      comparableKey: 'comp-1',
      address: '123 Main Street',
      saleDate: '2026-01-01',
      salePrice: 400000,
      propertyClass: '1',
      sourceUrl: 'https://example.gov/sale',
      adjustments: { other: -10000 },
    }),
    /rationale/,
  );
});

test('Slice 5 exposes durable evidence-qualified readiness without a migration', () => {
  const root = path.resolve(__dirname, '../../../..');
  const schema = fs.readFileSync(
    path.join(root, 'apps/backend/prisma/schema.prisma'),
    'utf8',
  );
  const routes = fs.readFileSync(
    path.join(root, 'apps/backend/src/routes/propertyTax.routes.ts'),
    'utf8',
  );
  const rulesSource = fs.readFileSync(
    path.join(
      root,
      'apps/backend/src/services/propertyTax/reviewedPropertyTaxRules.ts',
    ),
    'utf8',
  );
  const ui = fs.readFileSync(
    path.join(
      root,
      'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/property-tax/PropertyTaxClient.tsx',
    ),
    'utf8',
  );

  assert.match(schema, /model PropertyTaxAppealEvidence/);
  assert.match(schema, /model PropertyTaxAppealComparable/);
  assert.match(routes, /property-tax\/appeal\/readiness/);
  assert.match(routes, /property-tax\/appeal\/evidence/);
  assert.match(routes, /property-tax\/appeal\/comparables/);
  assert.match(rulesSource, /minimumQualifiedComparables: 3/);
  assert.match(rulesSource, /outcomePredictionAllowed: false/);
  assert.match(ui, /Tax at stake—not promised savings/);
  assert.match(ui, /Evidence-qualified appeal readiness/);

  const migrationRoot = path.join(root, 'apps/backend/prisma/migrations');
  const migrationNames = fs.existsSync(migrationRoot)
    ? fs.readdirSync(migrationRoot)
    : [];
  assert.equal(
    migrationNames.some((name) => /appeal|property.?tax/i.test(name)),
    false,
  );
});
