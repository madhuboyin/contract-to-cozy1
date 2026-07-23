// apps/workers/tests/unit/hiddenAssetRefreshJob.test.js
//
// W4 item 4: runHiddenAssetRefreshJob had no dedicated test. Thin
// per-property wrapper around HiddenAssetService (the real logic lives
// there, out of scope) — coverage focuses on the batch loop's existing
// per-property error isolation and that every property gets attempted.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { runHiddenAssetRefreshJob } = require('../../src/jobs/hiddenAssetRefresh.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({ properties, refreshShouldFailFor = new Set() }) {
  const calls = { refreshed: [] };

  const deps = {
    prisma: {
      property: { findMany: async () => properties },
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

test('refreshes every property', async () => {
  const { deps, calls } = fakeDeps({
    properties: [{ id: 'property-1' }, { id: 'property-2' }, { id: 'property-3' }],
  });

  await runHiddenAssetRefreshJob(undefined, deps);

  assert.deepEqual(calls.refreshed, ['property-1', 'property-2', 'property-3']);
});

test('one property failing does not abort the batch for the rest', async () => {
  const { deps, calls } = fakeDeps({
    properties: [{ id: 'property-1' }, { id: 'property-2' }, { id: 'property-3' }],
    refreshShouldFailFor: new Set(['property-2']),
  });

  await assert.doesNotReject(() => runHiddenAssetRefreshJob(undefined, deps));

  assert.deepEqual(calls.refreshed, ['property-1', 'property-2', 'property-3'], 'must still attempt every property');
});

test('does nothing when there are no properties', async () => {
  const { deps, calls } = fakeDeps({ properties: [] });

  await runHiddenAssetRefreshJob(undefined, deps);

  assert.equal(calls.refreshed.length, 0);
});
