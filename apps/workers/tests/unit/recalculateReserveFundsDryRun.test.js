// apps/workers/tests/unit/recalculateReserveFundsDryRun.test.js
//
// Worker audit follow-up slice: reserve-fund-recalculation is one of the 7
// broadSweep/externalProvider jobs wired for dry-run + manual-trigger
// support — the cheapest of the 7, since the job already decides "does this
// fund need a recalc?" before ever calling the shared calculation service,
// so dry-run is a single skip right before that call. Covers: dry-run skips
// the recalculate() call but still counts what would happen; a scoped
// propertyId both filters the query and is independently re-checked against
// the operator allowlist; and a real scoped run tags a smokeCorrelationId.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key';

require('ts-node/register');

const { recalculateReserveFundsJob } = require('../../src/jobs/recalculateReserveFunds.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fundFixture(overrides = {}) {
  return {
    id: 'fund-1',
    propertyId: 'property-1',
    sourceAnalysisId: 'analysis-1',
    lastRecalculatedAt: null, // never recalculated -> always needs a recalc
    ...overrides,
  };
}

function fakeDeps({ funds, contextResult }) {
  const calls = { recalculateArgs: [], findManyArgs: [] };

  const deps = {
    prisma: {
      homeReserveFund: {
        findMany: async (args) => {
          calls.findManyArgs.push(args);
          return funds;
        },
      },
      homeCapitalTimelineAnalysis: { findFirst: async () => ({ id: 'analysis-1' }) },
    },
    homeReserveFundCalculationService: {
      recalculate: async (propertyId, trigger, contextVersion, userId) => {
        calls.recalculateArgs.push({ propertyId, trigger, contextVersion, userId });
      },
    },
    checkReserveFundWorkerContext: async () =>
      contextResult ?? { allowed: true, userId: 'user-1', contextVersion: 'v1', reasonCodes: [] },
    logger: noopLogger,
  };

  return { deps, calls };
}

test('dry run: examines and counts a fund needing recalc but calls recalculate() for none', async () => {
  const { deps, calls } = fakeDeps({ funds: [fundFixture()] });

  const result = await recalculateReserveFundsJob({ dryRun: true }, deps);

  assert.equal(calls.recalculateArgs.length, 0);
  assert.equal(result.recalculated, 1);
  assert.equal(result.smokeCorrelationId, undefined);
});

test('no opts (the monthly cron tick): behaves exactly like a real run', async () => {
  const { deps, calls } = fakeDeps({ funds: [fundFixture()] });

  const result = await recalculateReserveFundsJob(undefined, deps);

  assert.equal(calls.recalculateArgs.length, 1);
  assert.equal(result.recalculated, 1);
});

test('a scoped propertyId is applied as a query filter', async () => {
  const originalEnv = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
  process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'property-allowed';
  try {
    const { deps, calls } = fakeDeps({ funds: [fundFixture({ propertyId: 'property-allowed' })] });

    await recalculateReserveFundsJob({ dryRun: true, propertyId: 'property-allowed' }, deps);

    assert.equal(calls.findManyArgs[0].where.propertyId, 'property-allowed');
  } finally {
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalEnv;
  }
});

test('a propertyId not in SMOKE_TEST_PROPERTY_ALLOWLIST is rejected outright, before any query runs', async () => {
  const originalEnv = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
  process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'some-other-property';
  try {
    const { deps, calls } = fakeDeps({ funds: [fundFixture()] });

    await assert.rejects(
      () => recalculateReserveFundsJob({ dryRun: true, propertyId: 'property-not-allowed' }, deps),
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
    const { deps, calls } = fakeDeps({ funds: [fundFixture({ propertyId: 'property-allowed' })] });

    const result = await recalculateReserveFundsJob({ dryRun: false, propertyId: 'property-allowed' }, deps);

    assert.equal(calls.recalculateArgs.length, 1);
    assert.match(result.smokeCorrelationId, /^smoke:reserve-fund-recalculation:/);
  } finally {
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalEnv;
  }
});

test('an unscoped run (no propertyId) tags nothing', async () => {
  const { deps } = fakeDeps({ funds: [fundFixture()] });

  const result = await recalculateReserveFundsJob(undefined, deps);

  assert.equal(result.smokeCorrelationId, undefined);
});
