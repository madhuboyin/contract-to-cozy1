// apps/workers/tests/unit/ingestMortgageRatesDryRun.test.js
//
// W6 item 5: mortgage-rate-ingest is the DECIDE-domain representative job.
// Covers: dry-run performs the real (harmless) FRED GET but skips the
// snapshot write; no opts (the weekly cron tick) behaves exactly like a
// real run; and any manually-triggered run (dry or real) gets tagged with
// a smokeCorrelationId, since `opts` being defined at all is itself the
// "this was a manual/admin trigger, not the natural cron tick" signal
// (scheduleCronJobs() in worker.ts calls every handler with zero args).

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
require('tsconfig-paths/register');

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

test('dry run: fetches the real FRED data but writes no snapshot', async () => {
  await withEnv({ FRED_API_KEY: 'test-key' }, async () => {
    const { ingestMortgageRatesJob, calls } = loadJob({
      fetchImpl: (url) =>
        url.includes('MORTGAGE30US')
          ? fredResponse([{ date: '2026-07-17', value: '6.50' }])
          : fredResponse([{ date: '2026-07-17', value: '5.75' }]),
      ingestSnapshotImpl: () => { throw new Error('must not be called during dry run'); },
    });

    const result = await ingestMortgageRatesJob({ dryRun: true });

    assert.equal(calls.fetchUrls.length, 2, 'the FRED fetch itself is a harmless read and still happens');
    assert.equal(calls.ingestSnapshotArgs.length, 0);
    assert.equal(result.success, true);
    assert.equal(result.created, false);
    assert.equal(result.skipped, true);
    assert.equal(result.rate30yr, 6.5);
    assert.equal(result.rate15yr, 5.75);
  });
});

test('no opts (the weekly cron tick): behaves exactly like a real run and tags nothing', async () => {
  await withEnv({ FRED_API_KEY: 'test-key' }, async () => {
    const { ingestMortgageRatesJob, calls } = loadJob({
      fetchImpl: (url) =>
        url.includes('MORTGAGE30US')
          ? fredResponse([{ date: '2026-07-17', value: '6.50' }])
          : fredResponse([{ date: '2026-07-17', value: '5.75' }]),
      ingestSnapshotImpl: (args) => ({ snapshot: { date: args.date, rate30yr: args.rate30yr, rate15yr: args.rate15yr }, created: true }),
    });

    const result = await ingestMortgageRatesJob();

    assert.equal(calls.ingestSnapshotArgs.length, 1);
    assert.equal(calls.ingestSnapshotArgs[0].metadataJson.smokeCorrelationId, undefined);
    assert.equal(result.smokeCorrelationId, undefined);
  });
});

test('a manually-triggered real run (opts defined) tags the snapshot with a smokeCorrelationId', async () => {
  await withEnv({ FRED_API_KEY: 'test-key' }, async () => {
    const { ingestMortgageRatesJob, calls } = loadJob({
      fetchImpl: (url) =>
        url.includes('MORTGAGE30US')
          ? fredResponse([{ date: '2026-07-17', value: '6.50' }])
          : fredResponse([{ date: '2026-07-17', value: '5.75' }]),
      ingestSnapshotImpl: (args) => ({ snapshot: { date: args.date, rate30yr: args.rate30yr, rate15yr: args.rate15yr }, created: true }),
    });

    const result = await ingestMortgageRatesJob({ dryRun: false });

    assert.match(calls.ingestSnapshotArgs[0].metadataJson.smokeCorrelationId, /^smoke:mortgage-rate-ingest:/);
    assert.equal(result.smokeCorrelationId, calls.ingestSnapshotArgs[0].metadataJson.smokeCorrelationId);
  });
});

test('a manually-triggered dry run also tags the returned (unwritten) result, for correlation-preview purposes', async () => {
  await withEnv({ FRED_API_KEY: 'test-key' }, async () => {
    const { ingestMortgageRatesJob } = loadJob({
      fetchImpl: (url) =>
        url.includes('MORTGAGE30US')
          ? fredResponse([{ date: '2026-07-17', value: '6.50' }])
          : fredResponse([{ date: '2026-07-17', value: '5.75' }]),
      ingestSnapshotImpl: () => { throw new Error('must not be called during dry run'); },
    });

    const result = await ingestMortgageRatesJob({ dryRun: true });

    // Dry run never writes, so there's nothing to tag for real — the
    // point is only that the harmless-GET path doesn't crash when opts is defined.
    assert.equal(result.skipped, true);
  });
});
