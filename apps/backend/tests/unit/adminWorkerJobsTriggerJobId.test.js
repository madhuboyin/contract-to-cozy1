// apps/backend/tests/unit/adminWorkerJobsTriggerJobId.test.js
//
// WKR-007 (partial)/admin-trigger-dedup: triggerJob() previously called
// q.add() with no jobId at all, so a double-click of the admin "Run Job"
// button queued two separate jobs — nothing at the BullMQ layer deduped
// them. This covers that a deterministic jobId is now passed, and that it
// dedupes an immediate repeat while still allowing a distinct later
// trigger (different params, or the same params after the dedup window)
// to queue normally.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const ENTRY = {
  key: 'test-job-id-job',
  name: 'Test Job Id Job',
  description: 'synthetic',
  category: 'HOME_INTELLIGENCE',
  schedule: 'Daily',
  cronExpression: '0 3 * * *',
  type: 'cron',
  queueName: 'cron-trigger-queue',
  jobName: 'test-job-id-job',
  triggerSupported: true,
  impact: 'READ_ONLY',
  customerJob: 'PLATFORM_OPERATIONS',
  defaultEnabledInBeta: true,
  supportsDryRun: true,
  supportsPropertyScope: true,
  humanApprovalClass: 'NONE',
};

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

function loadTriggerJob() {
  const calls = { added: [] };

  const bullmqPath = require.resolve('bullmq');
  require.cache[bullmqPath] = {
    id: bullmqPath,
    filename: bullmqPath,
    loaded: true,
    exports: {
      Queue: class FakeQueue {
        async add(name, data, opts) {
          calls.added.push({ name, data, opts });
          return { id: opts?.jobId ?? 'fake-job-id' };
        }
      },
      Worker: class FakeWorker {
        on() {}
      },
    },
  };

  const ioredisPath = require.resolve('ioredis');
  require.cache[ioredisPath] = {
    id: ioredisPath,
    filename: ioredisPath,
    loaded: true,
    exports: class FakeRedis {
      on() {}
    },
  };

  const registryPath = require.resolve('../../src/config/workerJobRegistry.ts');
  require.cache[registryPath] = {
    id: registryPath,
    filename: registryPath,
    loaded: true,
    exports: {
      canonicalWorkerJobKey: (jobKey) => jobKey,
      JOB_REGISTRY: [ENTRY],
      RUNNER_REGISTRY: [],
    },
  };

  const servicePath = require.resolve('../../src/services/adminWorkerJobs.service.ts');
  delete require.cache[servicePath];
  return { ...require(servicePath), calls };
}

test('triggerJob passes a deterministic jobId, not an auto-generated one', async () => {
  await withEnv({ SMOKE_TEST_PROPERTY_ALLOWLIST: 'property-1,property-2' }, async () => {
    const { triggerJob, calls } = loadTriggerJob();

    await triggerJob('test-job-id-job', { dryRun: true, propertyId: 'property-1' });

    assert.equal(calls.added.length, 1);
    assert.equal(typeof calls.added[0].opts.jobId, 'string');
    assert.match(calls.added[0].opts.jobId, /^manual-test-job-id-job-true-property-1-\d+$/);
  });
});

test('two immediate triggers with identical params produce the same jobId (BullMQ dedups it)', async () => {
  await withEnv({ SMOKE_TEST_PROPERTY_ALLOWLIST: 'property-1,property-2' }, async () => {
    const { triggerJob, calls } = loadTriggerJob();

    await triggerJob('test-job-id-job', { dryRun: true, propertyId: 'property-1' });
    await triggerJob('test-job-id-job', { dryRun: true, propertyId: 'property-1' });

    assert.equal(calls.added.length, 2); // the fake queue always records the call...
    assert.equal(calls.added[0].opts.jobId, calls.added[1].opts.jobId); // ...but a real Queue would no-op on the second
  });
});

test('a different dryRun value produces a different jobId', async () => {
  const { triggerJob, calls } = loadTriggerJob();

  await triggerJob('test-job-id-job', { dryRun: true });
  await triggerJob('test-job-id-job', { dryRun: false });

  assert.notEqual(calls.added[0].opts.jobId, calls.added[1].opts.jobId);
});

test('a different propertyId produces a different jobId', async () => {
  await withEnv({ SMOKE_TEST_PROPERTY_ALLOWLIST: 'property-1,property-2' }, async () => {
    const { triggerJob, calls } = loadTriggerJob();

    await triggerJob('test-job-id-job', { propertyId: 'property-1' });
    await triggerJob('test-job-id-job', { propertyId: 'property-2' });

    assert.notEqual(calls.added[0].opts.jobId, calls.added[1].opts.jobId);
  });
});

test('the same params after the dedup window produces a different jobId (a deliberate later re-trigger is not blocked forever)', async () => {
  const { triggerJob, calls } = loadTriggerJob();
  const originalNow = Date.now;
  try {
    let t = 1_700_000_000_000;
    Date.now = () => t;
    await triggerJob('test-job-id-job', { dryRun: true });
    t += 20_000; // past the 15s dedup window
    await triggerJob('test-job-id-job', { dryRun: true });
  } finally {
    Date.now = originalNow;
  }

  assert.notEqual(calls.added[0].opts.jobId, calls.added[1].opts.jobId);
});
