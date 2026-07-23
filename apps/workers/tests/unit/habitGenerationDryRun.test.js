// apps/workers/tests/unit/habitGenerationDryRun.test.js
//
// Worker audit follow-up slice: home-habit-generation is one of the 3
// "shallow dry-run" jobs (Slice A2) — generateHabitsForProperty() is also
// called directly from property.service.ts's onboarding flow (a live
// request path), so dry-run here skips calling it entirely rather than
// threading a dryRun param through it. Covers: dry-run skips generation
// (and therefore the downstream notification) for every property but still
// counts what would happen; a scoped propertyId both filters the query and
// is independently re-checked against the operator allowlist; a real
// scoped run tags a smokeCorrelationId.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { runHabitGenerationJob } = require('../../src/jobs/habitGeneration.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({ properties, generationResultsByProperty = {} }) {
  const calls = { generated: [], createCalls: [], findManyArgs: [] };

  const deps = {
    prisma: {
      property: {
        findMany: async (args) => {
          calls.findManyArgs.push(args);
          return properties;
        },
      },
    },
    generateHabitsForProperty: async (propertyId) => {
      calls.generated.push(propertyId);
      return generationResultsByProperty[propertyId] ?? { created: 0, skipped: 0, details: [] };
    },
    notificationService: {
      create: async (input) => {
        calls.createCalls.push(input);
        return { id: `notification-${calls.createCalls.length}` };
      },
    },
    logger: noopLogger,
  };

  return { deps, calls };
}

function property(overrides = {}) {
  return {
    id: 'property-1',
    dwellingType: 'DETACHED_SINGLE_FAMILY',
    yearBuilt: 2010,
    state: 'NJ',
    heatingType: 'FORCED_AIR',
    coolingType: 'CENTRAL_AC',
    waterHeaterType: 'TANK',
    roofType: 'SHINGLE',
    hasSumpPumpBackup: false,
    hasFireExtinguisher: true,
    hasSmokeDetectors: true,
    hasCoDetectors: true,
    hasSecuritySystem: false,
    climateSetting: null,
    exteriorProfile: null,
    responsibilities: [],
    inventoryItems: [],
    homeownerProfile: { userId: 'user-1' },
    ...overrides,
  };
}

test('dry run: examines and counts properties but generates habits for none', async () => {
  const { deps, calls } = fakeDeps({ properties: [property(), property({ id: 'property-2' })] });

  const result = await runHabitGenerationJob({ dryRun: true }, deps);

  assert.equal(calls.generated.length, 0);
  assert.equal(calls.createCalls.length, 0);
  assert.equal(result.examined, 2);
  assert.equal(result.skipped, 2);
  assert.equal(result.smokeCorrelationId, undefined);
});

test('no opts (the weekly cron tick): behaves exactly like a real run', async () => {
  const { deps, calls } = fakeDeps({
    properties: [property()],
    generationResultsByProperty: {
      'property-1': {
        created: 1,
        skipped: 0,
        details: [{ action: 'created', impactType: 'IMPROVE_SAFETY', templateKey: 'smoke-detector-test' }],
      },
    },
  });

  const result = await runHabitGenerationJob(undefined, deps);

  assert.deepEqual(calls.generated, ['property-1']);
  assert.equal(calls.createCalls.length, 1);
  assert.equal(result.created, 1);
  assert.equal(result.notified, 1);
});

test('a scoped propertyId is applied as a query filter', async () => {
  const originalEnv = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
  process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'property-allowed';
  try {
    const { deps, calls } = fakeDeps({ properties: [property({ id: 'property-allowed' })] });

    await runHabitGenerationJob({ dryRun: true, propertyId: 'property-allowed' }, deps);

    assert.equal(calls.findManyArgs[0].where.id, 'property-allowed');
  } finally {
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalEnv;
  }
});

test('a propertyId not in SMOKE_TEST_PROPERTY_ALLOWLIST is rejected outright, before any query runs', async () => {
  const originalEnv = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
  process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'some-other-property';
  try {
    const { deps, calls } = fakeDeps({ properties: [property()] });

    await assert.rejects(
      () => runHabitGenerationJob({ dryRun: true, propertyId: 'property-not-allowed' }, deps),
      /not in SMOKE_TEST_PROPERTY_ALLOWLIST/,
    );
    assert.equal(calls.findManyArgs.length, 0, 'must reject before querying, not after');
  } finally {
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalEnv;
  }
});

test('a real scoped run tags the result with a smokeCorrelationId', async () => {
  const originalEnv = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
  process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'property-allowed';
  try {
    const { deps, calls } = fakeDeps({
      properties: [property({ id: 'property-allowed' })],
      generationResultsByProperty: { 'property-allowed': { created: 0, skipped: 0, details: [] } },
    });

    const result = await runHabitGenerationJob({ dryRun: false, propertyId: 'property-allowed' }, deps);

    assert.deepEqual(calls.generated, ['property-allowed']);
    assert.match(result.smokeCorrelationId, /^smoke:home-habit-generation:/);
  } finally {
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalEnv;
  }
});

test('an unscoped run (no propertyId) tags nothing', async () => {
  const { deps } = fakeDeps({ properties: [property()] });

  const result = await runHabitGenerationJob(undefined, deps);

  assert.equal(result.smokeCorrelationId, undefined);
});
