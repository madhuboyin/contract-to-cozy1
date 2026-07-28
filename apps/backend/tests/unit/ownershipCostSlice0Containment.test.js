const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  costGrowthQuerySchema,
  ownershipCostYearsQuerySchema,
  trueCostQuerySchema,
} = require('../../src/controllers/ownershipCostContainment.schemas.ts');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

test('ownership-cost scenario inputs reject non-finite and out-of-bounds values', () => {
  assert.equal(trueCostQuerySchema.safeParse({ inflationRate: 'Infinity' }).success, false);
  assert.equal(trueCostQuerySchema.safeParse({ inflationRate: '0.26' }).success, false);
  assert.equal(trueCostQuerySchema.safeParse({ maintenanceAnnualNow: '-1' }).success, false);
  assert.equal(trueCostQuerySchema.safeParse({ years: '7' }).success, false);

  assert.equal(costGrowthQuerySchema.safeParse({ appreciationRate: '0.26' }).success, false);
  assert.equal(costGrowthQuerySchema.safeParse({ taxRate: '0.11' }).success, false);
  assert.equal(costGrowthQuerySchema.safeParse({ homeValueNow: 'NaN' }).success, false);
  assert.equal(ownershipCostYearsQuerySchema.safeParse({ years: '25' }).success, false);

  const valid = costGrowthQuerySchema.safeParse({
    years: '10',
    appreciationRate: '-0.05',
    taxRate: '0.025',
    homeValueNow: '450000',
  });
  assert.equal(valid.success, true);
  assert.equal(valid.data.years, 10);
  assert.equal(valid.data.appreciationRate, -0.05);
});

test('GET and page-load paths do not record ownership-cost workflow completion', () => {
  const trueCostController = read('../../src/controllers/trueCostOwnership.controller.ts');
  assert.doesNotMatch(trueCostController, /recordToolCompletion/);

  for (const source of [
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/true-cost/TrueCostClient.tsx',
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/cost-growth/HomeCostGrowthClient.tsx',
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/cost-volatility/CostVolatilityClient.tsx',
    '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/cost-explainer/CostExplainerClient.tsx',
  ]) {
    assert.doesNotMatch(read(source), /workflow_completed/, source);
  }
});

test('modeled ownership-cost series are explicitly forward projections', () => {
  const trueCostService = read('../../src/services/trueCostOwnership.service.ts');
  assert.match(trueCostService, /projection: Array/);
  assert.match(trueCostService, /nowYear \+ i/);
  assert.doesNotMatch(trueCostService, /history: Array/);

  const growthService = read('../../src/services/homeCostGrowth.service.ts');
  assert.match(growthService, /projection: Array/);
  assert.match(growthService, /nowYear \+ i/);
  assert.match(growthService, /must not be interpreted as investment return/);
});

test('change and volatility conclusions are withheld without comparable observations', () => {
  const explainer = read('../../src/services/costExplainer.service.ts');
  assert.match(explainer, /tax: number \\| null/);
  assert.match(explainer, /maintenance: number \\| null/);
  assert.match(explainer, /We do not have enough comparable records to show the total change/);
  assert.match(explainer, /modeledSeries/);

  const volatility = read('../../src/services/costVolatility.service.ts');
  assert.match(volatility, /requiredComparablePeriods = 3/);
  assert.match(volatility, /volatilityIndex: null/);
  assert.ok(volatility.includes('history: [],'));
  assert.ok(volatility.includes("href: '/dashboard/budget'"));
  assert.doesNotMatch(volatility, /TrueCostOwnershipService/);
});
