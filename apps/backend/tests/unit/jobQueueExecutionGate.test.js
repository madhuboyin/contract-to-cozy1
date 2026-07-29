// apps/backend/tests/unit/jobQueueExecutionGate.test.js
//
// W4 cross-cutting fix: JobQueueService#enqueuePropertyIntelligenceJobs and
// #addJob (called from property create/update, booking, warranty edits,
// financial reports — a background side-effect of many primary actions,
// not a primary action itself) previously bypassed evaluateWorkerExecution
// entirely. A blocked decision is logged and skipped, not thrown, so it
// never fails the caller's actual request (e.g. creating a property).
//
// Also covers the lazy-queue hang-trap fix itself: JobQueue.service.ts
// used to construct 7 real BullMQ Queues at module scope, opening real
// ioredis connections the instant the file was require()d. It's now safe
// to require the real module directly in a test — no fake/mock needed
// unless a queue's add()/getJob() is actually invoked.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

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

function loadFreshModule() {
  const path = require.resolve('../../src/services/JobQueue.service.ts');
  delete require.cache[path];
  return require(path);
}

test('requiring JobQueue.service.ts never constructs a real Queue (no Redis connection at import time)', () => {
  // If this hung or threw an ECONNREFUSED, the lazy-construction fix would
  // have regressed back to eager module-scope `new Queue(...)`.
  const mod = loadFreshModule();
  assert.equal(typeof mod.getPropertyIntelligenceQueue, 'function');
});

test('enqueuePropertyIntelligenceJobs enqueues all three jobs when the policy allows it', async () => {
  await withEnv({ WORKER_JOB_PROPERTY_INTELLIGENCE_ENABLED: 'true' }, async () => {
    const mod = loadFreshModule();
    const added = [];
    mod.getPropertyIntelligenceQueue.__setForTesting({
      add: async (name, data, opts) => {
        added.push({ name, data, opts });
        return { id: opts?.jobId ?? 'job' };
      },
      getJob: async () => undefined,
    });

    const service = new mod.JobQueueService();
    service.enqueueHomeDigitalTwinRefresh = async (propertyId) => {
      await mod.getPropertyIntelligenceQueue().add(
        'REFRESH_HOME_DIGITAL_TWIN',
        { propertyId, jobType: 'REFRESH_HOME_DIGITAL_TWIN' },
        { jobId: `${propertyId}-HOME-DIGITAL-TWIN` },
      );
    };
    const queued = await service.enqueuePropertyIntelligenceJobs('property-1');

    assert.equal(queued, true);
    assert.equal(added.length, 3);
  });
});

test('enqueuePropertyIntelligenceJobs skips (does not throw) when policy-disabled', async () => {
  await withEnv({ WORKER_JOB_PROPERTY_INTELLIGENCE_ENABLED: 'false' }, async () => {
    const mod = loadFreshModule();
    const added = [];
    mod.getPropertyIntelligenceQueue.__setForTesting({
      add: async (name, data, opts) => {
        added.push({ name, data, opts });
        return { id: opts?.jobId ?? 'job' };
      },
      getJob: async () => undefined,
    });

    const service = new mod.JobQueueService();
    const queued = await service.enqueuePropertyIntelligenceJobs('property-1');

    assert.equal(queued, false);
    assert.equal(added.length, 0, 'a background side-effect must not enqueue when policy-disabled');
  });
});

test('addJob (compatibility wrapper) also gates on the same policy', async () => {
  await withEnv({ WORKER_JOB_PROPERTY_INTELLIGENCE_ENABLED: 'false' }, async () => {
    const mod = loadFreshModule();
    const added = [];
    mod.getPropertyIntelligenceQueue.__setForTesting({
      add: async (name, data, opts) => {
        added.push({ name, data, opts });
        return { id: 'job' };
      },
      getJob: async () => undefined,
    });

    const service = new mod.JobQueueService();
    await service.addJob('CALCULATE_RISK_REPORT', { propertyId: 'property-1' });

    assert.equal(added.length, 0);
  });
});
