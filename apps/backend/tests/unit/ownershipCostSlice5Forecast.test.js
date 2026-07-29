const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  buildOwnershipCostForecast,
  OwnershipCostForecastService,
  validateOwnershipCostScenarioOverrides,
} = require(
  '../../src/services/ownershipCosts/ownershipCostForecast.service.ts',
);

function line(overrides = {}) {
  return {
    category: 'PROPERTY_TAX',
    annualizedAmountCents: 240000,
    applicability: 'APPLICABLE',
    evidenceStatus: 'CONFIRMED',
    includedLenses: ['OPERATING_EXPENSE', 'CASH_OUTFLOW'],
    sourceObservation: { assumptionsJson: [] },
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return {
    id: 'snapshot-2026',
    inputFingerprint: 'input-2026',
    methodVersion: 'ownership-cost-normalization-v1',
    categoryDefinitionVersion: 'ownership-cost-categories-v1',
    basePeriodStart: new Date('2026-01-01T00:00:00.000Z'),
    basePeriodEnd: new Date('2026-12-31T23:59:59.999Z'),
    computedAt: new Date('2026-12-31T23:59:59.999Z'),
    lines: [line()],
    ...overrides,
  };
}

test('Slice 5 forecast starts after the base period and is deterministic', () => {
  const first = buildOwnershipCostForecast(
    'property-1',
    snapshot(),
    'OPERATING_EXPENSE',
    3,
  );
  const second = buildOwnershipCostForecast(
    'property-1',
    snapshot(),
    'OPERATING_EXPENSE',
    3,
  );

  assert.equal(first.forecastKind, 'FORWARD_PLANNING_RANGE');
  assert.equal(first.forecastStart, '2027-01-01T00:00:00.000Z');
  assert.equal(first.periods.length, 3);
  assert.equal(first.periods[0].year, 2027);
  assert.ok(first.periods[0].lowCents <= first.periods[0].baseCents);
  assert.ok(first.periods[0].baseCents <= first.periods[0].highCents);
  assert.equal(first.nominalDollars, true);
  assert.equal(
    first.calculationFingerprint,
    second.calculationFingerprint,
  );
  assert.deepEqual(first.periods, second.periods);
  assert.match(first.disclaimer, /not a guarantee/i);
});

test('source-backed rates and known dated events drive transparent ranges', () => {
  const forecast = buildOwnershipCostForecast(
    'property-1',
    snapshot({
      lines: [
        line({
          sourceObservation: {
            assumptionsJson: [
              'FORECAST_RATE:0.01:0.02:0.03:County levy planning notice',
              'FORECAST_EVENT:2028:50000:RECURRING:Scheduled reassessment effect',
            ],
          },
        }),
        line({
          category: 'CAPITAL_PROJECT',
          annualizedAmountCents: 900000,
          includedLenses: ['CASH_OUTFLOW'],
          sourceObservation: {
            assumptionsJson: [
              'FORECAST_EVENT:2028:900000:Planned roof replacement',
            ],
          },
        }),
      ],
    }),
    'CASH_OUTFLOW',
    3,
  );

  const tax = forecast.drivers.find(
    (driver) => driver.category === 'PROPERTY_TAX',
  );
  const capital = forecast.drivers.find(
    (driver) => driver.category === 'CAPITAL_PROJECT',
  );
  assert.equal(tax.rateSource, 'SOURCE_BACKED');
  assert.equal(tax.rateSourceLabel, 'County levy planning notice');
  assert.equal(tax.knownEvents[0].year, 2028);
  assert.equal(tax.knownEvents[0].recurring, true);
  assert.equal(capital.baseAnnualCents, 0);
  assert.equal(
    forecast.periods.find((period) => period.year === 2028).baseCents,
    Math.round(240000 * (1.02 ** 2)) + 50000 + 900000,
  );
  assert.equal(
    forecast.periods.find((period) => period.year === 2027).baseCents,
    Math.round(240000 * 1.02),
  );
  assert.equal(
    forecast.periods.find((period) => period.year === 2029).baseCents,
    Math.round(240000 * (1.02 ** 3)) + 50000,
  );
});

test('scenario overrides stay separate from the base snapshot', () => {
  const base = snapshot();
  const forecast = buildOwnershipCostForecast(
    'property-1',
    base,
    'OPERATING_EXPENSE',
    1,
    {
      categoryGrowthRates: { PROPERTY_TAX: 0.1 },
      categoryAnnualAdjustmentsCents: { PROPERTY_TAX: 10000 },
    },
  );

  assert.equal(base.lines[0].annualizedAmountCents, 240000);
  assert.equal(forecast.baseSnapshot.annualCents, 240000);
  assert.equal(forecast.periods[0].baseCents, 275000);
  assert.equal(
    forecast.drivers[0].rateSource,
    'SCENARIO_OVERRIDE',
  );
});

test('invalid and extreme scenario values are rejected', () => {
  assert.throws(
    () => validateOwnershipCostScenarioOverrides({
      categoryGrowthRates: { PROPERTY_TAX: 0.5001 },
    }),
    /between -25% and 50%/,
  );
  assert.throws(
    () => validateOwnershipCostScenarioOverrides({
      categoryAnnualAdjustmentsCents: {
        PROPERTY_TAX: 100_000_001,
      },
    }),
    /between.*1,000,000/i,
  );
  assert.throws(
    () => buildOwnershipCostForecast(
      'property-1',
      snapshot(),
      'OPERATING_EXPENSE',
      11,
    ),
    /from 1 to 10/,
  );
});

test('saved scenario retains its base snapshot and becomes visibly stale', async () => {
  const oldSnapshot = snapshot();
  const latestSnapshot = snapshot({
    id: 'snapshot-2027',
    inputFingerprint: 'input-2027',
    basePeriodStart: new Date('2027-01-01T00:00:00.000Z'),
    basePeriodEnd: new Date('2027-12-31T23:59:59.999Z'),
  });
  const db = {
    ownershipCostSnapshot: {
      findFirst: async () => latestSnapshot,
    },
    ownershipCostForecast: {
      findUnique: async () => null,
      create: async () => ({ id: 'forecast-1' }),
    },
    ownershipCostScenario: {
      findMany: async () => [{
        id: 'scenario-1',
        propertyId: 'property-1',
        baseSnapshotId: oldSnapshot.id,
        createdByUserId: 'user-1',
        name: 'Higher tax case',
        status: 'ACTIVE',
        methodVersion: 'ownership-cost-forecast-v1',
        baseInputFingerprint: oldSnapshot.inputFingerprint,
        overrideFingerprint: 'override-1',
        overridesJson: {
          lens: 'OPERATING_EXPENSE',
          horizonYears: 3,
          overrides: {
            categoryGrowthRates: { PROPERTY_TAX: 0.06 },
          },
        },
        staleReason: null,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        updatedAt: new Date('2026-07-01T00:00:00.000Z'),
        archivedAt: null,
        baseSnapshot: oldSnapshot,
        forecasts: [{ id: 'forecast-scenario-1' }],
      }],
      findFirst: async () => null,
      create: async () => assert.fail('create should not run'),
      update: async () => assert.fail('update should not run'),
      delete: async () => assert.fail('delete should not run'),
    },
  };
  const service = new OwnershipCostForecastService(
    db,
    async () => true,
  );
  const [scenario] = await service.listScenarios(
    'property-1',
    'user-1',
  );

  assert.equal(scenario.status, 'STALE');
  assert.equal(scenario.isStale, true);
  assert.equal(scenario.forecast.baseSnapshot.id, 'snapshot-2026');
  assert.equal(scenario.forecast.stale.isStale, true);
  assert.match(scenario.staleReason, /inputs changed/i);
});

test('forecast persistence is explicit and idempotent', async () => {
  const calls = [];
  const db = {
    ownershipCostSnapshot: {
      findFirst: async () => {
        calls.push('load');
        return snapshot();
      },
    },
    ownershipCostForecast: {
      findUnique: async () => {
        calls.push('find');
        return null;
      },
      create: async (args) => {
        calls.push('create');
        assert.equal(args.data.lines.create.length, 3);
        assert.ok(args.data.lines.create.every(
          (entry) => entry.evidenceStatus === 'FORECAST',
        ));
        return { id: 'forecast-1' };
      },
    },
    ownershipCostScenario: {
      findMany: async () => [],
      findFirst: async () => null,
      create: async () => assert.fail('create scenario should not run'),
      update: async () => assert.fail('update should not run'),
      delete: async () => assert.fail('delete should not run'),
    },
  };
  const service = new OwnershipCostForecastService(
    db,
    async () => {
      calls.push('authorize');
      return true;
    },
  );
  const result = await service.recalculateForecast(
    'property-1',
    'user-1',
    'OPERATING_EXPENSE',
    3,
  );

  assert.deepEqual(calls, ['authorize', 'load', 'find', 'create']);
  assert.equal(result.forecastId, 'forecast-1');
});

test('future observations are annualized from persisted amount and recurrence', async () => {
  let observationQuery;
  const db = {
    ownershipCostSnapshot: {
      findFirst: async () => snapshot({ lines: [] }),
    },
    ownershipCostObservation: {
      findMany: async (args) => {
        observationQuery = args;
        return [{
          category: 'UTILITIES',
          amountCents: 10000,
          recurrence: 'MONTHLY',
          applicability: 'APPLICABLE',
          evidenceStatus: 'FORECAST',
          temporalKind: 'FORECAST_PERIOD',
          assumptionsJson: [],
          sourceFingerprint: 'future-utility-1',
        }];
      },
    },
    ownershipCostForecast: {
      findUnique: async () => null,
      create: async () => ({ id: 'forecast-1' }),
    },
    ownershipCostScenario: {
      findMany: async () => [],
      findFirst: async () => null,
      create: async () => assert.fail('create scenario should not run'),
      update: async () => assert.fail('update should not run'),
      delete: async () => assert.fail('delete should not run'),
    },
  };
  const service = new OwnershipCostForecastService(db, async () => true);
  const result = await service.getForecast(
    'property-1',
    'user-1',
    'OPERATING_EXPENSE',
    1,
  );

  assert.deepEqual(observationQuery.select, {
    category: true,
    amountCents: true,
    recurrence: true,
    applicability: true,
    evidenceStatus: true,
    temporalKind: true,
    assumptionsJson: true,
    sourceFingerprint: true,
  });
  assert.equal(result.baseSnapshot.annualCents, 0);
  assert.equal(result.drivers[0].baseAnnualCents, 0);
});

test('scenario lifecycle creates, renames, archives, and deletes retained inputs', async () => {
  const base = snapshot();
  let row;
  let deleted = false;
  const db = {
    ownershipCostSnapshot: {
      findFirst: async () => base,
    },
    ownershipCostObservation: {
      findMany: async () => [],
    },
    ownershipCostForecast: {
      findUnique: async () => null,
      create: async () => ({ id: 'forecast-scenario-1' }),
    },
    ownershipCostScenario: {
      create: async (args) => {
        row = {
          id: 'scenario-1',
          ...args.data,
          createdAt: new Date('2026-07-01T00:00:00.000Z'),
          updatedAt: new Date('2026-07-01T00:00:00.000Z'),
          archivedAt: null,
          staleReason: null,
          baseSnapshot: base,
          forecasts: [],
        };
        return row;
      },
      findFirst: async () => row,
      findMany: async () => [],
      update: async (args) => {
        row = {
          ...row,
          ...args.data,
          updatedAt: new Date('2026-07-02T00:00:00.000Z'),
        };
        return row;
      },
      delete: async () => {
        deleted = true;
      },
    },
  };
  const service = new OwnershipCostForecastService(db, async () => true);
  const created = await service.createScenario(
    'property-1',
    'user-1',
    {
      name: 'Tax range',
      lens: 'OPERATING_EXPENSE',
      horizonYears: 3,
      overrides: {
        categoryGrowthRates: { PROPERTY_TAX: 0.05 },
      },
    },
  );
  assert.equal(created.name, 'Tax range');
  assert.equal(created.forecast.baseSnapshot.id, 'snapshot-2026');
  assert.equal(created.forecast.forecastId, 'forecast-scenario-1');
  assert.equal(
    row.overridesJson.overrides.categoryGrowthRates.PROPERTY_TAX,
    0.05,
  );

  const archived = await service.updateScenario(
    'property-1',
    'scenario-1',
    'user-1',
    { name: 'Renamed tax range', status: 'ARCHIVED' },
  );
  assert.equal(archived.name, 'Renamed tax range');
  assert.equal(archived.status, 'ARCHIVED');
  assert.ok(archived.archivedAt);

  await service.deleteScenario('property-1', 'scenario-1', 'user-1');
  assert.equal(deleted, true);
});

test('Slice 5 exposes contributor-gated forecast and scenario lifecycle routes', () => {
  const route = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/ownershipCosts.routes.ts'),
    'utf8',
  );
  const controller = fs.readFileSync(
    path.resolve(__dirname, '../../src/controllers/ownershipCosts.controller.ts'),
    'utf8',
  );
  const client = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../frontend/src/app/(dashboard)/dashboard/properties/[id]/ownership-costs/OwnershipCostsClient.tsx',
    ),
    'utf8',
  );
  assert.match(route, /ownership-costs\/forecast/);
  assert.match(route, /ownership-costs\/scenarios/);
  assert.match(route, /router\.patch\(/);
  assert.match(route, /router\.delete\(/);
  assert.match(route, /requireHouseholdRole\('CONTRIBUTOR'\)/);
  assert.match(controller, /min\(-0\.25\)\.max\(0\.5\)/);
  assert.match(controller, /horizonYears/);
  assert.match(client, /Forward planning range/);
  assert.match(client, /Saved scenarios/);
  assert.match(client, /Scenario overrides do not change canonical facts/);
});
