// apps/workers/tests/unit/sharedSignalRefreshJob.test.js
//
// W4 item 4: runSharedSignalRefreshJob had no dedicated test. Research
// flagged a real coverage-gap risk worth asserting explicitly: the job
// silently caps to the 250 most-recently-created properties by default —
// once total property count exceeds that, older properties never get
// their shared signals refreshed again. Not fixed here (a product/ops
// decision, not a bug), but locked down as an explicit, visible contract
// via SHARED_SIGNAL_REFRESH_LIMIT assertions so a future change to that
// default doesn't happen silently.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { runSharedSignalRefreshJob } = require('../../src/jobs/sharedSignalRefresh.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({ properties, refreshResultFor, refreshShouldFailFor = new Set() }) {
  const calls = { findManyArgs: null, refreshedPropertyIds: [] };
  const deps = {
    prisma: {
      property: {
        findMany: async (args) => {
          calls.findManyArgs = args;
          return properties;
        },
      },
    },
    signalService: {
      refreshSignalsForProperty: async (propertyId) => {
        calls.refreshedPropertyIds.push(propertyId);
        if (refreshShouldFailFor.has(propertyId)) throw new Error(`refresh failed for ${propertyId}`);
        return refreshResultFor(propertyId);
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

test('defaults to a 250-property cap, most-recently-created first, when SHARED_SIGNAL_REFRESH_LIMIT is unset', async () => {
  await withEnv({ SHARED_SIGNAL_REFRESH_LIMIT: undefined }, async () => {
    const { deps, calls } = fakeDeps({
      properties: [],
      refreshResultFor: () => ({ refreshedSignals: [], skippedSignals: [], interactionCount: 0 }),
    });

    await runSharedSignalRefreshJob(deps);

    assert.equal(calls.findManyArgs.take, 250);
    assert.deepEqual(calls.findManyArgs.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
  });
});

test('honors a custom SHARED_SIGNAL_REFRESH_LIMIT', async () => {
  await withEnv({ SHARED_SIGNAL_REFRESH_LIMIT: '50' }, async () => {
    const { deps, calls } = fakeDeps({
      properties: [],
      refreshResultFor: () => ({ refreshedSignals: [], skippedSignals: [], interactionCount: 0 }),
    });

    await runSharedSignalRefreshJob(deps);

    assert.equal(calls.findManyArgs.take, 50);
  });
});

test('aggregates refreshed/skipped signal counts and interaction counts across all properties', async () => {
  const { deps } = fakeDeps({
    properties: [{ id: 'property-1' }, { id: 'property-2' }],
    refreshResultFor: (id) =>
      id === 'property-1'
        ? { refreshedSignals: ['s1', 's2'], skippedSignals: ['s3'], interactionCount: 4 }
        : { refreshedSignals: ['s4'], skippedSignals: [], interactionCount: 1 },
  });

  const result = await runSharedSignalRefreshJob(deps);

  assert.deepEqual(result, {
    processedProperties: 2,
    erroredProperties: 0,
    refreshedSignalCount: 3,
    skippedSignalCount: 1,
    interactionCount: 5,
  });
});

test('one property failing does not abort the batch and is counted as errored, not processed', async () => {
  const { deps, calls } = fakeDeps({
    properties: [{ id: 'property-1' }, { id: 'property-2' }],
    refreshResultFor: () => ({ refreshedSignals: ['s1'], skippedSignals: [], interactionCount: 0 }),
    refreshShouldFailFor: new Set(['property-1']),
  });

  const result = await runSharedSignalRefreshJob(deps);

  assert.equal(result.processedProperties, 1);
  assert.equal(result.erroredProperties, 1);
  assert.deepEqual(calls.refreshedPropertyIds, ['property-1', 'property-2'], 'both must still be attempted');
});
