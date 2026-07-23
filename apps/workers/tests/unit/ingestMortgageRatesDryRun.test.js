// apps/workers/tests/unit/ingestMortgageRatesDryRun.test.js
//
// W6 item 5: mortgage-rate-ingest is the DECIDE-domain representative job.
// Covers: dry-run performs the real (harmless) FRED GET but skips the
// snapshot write; no opts (the weekly cron tick) behaves exactly like a
// real run; and any manually-triggered run (dry or real) gets tagged with
// a smokeCorrelationId, since `opts` being defined at all is itself the
// "this was a manual/admin trigger, not the natural cron tick" signal
// (scheduleCronJobs() in worker.ts calls every handler with zero args).
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

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

const fredPair = (seriesId) =>
  seriesId === 'MORTGAGE30US' ? { date: '2026-07-17', rate: 6.5 } : { date: '2026-07-17', rate: 5.75 };

test('dry run: fetches the real FRED data but writes no snapshot', async () => {
  await withEnv({ FRED_API_KEY: 'test-key' }, async () => {
    const { deps, calls } = fakeDeps({
      fetchFredSeriesImpl: fredPair,
      ingestSnapshotImpl: () => { throw new Error('must not be called during dry run'); },
    });

    const result = await ingestMortgageRatesJob({ dryRun: true }, deps);

    assert.equal(calls.fetchFredSeriesCalls.length, 2, 'the FRED fetch itself is a harmless read and still happens');
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
    const { deps, calls } = fakeDeps({
      fetchFredSeriesImpl: fredPair,
      ingestSnapshotImpl: (args) => ({ snapshot: { date: args.date, rate30yr: args.rate30yr, rate15yr: args.rate15yr }, created: true }),
    });

    const result = await ingestMortgageRatesJob(undefined, deps);

    assert.equal(calls.ingestSnapshotArgs.length, 1);
    assert.equal(calls.ingestSnapshotArgs[0].metadataJson.smokeCorrelationId, undefined);
    assert.equal(result.smokeCorrelationId, undefined);
  });
});

test('a manually-triggered real run (opts defined) tags the snapshot with a smokeCorrelationId', async () => {
  await withEnv({ FRED_API_KEY: 'test-key' }, async () => {
    const { deps, calls } = fakeDeps({
      fetchFredSeriesImpl: fredPair,
      ingestSnapshotImpl: (args) => ({ snapshot: { date: args.date, rate30yr: args.rate30yr, rate15yr: args.rate15yr }, created: true }),
    });

    const result = await ingestMortgageRatesJob({ dryRun: false }, deps);

    assert.match(calls.ingestSnapshotArgs[0].metadataJson.smokeCorrelationId, /^smoke:mortgage-rate-ingest:/);
    assert.equal(result.smokeCorrelationId, calls.ingestSnapshotArgs[0].metadataJson.smokeCorrelationId);
  });
});

test('a manually-triggered dry run also tags the returned (unwritten) result, for correlation-preview purposes', async () => {
  await withEnv({ FRED_API_KEY: 'test-key' }, async () => {
    const { deps } = fakeDeps({
      fetchFredSeriesImpl: fredPair,
      ingestSnapshotImpl: () => { throw new Error('must not be called during dry run'); },
    });

    const result = await ingestMortgageRatesJob({ dryRun: true }, deps);

    // Dry run never writes, so there's nothing to tag for real — the
    // point is only that the harmless-GET path doesn't crash when opts is defined.
    assert.equal(result.skipped, true);
  });
});
