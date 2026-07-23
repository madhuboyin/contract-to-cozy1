// apps/workers/tests/unit/refreshNeighborhoodEventsDryRun.test.js
//
// Worker audit follow-up slice: neighborhood-radar-refresh is one of the 3
// "shallow dry-run" jobs (Slice A2) — NeighborhoodPropertyMatchService's
// recompute has multiple interleaved deleteMany/upsert/createMany write
// sites, so dry-run here skips calling the service entirely rather than
// threading a dryRun param through it. Covers: dry-run skips the service
// call for every property but still counts what would happen; a scoped
// propertyId both filters the query and is independently re-checked
// against the operator allowlist; a real scoped run tags a
// smokeCorrelationId.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');
require('tsconfig-paths/register');

function loadJob({ propertyCount, pages, recomputeShouldFailFor = new Set() }) {
  const calls = { recomputed: [], findManyArgs: [], countArgs: [] };

  const prismaMock = {
    property: {
      count: async (args) => {
        calls.countArgs.push(args);
        return propertyCount;
      },
      findMany: async (args) => {
        calls.findManyArgs.push(args);
        const pageIndex = args.skip / 20;
        return pages[pageIndex] ?? [];
      },
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const servicePath = require.resolve('../../../backend/src/neighborhoodIntelligence/neighborhoodPropertyMatchService.ts');
  require.cache[servicePath] = {
    id: servicePath,
    filename: servicePath,
    loaded: true,
    exports: {
      NeighborhoodPropertyMatchService: class {
        async recomputePropertyNeighborhoodRadar(propertyId) {
          calls.recomputed.push(propertyId);
          if (recomputeShouldFailFor.has(propertyId)) throw new Error(`recompute failed for ${propertyId}`);
          return { processed: 1 };
        }
      },
    },
  };

  const jobPath = require.resolve('../../src/jobs/refreshNeighborhoodEvents.job.ts');
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

test('dry run: examines and counts properties but calls the service for none', () =>
  withEnv({ NEIGHBORHOOD_REFRESH_ENABLED: undefined }, async () => {
    const { refreshNeighborhoodEventsJob, calls } = loadJob({
      propertyCount: 2,
      pages: [[{ id: 'p1' }, { id: 'p2' }]],
    });

    const result = await refreshNeighborhoodEventsJob({ dryRun: true });

    assert.equal(calls.recomputed.length, 0);
    assert.equal(result.examined, 2);
    assert.equal(result.skipped, 2);
    assert.equal(result.smokeCorrelationId, undefined);
  }));

test('no opts (the weekly cron tick): behaves exactly like a real run', () =>
  withEnv({ NEIGHBORHOOD_REFRESH_ENABLED: undefined }, async () => {
    const { refreshNeighborhoodEventsJob, calls } = loadJob({
      propertyCount: 1,
      pages: [[{ id: 'p1' }]],
    });

    const result = await refreshNeighborhoodEventsJob();

    assert.deepEqual(calls.recomputed, ['p1']);
    assert.equal(result.refreshed, 1);
  }));

test('a scoped propertyId is applied as a query filter', () =>
  withEnv({ NEIGHBORHOOD_REFRESH_ENABLED: undefined }, async () => {
    const originalEnv = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'property-allowed';
    try {
      const { refreshNeighborhoodEventsJob, calls } = loadJob({
        propertyCount: 1,
        pages: [[{ id: 'property-allowed' }]],
      });

      await refreshNeighborhoodEventsJob({ dryRun: true, propertyId: 'property-allowed' });

      assert.equal(calls.countArgs[0].where.id, 'property-allowed');
      assert.equal(calls.findManyArgs[0].where.id, 'property-allowed');
    } finally {
      process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalEnv;
    }
  }));

test('a propertyId not in SMOKE_TEST_PROPERTY_ALLOWLIST is rejected outright, before any query runs', () =>
  withEnv({ NEIGHBORHOOD_REFRESH_ENABLED: undefined }, async () => {
    const originalEnv = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'some-other-property';
    try {
      const { refreshNeighborhoodEventsJob, calls } = loadJob({ propertyCount: 1, pages: [[{ id: 'p1' }]] });

      await assert.rejects(
        () => refreshNeighborhoodEventsJob({ dryRun: true, propertyId: 'property-not-allowed' }),
        /not in SMOKE_TEST_PROPERTY_ALLOWLIST/,
      );
      assert.equal(calls.countArgs.length, 0, 'must reject before querying, not after');
    } finally {
      process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalEnv;
    }
  }));

test('a real scoped run tags the result with a smokeCorrelationId', () =>
  withEnv({ NEIGHBORHOOD_REFRESH_ENABLED: undefined }, async () => {
    const originalEnv = process.env.SMOKE_TEST_PROPERTY_ALLOWLIST;
    process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = 'property-allowed';
    try {
      const { refreshNeighborhoodEventsJob, calls } = loadJob({
        propertyCount: 1,
        pages: [[{ id: 'property-allowed' }]],
      });

      const result = await refreshNeighborhoodEventsJob({ dryRun: false, propertyId: 'property-allowed' });

      assert.deepEqual(calls.recomputed, ['property-allowed']);
      assert.match(result.smokeCorrelationId, /^smoke:neighborhood-radar-refresh:/);
    } finally {
      process.env.SMOKE_TEST_PROPERTY_ALLOWLIST = originalEnv;
    }
  }));

test('an unscoped run (no propertyId) tags nothing', () =>
  withEnv({ NEIGHBORHOOD_REFRESH_ENABLED: undefined }, async () => {
    const { refreshNeighborhoodEventsJob } = loadJob({ propertyCount: 1, pages: [[{ id: 'p1' }]] });

    const result = await refreshNeighborhoodEventsJob();

    assert.equal(result.smokeCorrelationId, undefined);
  }));
