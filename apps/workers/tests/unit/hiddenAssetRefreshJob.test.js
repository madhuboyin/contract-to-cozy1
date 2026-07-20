// apps/workers/tests/unit/hiddenAssetRefreshJob.test.js
//
// W4 item 4: runHiddenAssetRefreshJob had no dedicated test. Thin
// per-property wrapper around HiddenAssetService (the real logic lives
// there, out of scope) — coverage focuses on the batch loop's existing
// per-property error isolation and that every property gets attempted.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadJob({ properties, refreshShouldFailFor = new Set() }) {
  const calls = { refreshed: [] };

  const prismaMock = {
    property: { findMany: async () => properties },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const servicePath = require.resolve('../../../backend/src/services/hiddenAssets.service.ts');
  require.cache[servicePath] = {
    id: servicePath,
    filename: servicePath,
    loaded: true,
    exports: {
      HiddenAssetService: class {
        async refreshMatchesInternal(propertyId) {
          calls.refreshed.push(propertyId);
          if (refreshShouldFailFor.has(propertyId)) {
            throw new Error(`refresh failed for ${propertyId}`);
          }
        }
      },
    },
  };

  const jobPath = require.resolve('../../src/jobs/hiddenAssetRefresh.job.ts');
  delete require.cache[jobPath];
  return { ...require(jobPath), calls };
}

test('refreshes every property', async () => {
  const { runHiddenAssetRefreshJob, calls } = loadJob({
    properties: [{ id: 'property-1' }, { id: 'property-2' }, { id: 'property-3' }],
  });

  await runHiddenAssetRefreshJob();

  assert.deepEqual(calls.refreshed, ['property-1', 'property-2', 'property-3']);
});

test('one property failing does not abort the batch for the rest', async () => {
  const { runHiddenAssetRefreshJob, calls } = loadJob({
    properties: [{ id: 'property-1' }, { id: 'property-2' }, { id: 'property-3' }],
    refreshShouldFailFor: new Set(['property-2']),
  });

  await assert.doesNotReject(() => runHiddenAssetRefreshJob());

  assert.deepEqual(calls.refreshed, ['property-1', 'property-2', 'property-3'], 'must still attempt every property');
});

test('does nothing when there are no properties', async () => {
  const { runHiddenAssetRefreshJob, calls } = loadJob({ properties: [] });

  await runHiddenAssetRefreshJob();

  assert.equal(calls.refreshed.length, 0);
});
