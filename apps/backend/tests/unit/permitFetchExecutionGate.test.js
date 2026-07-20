// apps/backend/tests/unit/permitFetchExecutionGate.test.js
//
// W4 cross-cutting fix: on-demand BullMQ enqueues (triggerFetch's
// 'permit-fetch' job, and runFetch's chained 'detect-unpermitted-work'
// follow-up) previously bypassed evaluateWorkerExecution entirely — a
// WORKER_JOB_<KEY>_ENABLED=false override, or the group
// WORKER_EXTERNAL_INGEST_ENABLED flag permit-fetch's externalProvider
// requires, had zero effect. triggerFetch is the user's primary requested
// action, so a blocked decision now fails the request (before any row is
// created). The chained detect-unpermitted-work enqueue is a secondary
// automatic follow-up, so a blocked decision is logged and skipped instead
// — it must never turn an otherwise-successful permit fetch into a
// FAILED one.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadService({
  property = { address: '123 Main St', city: 'Springfield', state: 'IL', zipCode: '62701' },
  dataSource = { id: 'source-1', adapterType: 'SOCRATA', normalizedCoverageKey: 'US-IL-springfield' },
  contextAllowed = true,
} = {}) {
  const calls = { permitFetchEnqueued: [], detectUnpermittedWorkEnqueued: [], fetchJobUpdates: [] };

  const prismaMock = {
    property: { findUnique: async () => property },
    permitDataSource: {
      findFirst: async () => dataSource,
      update: async () => ({}),
    },
    permitFetchJob: {
      create: async (args) => ({ id: 'fetch-job-1', ...args.data }),
      findUnique: async () => ({
        id: 'fetch-job-1',
        propertyId: 'property-1',
        dataSourceId: dataSource?.id,
        dataSource,
        property,
      }),
      update: async (args) => {
        calls.fetchJobUpdates.push(args);
        return { id: 'fetch-job-1', ...args.data };
      },
    },
    propertyPermitRecord: {
      upsert: async () => ({}),
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const contextPath = require.resolve('../../src/services/projectCompliance/permitWorkerContext.service.ts');
  require.cache[contextPath] = {
    id: contextPath,
    filename: contextPath,
    loaded: true,
    exports: {
      checkPermitWorkerContext: async () => ({ allowed: contextAllowed, reasonCodes: contextAllowed ? [] : ['TEST_BLOCKED'] }),
    },
  };

  const socrataPath = require.resolve('../../src/services/permitAdapters/socrata.adapter.ts');
  require.cache[socrataPath] = {
    id: socrataPath,
    filename: socrataPath,
    loaded: true,
    exports: { socrataAdapter: { fetchPermits: async () => [] } },
  };

  const accelaPath = require.resolve('../../src/services/permitAdapters/accela.adapter.ts');
  require.cache[accelaPath] = {
    id: accelaPath,
    filename: accelaPath,
    loaded: true,
    exports: { accelaAdapter: { fetchPermits: async () => [] } },
  };

  const normalizerPath = require.resolve('../../src/services/permitAdapters/permitNormalizer.ts');
  require.cache[normalizerPath] = {
    id: normalizerPath,
    filename: normalizerPath,
    loaded: true,
    exports: { permitNormalizer: { normalize: (r) => r } },
  };

  // W4 fix: getPermitFetchQueue/getDetectUnpermittedWorkQueue lazily
  // construct real BullMQ Queues — stub each as a plain function returning
  // an in-memory fake, no require.cache['bullmq'] or real Redis involved.
  const jobQueuePath = require.resolve('../../src/services/JobQueue.service.ts');
  require.cache[jobQueuePath] = {
    id: jobQueuePath,
    filename: jobQueuePath,
    loaded: true,
    exports: {
      getPermitFetchQueue: () => ({
        add: async (name, data) => {
          calls.permitFetchEnqueued.push({ name, data });
          return { id: 'job-1' };
        },
      }),
      getDetectUnpermittedWorkQueue: () => ({
        add: async (name, data) => {
          calls.detectUnpermittedWorkEnqueued.push({ name, data });
          return { id: 'job-2' };
        },
      }),
    },
  };

  const servicePath = require.resolve('../../src/services/permitFetch.service.ts');
  delete require.cache[servicePath];
  return { ...require(servicePath), calls };
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

test('triggerFetch enqueues when the worker execution policy allows it', async () => {
  await withEnv({ WORKER_JOB_PERMIT_FETCH_ENABLED: 'true' }, async () => {
    const { permitFetchService, calls } = loadService();

    const result = await permitFetchService.triggerFetch('property-1', 'USER_REQUEST');

    assert.equal(result.fetchJobId, 'fetch-job-1');
    assert.equal(calls.permitFetchEnqueued.length, 1);
  });
});

test('triggerFetch is blocked by default (WORKER_EXTERNAL_INGEST_ENABLED defaults to false) and creates no row', async () => {
  await withEnv({ WORKER_JOB_PERMIT_FETCH_ENABLED: undefined, WORKER_EXTERNAL_INGEST_ENABLED: undefined }, async () => {
    const { permitFetchService, calls } = loadService();

    await assert.rejects(
      () => permitFetchService.triggerFetch('property-1', 'USER_REQUEST'),
      (err) => {
        assert.equal(err.statusCode, 503);
        assert.equal(err.code, 'WORKER_JOB_DISABLED');
        return true;
      },
    );
    assert.equal(calls.permitFetchEnqueued.length, 0);
  });
});

test('runFetch enqueues the detect-unpermitted-work follow-up when its policy allows it', async () => {
  await withEnv({ WORKER_JOB_DETECT_UNPERMITTED_WORK_ENABLED: 'true' }, async () => {
    const { permitFetchService, calls } = loadService();

    await permitFetchService.runFetch('fetch-job-1');

    assert.equal(calls.detectUnpermittedWorkEnqueued.length, 1);
    const completedUpdate = calls.fetchJobUpdates.find((u) => u.data.status === 'COMPLETED');
    assert.ok(completedUpdate, 'the fetch itself must still complete successfully');
  });
});

test('runFetch skips (does not throw or fail the fetch) when detect-unpermitted-work is policy-disabled', async () => {
  await withEnv(
    { WORKER_JOB_DETECT_UNPERMITTED_WORK_ENABLED: 'false', WORKER_JOB_PERMIT_FETCH_ENABLED: undefined },
    async () => {
      const { permitFetchService, calls } = loadService();

      await permitFetchService.runFetch('fetch-job-1');

      assert.equal(calls.detectUnpermittedWorkEnqueued.length, 0, 'must not enqueue when policy-disabled');
      const completedUpdate = calls.fetchJobUpdates.find((u) => u.data.status === 'COMPLETED');
      assert.ok(completedUpdate, 'a disabled follow-up job must not fail the otherwise-successful fetch');
      const failedUpdate = calls.fetchJobUpdates.find((u) => u.data.status === 'FAILED');
      assert.ok(!failedUpdate, 'must not be marked FAILED just because the follow-up job is disabled');
    },
  );
});
