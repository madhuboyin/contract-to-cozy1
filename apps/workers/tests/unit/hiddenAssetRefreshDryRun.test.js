// apps/workers/tests/unit/hiddenAssetRefreshDryRun.test.js
//
// Worker audit follow-up slice: hidden-asset-refresh is one of the 3
// "shallow dry-run" jobs (Slice A2) — HiddenAssetService.refreshMatchesInternal()
// has 6+ interleaved write call sites and is also invoked from the live
// property-intelligence pipeline, so dry-run here skips calling the service
// entirely rather than threading a dryRun param through it. Covers: dry-run
// skips the service call for every property but still counts what would
// happen; a scoped propertyId both filters the query and is independently
// re-checked against the operator allowlist; a real scoped run tags a
// smokeCorrelationId.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { runHiddenAssetRefreshJob } = require('../../src/jobs/hiddenAssetRefresh.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({ properties, refreshShouldFailFor = new Set() }) {
  const calls = { refreshed: [], findManyArgs: [] };

  const deps = {
    prisma: {
      property: {
        findMany: async (args) => {
          calls.findManyArgs.push(args);
          return properties;
        },
      },
    },
    hiddenAssetService: {
      refreshMatchesInternal: async (propertyId) => {
        calls.refreshed.push(propertyId);
        if (refreshShouldFailFor.has(propertyId)) {
          throw new Error(`refresh failed for ${propertyId}`);
        }
      },
    },
    logger: noopLogger,
  };

  return { deps, calls };
}

test('dry run: examines and counts properties but calls the service for none', async () => {
  const { deps, calls } = fakeDeps({
    properties: [{ id: 'property-1' }, { id: 'property-2' }],
  });

  const result = await runHiddenAssetRefreshJob({ dryRun: true }, deps);

  assert.equal(calls.refreshed.length, 0);
  assert.equal(result.examined, 2);
  assert.equal(result.skipped, 2);
  assert.equal(result.smokeCorrelationId, undefined);
});

test('no opts (the weekly cron tick): behaves exactly like a real run', async () => {
  const { deps, calls } = fakeDeps({
    properties: [{ id: 'property-1' }, { id: 'property-2' }],
  });

  const result = await runHiddenAssetRefreshJob(undefined, deps);

  assert.deepEqual(calls.refreshed, ['property-1', 'property-2']);
  assert.equal(result.refreshed, 2);
});

test('a scoped propertyId is applied as a query filter', async () => {
  const originalEnv = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
  process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'property-allowed';
  try {
    const { deps, calls } = fakeDeps({ properties: [{ id: 'property-allowed' }] });

    await runHiddenAssetRefreshJob({ dryRun: true, propertyId: 'property-allowed' }, deps);

    assert.equal(calls.findManyArgs[0].where.id, 'property-allowed');
  } finally {
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalEnv;
  }
});

test('a propertyId not in SMOKE_TEST_PROPERTY_ALLOWLIST is rejected outright, before any query runs', async () => {
  const originalEnv = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
  process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'some-other-property';
  try {
    const { deps, calls } = fakeDeps({ properties: [{ id: 'property-1' }] });

    await assert.rejects(
      () => runHiddenAssetRefreshJob({ dryRun: true, propertyId: 'property-not-allowed' }, deps),
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
    const { deps, calls } = fakeDeps({ properties: [{ id: 'property-allowed' }] });

    const result = await runHiddenAssetRefreshJob({ dryRun: false, propertyId: 'property-allowed' }, deps);

    assert.deepEqual(calls.refreshed, ['property-allowed']);
    assert.match(result.smokeCorrelationId, /^smoke:hidden-asset-refresh:/);
  } finally {
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalEnv;
  }
});

test('an unscoped run (no propertyId) tags nothing', async () => {
  const { deps } = fakeDeps({ properties: [{ id: 'property-1' }] });

  const result = await runHiddenAssetRefreshJob(undefined, deps);

  assert.equal(result.smokeCorrelationId, undefined);
});
