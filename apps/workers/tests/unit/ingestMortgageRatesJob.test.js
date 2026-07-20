// apps/workers/tests/unit/ingestMortgageRatesJob.test.js
//
// W4 item 4: ingestMortgageRatesJob had no dedicated test despite a
// well-structured 3-tier fallback chain (FRED API → manual env fallback →
// clean skip) that's easy to get wrong silently. Covers every branch.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function fredResponse(observations) {
  return { ok: true, status: 200, statusText: 'OK', json: async () => ({ observations }) };
}

function loadJob({ fetchImpl, ingestSnapshotImpl }) {
  const calls = { fetchUrls: [], ingestSnapshotArgs: [] };

  const nodeFetchPath = require.resolve('node-fetch');
  require.cache[nodeFetchPath] = {
    id: nodeFetchPath,
    filename: nodeFetchPath,
    loaded: true,
    exports: {
      __esModule: true,
      default: async (url, opts) => {
        calls.fetchUrls.push(url);
        return fetchImpl(url, opts);
      },
    },
  };

  const servicePath = require.resolve('../../../backend/src/refinanceRadar/engine/mortgageRate.service.ts');
  require.cache[servicePath] = {
    id: servicePath,
    filename: servicePath,
    loaded: true,
    exports: {
      MortgageRateService: class {
        async ingestSnapshot(args) {
          calls.ingestSnapshotArgs.push(args);
          return ingestSnapshotImpl(args);
        }
      },
    },
  };

  const jobPath = require.resolve('../../src/jobs/ingestMortgageRates.job.ts');
  delete require.cache[jobPath];
  return { ...require(jobPath), calls };
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
    const { ingestMortgageRatesJob, calls } = loadJob({
      fetchImpl: (url) =>
        url.includes('MORTGAGE30US')
          ? fredResponse([{ date: '2026-07-17', value: '6.50' }])
          : fredResponse([{ date: '2026-07-17', value: '5.75' }]),
      ingestSnapshotImpl: (args) => ({ snapshot: { date: args.date, rate30yr: args.rate30yr, rate15yr: args.rate15yr }, created: true }),
    });

    const result = await ingestMortgageRatesJob();

    assert.equal(result.success, true);
    assert.equal(result.source, 'FRED');
    assert.equal(result.rate30yr, 6.5);
    assert.equal(result.rate15yr, 5.75);
    assert.equal(calls.ingestSnapshotArgs[0].source, 'FRED');
  });
});

test('FRED returning "." (missing data) for one series falls through to manual fallback', async () => {
  await withEnv(
    { FRED_API_KEY: 'test-key', MORTGAGE_RATE_30YR_FALLBACK: '6.5', MORTGAGE_RATE_15YR_FALLBACK: '5.75' },
    async () => {
      const { ingestMortgageRatesJob, calls } = loadJob({
        fetchImpl: (url) =>
          url.includes('MORTGAGE30US') ? fredResponse([{ date: '2026-07-17', value: '.' }]) : fredResponse([{ date: '2026-07-17', value: '5.75' }]),
        ingestSnapshotImpl: (args) => ({ snapshot: { date: args.date, rate30yr: args.rate30yr, rate15yr: args.rate15yr }, created: true }),
      });

      const result = await ingestMortgageRatesJob();

      assert.equal(result.source, 'MANUAL');
      assert.equal(calls.ingestSnapshotArgs.length, 1, 'must not have called ingestSnapshot for the incomplete FRED result');
    },
  );
});

test('a thrown FRED fetch error falls through to manual fallback instead of crashing the job', async () => {
  await withEnv(
    { FRED_API_KEY: 'test-key', MORTGAGE_RATE_30YR_FALLBACK: '6.5', MORTGAGE_RATE_15YR_FALLBACK: '5.75' },
    async () => {
      const { ingestMortgageRatesJob, calls } = loadJob({
        fetchImpl: () => {
          throw new Error('network down');
        },
        ingestSnapshotImpl: (args) => ({ snapshot: { date: args.date, rate30yr: args.rate30yr, rate15yr: args.rate15yr }, created: true }),
      });

      const result = await ingestMortgageRatesJob();

      assert.equal(result.success, true);
      assert.equal(result.source, 'MANUAL');
      void calls;
    },
  );
});

test('no FRED_API_KEY set: uses manual fallback directly without attempting a fetch', async () => {
  await withEnv(
    { FRED_API_KEY: undefined, MORTGAGE_RATE_30YR_FALLBACK: '6.5', MORTGAGE_RATE_15YR_FALLBACK: '5.75' },
    async () => {
      const { ingestMortgageRatesJob, calls } = loadJob({
        fetchImpl: () => {
          throw new Error('must not be called');
        },
        ingestSnapshotImpl: (args) => ({ snapshot: { date: args.date, rate30yr: args.rate30yr, rate15yr: args.rate15yr }, created: false }),
      });

      const result = await ingestMortgageRatesJob();

      assert.equal(result.source, 'MANUAL');
      assert.equal(calls.fetchUrls.length, 0);
    },
  );
});

test('neither FRED nor manual fallback configured: skips cleanly with success=false, skipped=true', async () => {
  await withEnv(
    { FRED_API_KEY: undefined, MORTGAGE_RATE_30YR_FALLBACK: undefined, MORTGAGE_RATE_15YR_FALLBACK: undefined },
    async () => {
      const { ingestMortgageRatesJob, calls } = loadJob({
        fetchImpl: () => {
          throw new Error('must not be called');
        },
        ingestSnapshotImpl: () => {
          throw new Error('must not be called');
        },
      });

      const result = await ingestMortgageRatesJob();

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
      const { ingestMortgageRatesJob } = loadJob({
        fetchImpl: () => {
          throw new Error('must not be called');
        },
        ingestSnapshotImpl: () => {
          throw new Error('must not be called');
        },
      });

      const result = await ingestMortgageRatesJob();

      assert.equal(result.success, false);
      assert.equal(result.skipped, true);
    },
  );
});
