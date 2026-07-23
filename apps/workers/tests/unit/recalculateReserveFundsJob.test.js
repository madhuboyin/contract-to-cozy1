// apps/workers/tests/unit/recalculateReserveFundsJob.test.js
//
// W4 item 4: recalculateReserveFundsJob had no dedicated test. Covers the
// Property Context applicability skip, the "behind latest Capital Timeline
// analysis" trigger, the 35-day staleness trigger, the "already up to
// date" skip (neither behind nor stale), and the existing per-fund error
// isolation.
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
    lastRecalculatedAt: new Date(),
    ...overrides,
  };
}

function fakeDeps({ funds, contextResult, latestAnalysis = null, recalculateShouldFailFor = new Set() }) {
  const calls = { recalculateArgs: [] };

  const deps = {
    prisma: {
      homeReserveFund: { findMany: async () => funds },
      homeCapitalTimelineAnalysis: { findFirst: async () => latestAnalysis },
    },
    homeReserveFundCalculationService: {
      recalculate: async (propertyId, trigger, contextVersion, userId) => {
        calls.recalculateArgs.push({ propertyId, trigger, contextVersion, userId });
        if (recalculateShouldFailFor.has(propertyId)) throw new Error(`recalculate failed for ${propertyId}`);
      },
    },
    checkReserveFundWorkerContext: async () =>
      contextResult ?? { allowed: true, userId: 'user-1', contextVersion: 'v1', reasonCodes: [] },
    logger: noopLogger,
  };

  return { deps, calls };
}

test('skips a fund when Property Context is not current/allowed', async () => {
  const { deps, calls } = fakeDeps({
    funds: [fundFixture()],
    contextResult: { allowed: false, userId: null, reasonCodes: ['STALE_CONTEXT'] },
  });

  await recalculateReserveFundsJob(undefined, deps);

  assert.equal(calls.recalculateArgs.length, 0);
});

test('recalculates a fund that is behind the latest READY Capital Timeline analysis', async () => {
  const { deps, calls } = fakeDeps({
    funds: [fundFixture({ sourceAnalysisId: 'analysis-old', lastRecalculatedAt: new Date() })],
    latestAnalysis: { id: 'analysis-new' },
  });

  await recalculateReserveFundsJob(undefined, deps);

  assert.equal(calls.recalculateArgs.length, 1);
  assert.equal(calls.recalculateArgs[0].propertyId, 'property-1');
  assert.equal(calls.recalculateArgs[0].trigger, 'SCHEDULED');
  assert.equal(calls.recalculateArgs[0].contextVersion, 'v1');
  assert.equal(calls.recalculateArgs[0].userId, 'user-1');
});

test('recalculates a fund that has never been recalculated (lastRecalculatedAt null)', async () => {
  const { deps, calls } = fakeDeps({
    funds: [fundFixture({ lastRecalculatedAt: null })],
    latestAnalysis: { id: 'analysis-1' }, // matches sourceAnalysisId, not behind
  });

  await recalculateReserveFundsJob(undefined, deps);

  assert.equal(calls.recalculateArgs.length, 1);
});

test('recalculates a fund whose last recalculation is older than 35 days', async () => {
  const { deps, calls } = fakeDeps({
    funds: [fundFixture({ lastRecalculatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) })],
    latestAnalysis: { id: 'analysis-1' },
  });

  await recalculateReserveFundsJob(undefined, deps);

  assert.equal(calls.recalculateArgs.length, 1);
});

test('skips a fund that is neither behind the latest analysis nor stale', async () => {
  const { deps, calls } = fakeDeps({
    funds: [fundFixture({ sourceAnalysisId: 'analysis-1', lastRecalculatedAt: new Date() })],
    latestAnalysis: { id: 'analysis-1' }, // same as sourceAnalysisId — not behind
  });

  await recalculateReserveFundsJob(undefined, deps);

  assert.equal(calls.recalculateArgs.length, 0);
});

test('one fund failing does not abort the sweep for the rest of the batch', async () => {
  const { deps, calls } = fakeDeps({
    funds: [
      fundFixture({ propertyId: 'property-1', lastRecalculatedAt: null }),
      fundFixture({ propertyId: 'property-2', lastRecalculatedAt: null }),
    ],
    recalculateShouldFailFor: new Set(['property-1']),
  });

  await assert.doesNotReject(() => recalculateReserveFundsJob(undefined, deps));

  assert.equal(calls.recalculateArgs.length, 2, 'both must still be attempted');
});

test('does nothing when there are no active funds', async () => {
  const { deps, calls } = fakeDeps({ funds: [] });

  await recalculateReserveFundsJob(undefined, deps);

  assert.equal(calls.recalculateArgs.length, 0);
});
