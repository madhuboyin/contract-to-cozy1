// apps/workers/tests/unit/refreshNeighborhoodEventsJob.test.js
//
// W4 item 4: refreshNeighborhoodEventsJob had no dedicated test. Covers
// the NEIGHBORHOOD_REFRESH_ENABLED kill switch, the empty-properties early
// exit, paginated batch iteration across multiple pages, and the existing
// per-property error isolation.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { refreshNeighborhoodEventsJob } = require('../../src/jobs/refreshNeighborhoodEvents.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({ propertyCount, pages, recomputeShouldFailFor = new Set() }) {
  const calls = { recomputed: [], findManyArgs: [] };

  const deps = {
    prisma: {
      property: {
        count: async () => propertyCount,
        findMany: async (args) => {
          calls.findManyArgs.push(args);
          const pageIndex = args.skip / 20;
          return pages[pageIndex] ?? [];
        },
      },
    },
    matchService: {
      recomputePropertyNeighborhoodRadar: async (propertyId) => {
        calls.recomputed.push(propertyId);
        if (recomputeShouldFailFor.has(propertyId)) throw new Error(`recompute failed for ${propertyId}`);
        return { processed: 1 };
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

test('is a no-op when NEIGHBORHOOD_REFRESH_ENABLED=false', async () => {
  await withEnv({ NEIGHBORHOOD_REFRESH_ENABLED: 'false' }, async () => {
    const { deps, calls } = fakeDeps({ propertyCount: 5, pages: [[{ id: 'p1' }]] });

    await refreshNeighborhoodEventsJob(undefined, deps);

    assert.equal(calls.recomputed.length, 0);
    assert.equal(calls.findManyArgs.length, 0, 'must not even query for properties');
  });
});

test('runs when the flag is unset (defaults to enabled)', async () => {
  await withEnv({ NEIGHBORHOOD_REFRESH_ENABLED: undefined }, async () => {
    const { deps, calls } = fakeDeps({
      propertyCount: 1,
      pages: [[{ id: 'p1' }]],
    });

    await refreshNeighborhoodEventsJob(undefined, deps);

    assert.deepEqual(calls.recomputed, ['p1']);
  });
});

test('does nothing when there are zero properties', async () => {
  await withEnv({ NEIGHBORHOOD_REFRESH_ENABLED: undefined }, async () => {
    const { deps, calls } = fakeDeps({ propertyCount: 0, pages: [] });

    await refreshNeighborhoodEventsJob(undefined, deps);

    assert.equal(calls.recomputed.length, 0);
  });
});

test('paginates across multiple batches until every property is processed', async () => {
  await withEnv({ NEIGHBORHOOD_REFRESH_ENABLED: undefined }, async () => {
    const { deps, calls } = fakeDeps({
      propertyCount: 25,
      pages: [
        Array.from({ length: 20 }, (_, i) => ({ id: `p${i}` })),
        Array.from({ length: 5 }, (_, i) => ({ id: `p${20 + i}` })),
      ],
    });

    await refreshNeighborhoodEventsJob(undefined, deps);

    assert.equal(calls.recomputed.length, 25);
    assert.equal(calls.findManyArgs.length, 2, 'must fetch exactly 2 pages for 25 properties at batch size 20');
  });
});

test('one property failing does not abort the batch for the rest', async () => {
  await withEnv({ NEIGHBORHOOD_REFRESH_ENABLED: undefined }, async () => {
    const { deps, calls } = fakeDeps({
      propertyCount: 3,
      pages: [[{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]],
      recomputeShouldFailFor: new Set(['p2']),
    });

    await assert.doesNotReject(() => refreshNeighborhoodEventsJob(undefined, deps));

    assert.deepEqual(calls.recomputed, ['p1', 'p2', 'p3']);
  });
});
