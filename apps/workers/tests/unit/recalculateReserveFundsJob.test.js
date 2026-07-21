// apps/workers/tests/unit/recalculateReserveFundsJob.test.js
//
// W4 item 4: recalculateReserveFundsJob had no dedicated test. Covers the
// Property Context applicability skip, the "behind latest Capital Timeline
// analysis" trigger, the 35-day staleness trigger, the "already up to
// date" skip (neither behind nor stale), and the existing per-fund error
// isolation.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function fundFixture(overrides = {}) {
  return {
    id: 'fund-1',
    propertyId: 'property-1',
    sourceAnalysisId: 'analysis-1',
    lastRecalculatedAt: new Date(),
    ...overrides,
  };
}

function loadJob({ funds, contextResult, latestAnalysis = null, recalculateShouldFailFor = new Set() }) {
  const calls = { recalculateArgs: [] };

  const prismaMock = {
    homeReserveFund: { findMany: async () => funds },
    homeCapitalTimelineAnalysis: { findFirst: async () => latestAnalysis },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const calcServicePath = require.resolve('../../../backend/src/services/homeReserveFundCalculation.service.ts');
  require.cache[calcServicePath] = {
    id: calcServicePath,
    filename: calcServicePath,
    loaded: true,
    exports: {
      homeReserveFundCalculationService: {
        recalculate: async (propertyId, trigger, contextVersion, userId) => {
          calls.recalculateArgs.push({ propertyId, trigger, contextVersion, userId });
          if (recalculateShouldFailFor.has(propertyId)) throw new Error(`recalculate failed for ${propertyId}`);
        },
      },
    },
  };

  const contextPath = require.resolve('../../../backend/src/services/financialContext/reserveFundWorkerContext.service.ts');
  require.cache[contextPath] = {
    id: contextPath,
    filename: contextPath,
    loaded: true,
    exports: {
      checkReserveFundWorkerContext: async () =>
        contextResult ?? { allowed: true, userId: 'user-1', contextVersion: 'v1', reasonCodes: [] },
    },
  };

  const jobPath = require.resolve('../../src/jobs/recalculateReserveFunds.job.ts');
  delete require.cache[jobPath];
  return { ...require(jobPath), calls };
}

test('skips a fund when Property Context is not current/allowed', async () => {
  const { recalculateReserveFundsJob, calls } = loadJob({
    funds: [fundFixture()],
    contextResult: { allowed: false, userId: null, reasonCodes: ['STALE_CONTEXT'] },
  });

  await recalculateReserveFundsJob();

  assert.equal(calls.recalculateArgs.length, 0);
});

test('recalculates a fund that is behind the latest READY Capital Timeline analysis', async () => {
  const { recalculateReserveFundsJob, calls } = loadJob({
    funds: [fundFixture({ sourceAnalysisId: 'analysis-old', lastRecalculatedAt: new Date() })],
    latestAnalysis: { id: 'analysis-new' },
  });

  await recalculateReserveFundsJob();

  assert.equal(calls.recalculateArgs.length, 1);
  assert.equal(calls.recalculateArgs[0].propertyId, 'property-1');
  assert.equal(calls.recalculateArgs[0].trigger, 'SCHEDULED');
  assert.equal(calls.recalculateArgs[0].contextVersion, 'v1');
  assert.equal(calls.recalculateArgs[0].userId, 'user-1');
});

test('recalculates a fund that has never been recalculated (lastRecalculatedAt null)', async () => {
  const { recalculateReserveFundsJob, calls } = loadJob({
    funds: [fundFixture({ lastRecalculatedAt: null })],
    latestAnalysis: { id: 'analysis-1' }, // matches sourceAnalysisId, not behind
  });

  await recalculateReserveFundsJob();

  assert.equal(calls.recalculateArgs.length, 1);
});

test('recalculates a fund whose last recalculation is older than 35 days', async () => {
  const { recalculateReserveFundsJob, calls } = loadJob({
    funds: [fundFixture({ lastRecalculatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) })],
    latestAnalysis: { id: 'analysis-1' },
  });

  await recalculateReserveFundsJob();

  assert.equal(calls.recalculateArgs.length, 1);
});

test('skips a fund that is neither behind the latest analysis nor stale', async () => {
  const { recalculateReserveFundsJob, calls } = loadJob({
    funds: [fundFixture({ sourceAnalysisId: 'analysis-1', lastRecalculatedAt: new Date() })],
    latestAnalysis: { id: 'analysis-1' }, // same as sourceAnalysisId — not behind
  });

  await recalculateReserveFundsJob();

  assert.equal(calls.recalculateArgs.length, 0);
});

test('one fund failing does not abort the sweep for the rest of the batch', async () => {
  const { recalculateReserveFundsJob, calls } = loadJob({
    funds: [
      fundFixture({ propertyId: 'property-1', lastRecalculatedAt: null }),
      fundFixture({ propertyId: 'property-2', lastRecalculatedAt: null }),
    ],
    recalculateShouldFailFor: new Set(['property-1']),
  });

  await assert.doesNotReject(() => recalculateReserveFundsJob());

  assert.equal(calls.recalculateArgs.length, 2, 'both must still be attempted');
});

test('does nothing when there are no active funds', async () => {
  const { recalculateReserveFundsJob, calls } = loadJob({ funds: [] });

  await recalculateReserveFundsJob();

  assert.equal(calls.recalculateArgs.length, 0);
});
