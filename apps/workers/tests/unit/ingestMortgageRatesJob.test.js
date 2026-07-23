// apps/workers/tests/unit/ingestMortgageRatesJob.test.js
//
// W4 item 4: ingestMortgageRatesJob had no dedicated test despite a
// well-structured 3-tier fallback chain (FRED API → manual env fallback →
// clean skip) that's easy to get wrong silently. Covers every branch.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache. fetchFredSeries (job-scoped, keyed by seriesId) is
// injected as a plain function reference instead of mocking the node-fetch
// package's own module cache entry.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { ingestMortgageRatesJob } = require('../../src/jobs/ingestMortgageRates.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({ fetchFredSeriesImpl, ingestSnapshotImpl }) {
  const calls = { fetchFredSeriesCalls: [], ingestSnapshotArgs: [] };

  const deps = {
    fetchFredSeries: async (seriesId, apiKey) => {
      calls.fetchFredSeriesCalls.push(seriesId);
      return fetchFredSeriesImpl(seriesId, apiKey);
    },
    mortgageRateService: {
      ingestSnapshot: async (args) => {
        calls.ingestSnapshotArgs.push(args);
        return ingestSnapshotImpl(args);
      },
    },
    logger: noopLogger,
  };

  return { deps, calls };
}

function withEnv(overrides, fn) {
  const originals = {};
  for (const key of Object.keys(overrides)) {
    originals[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  return (async () => {
    try {
      return await fn();
    } finally {
      for (const key of Object.keys(originals)) {
        if (originals[key] === undefined) delete process.env[key];
        else process.env[key] = originals[key];
      }
    }
  })();
}

test('FRED success: ingests both series under source FRED', async () => {
  await withEnv({ FRED_API_KEY: 'test-key' }, async () => {
    const { deps, calls } = fakeDeps({
      fetchFredSeriesImpl: (seriesId) =>
        seriesId === 'MORTGAGE30US' ? { date: '2026-07-17', rate: 6.5 } : { date: '2026-07-17', rate: 5.75 },
      ingestSnapshotImpl: (args) => ({ snapshot: { date: args.date, rate30yr: args.rate30yr, rate15yr: args.rate15yr }, created: true }),
    });

    const result = await ingestMortgageRatesJob(undefined, deps);

    assert.equal(result.success, true);
    assert.equal(result.source, 'FRED');
    assert.equal(result.rate30yr, 6.5);
    assert.equal(result.rate15yr, 5.75);
    assert.equal(calls.ingestSnapshotArgs[0].source, 'FRED');
  });
});

test('FRED returning null (missing data) for one series falls through to manual fallback', async () => {
  await withEnv(
    { FRED_API_KEY: 'test-key', MORTGAGE_RATE_30YR_FALLBACK: '6.5', MORTGAGE_RATE_15YR_FALLBACK: '5.75' },
    async () => {
      const { deps, calls } = fakeDeps({
        fetchFredSeriesImpl: (seriesId) => (seriesId === 'MORTGAGE30US' ? null : { date: '2026-07-17', rate: 5.75 }),
        ingestSnapshotImpl: (args) => ({ snapshot: { date: args.date, rate30yr: args.rate30yr, rate15yr: args.rate15yr }, created: true }),
      });

      const result = await ingestMortgageRatesJob(undefined, deps);

      assert.equal(result.source, 'MANUAL');
      assert.equal(calls.ingestSnapshotArgs.length, 1, 'must not have called ingestSnapshot for the incomplete FRED result');
    },
  );
});

test('a thrown FRED fetch error falls through to manual fallback instead of crashing the job', async () => {
  await withEnv(
    { FRED_API_KEY: 'test-key', MORTGAGE_RATE_30YR_FALLBACK: '6.5', MORTGAGE_RATE_15YR_FALLBACK: '5.75' },
    async () => {
      const { deps } = fakeDeps({
        fetchFredSeriesImpl: () => {
          throw new Error('network down');
        },
        ingestSnapshotImpl: (args) => ({ snapshot: { date: args.date, rate30yr: args.rate30yr, rate15yr: args.rate15yr }, created: true }),
      });

      const result = await ingestMortgageRatesJob(undefined, deps);

      assert.equal(result.success, true);
      assert.equal(result.source, 'MANUAL');
    },
  );
});

test('no FRED_API_KEY set: uses manual fallback directly without attempting a fetch', async () => {
  await withEnv(
    { FRED_API_KEY: undefined, MORTGAGE_RATE_30YR_FALLBACK: '6.5', MORTGAGE_RATE_15YR_FALLBACK: '5.75' },
    async () => {
      const { deps, calls } = fakeDeps({
        fetchFredSeriesImpl: () => {
          throw new Error('must not be called');
        },
        ingestSnapshotImpl: (args) => ({ snapshot: { date: args.date, rate30yr: args.rate30yr, rate15yr: args.rate15yr }, created: false }),
      });

      const result = await ingestMortgageRatesJob(undefined, deps);

      assert.equal(result.source, 'MANUAL');
      assert.equal(calls.fetchFredSeriesCalls.length, 0);
    },
  );
});

test('neither FRED nor manual fallback configured: skips cleanly with success=false, skipped=true', async () => {
  await withEnv(
    { FRED_API_KEY: undefined, MORTGAGE_RATE_30YR_FALLBACK: undefined, MORTGAGE_RATE_15YR_FALLBACK: undefined },
    async () => {
      const { deps, calls } = fakeDeps({
        fetchFredSeriesImpl: () => {
          throw new Error('must not be called');
        },
        ingestSnapshotImpl: () => {
          throw new Error('must not be called');
        },
      });

      const result = await ingestMortgageRatesJob(undefined, deps);

      assert.deepEqual(result, {
        success: false,
        source: 'NONE',
        date: null,
        rate30yr: null,
        rate15yr: null,
        created: false,
        skipped: true,
        reason: result.reason,
      });
      assert.match(result.reason, /FRED_API_KEY/);
      assert.equal(calls.ingestSnapshotArgs.length, 0);
    },
  );
});

test('a non-positive manual fallback value is treated as not configured', async () => {
  await withEnv(
    { FRED_API_KEY: undefined, MORTGAGE_RATE_30YR_FALLBACK: '0', MORTGAGE_RATE_15YR_FALLBACK: '5.75' },
    async () => {
      const { deps } = fakeDeps({
        fetchFredSeriesImpl: () => {
          throw new Error('must not be called');
        },
        ingestSnapshotImpl: () => {
          throw new Error('must not be called');
        },
      });

      const result = await ingestMortgageRatesJob(undefined, deps);

      assert.equal(result.success, false);
      assert.equal(result.skipped, true);
    },
  );
});
