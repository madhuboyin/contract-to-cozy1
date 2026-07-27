// apps/backend/tests/unit/adminWorkerJobsTriggerDryRun.test.js
//
// W4 item 8: dry-run contract test for the manual-trigger path.
// triggerJob() now accepts { dryRun } and must reject it outright for any
// job whose registry entry doesn't declare supportsDryRun — a job with no
// real dry-run code path must never silently run "for real" (or silently
// no-op) just because a caller asked for a dry run. Uses two synthetic
// registry entries (not the real JOB_REGISTRY) so this test isolates the
// dry-run contract from the separate, already-covered execution-policy gate
// (workerExecutionPolicy.test.js) — both entries are built to trivially pass
// evaluateWorkerExecution under default env.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const DRY_RUN_SUPPORTED_ENTRY = {
  key: 'test-dry-run-supported',
  name: 'Test Dry-Run Supported Job',
  description: 'synthetic',
  category: 'HOME_INTELLIGENCE',
  schedule: 'Daily',
  cronExpression: '0 3 * * *',
  type: 'cron',
  queueName: 'cron-trigger-queue',
  jobName: 'test-dry-run-supported',
  triggerSupported: true,
  impact: 'READ_ONLY',
  customerJob: 'PLATFORM_OPERATIONS',
  defaultEnabledInBeta: true,
  supportsDryRun: true,
  supportsPropertyScope: false,
  humanApprovalClass: 'NONE',
};

const DRY_RUN_UNSUPPORTED_ENTRY = {
  ...DRY_RUN_SUPPORTED_ENTRY,
  key: 'test-dry-run-unsupported',
  jobName: 'test-dry-run-unsupported',
  supportsDryRun: false,
};

// W6 item 2/5: property-scope entries for the propertyId allowlist contract.
const PROPERTY_SCOPE_SUPPORTED_ENTRY = {
  ...DRY_RUN_SUPPORTED_ENTRY,
  key: 'test-property-scope-supported',
  jobName: 'test-property-scope-supported',
  supportsPropertyScope: true,
};

const PROPERTY_SCOPE_UNSUPPORTED_ENTRY = {
  ...DRY_RUN_SUPPORTED_ENTRY,
  key: 'test-property-scope-unsupported',
  jobName: 'test-property-scope-unsupported',
  supportsPropertyScope: false,
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

function loadTriggerJob({ addImpl } = {}) {
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
          if (addImpl) return addImpl(name, data, opts);
          return { id: 'fake-job-id' };
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
      JOB_REGISTRY: [
        DRY_RUN_SUPPORTED_ENTRY,
        DRY_RUN_UNSUPPORTED_ENTRY,
        PROPERTY_SCOPE_SUPPORTED_ENTRY,
        PROPERTY_SCOPE_UNSUPPORTED_ENTRY,
      ],
      RUNNER_REGISTRY: [],
    },
  };

  const servicePath = require.resolve('../../src/services/adminWorkerJobs.service.ts');
  delete require.cache[servicePath];
  return { ...require(servicePath), calls };
}

test('dryRun=true is queued as job data for a job that declares supportsDryRun', async () => {
  const { triggerJob, calls } = loadTriggerJob();

  const result = await triggerJob('test-dry-run-supported', { dryRun: true });

  assert.equal(result.queued, true);
  assert.equal(calls.added.length, 1);
  assert.equal(calls.added[0].name, 'test-dry-run-supported');
  assert.deepEqual(calls.added[0].data, { dryRun: true, propertyId: undefined });
});

test('dryRun=true is rejected outright for a job with no dry-run code path', async () => {
  const { triggerJob } = loadTriggerJob();

  await assert.rejects(
    () => triggerJob('test-dry-run-unsupported', { dryRun: true }),
    /Dry-run not supported for job: test-dry-run-unsupported/,
  );
});

test('omitting dryRun defaults to a real (non-dry) run for either job', async () => {
  const { triggerJob, calls } = loadTriggerJob();

  await triggerJob('test-dry-run-unsupported');

  assert.deepEqual(calls.added[0].data, { dryRun: false, propertyId: undefined });
});

test('an explicit dryRun=false is allowed even for a job that does not support dry-run at all', async () => {
  const { triggerJob, calls } = loadTriggerJob();

  const result = await triggerJob('test-dry-run-unsupported', { dryRun: false });

  assert.equal(result.queued, true);
  assert.deepEqual(calls.added[0].data, { dryRun: false, propertyId: undefined });
});

test('propertyId is rejected outright for a job that does not declare supportsPropertyScope', async () => {
  const { triggerJob } = loadTriggerJob();

  await assert.rejects(
    () => triggerJob('test-property-scope-unsupported', { propertyId: 'property-1' }),
    /Property scope not supported for job: test-property-scope-unsupported/,
  );
});

test('propertyId not in SMOKE_TEST_PROPERTY_ALLOWLIST is rejected even for a property-scope-capable job', async () => {
  await withEnv({ SMOKE_TEST_PROPERTY_ALLOWLIST: 'some-other-property' }, async () => {
    const { triggerJob } = loadTriggerJob();

    await assert.rejects(
      () => triggerJob('test-property-scope-supported', { propertyId: 'property-not-allowed' }),
      /is not in SMOKE_TEST_PROPERTY_ALLOWLIST/,
    );
  });
});

test('an allowlisted propertyId is queued as job data for a property-scope-capable job', async () => {
  await withEnv({ SMOKE_TEST_PROPERTY_ALLOWLIST: 'property-allowed' }, async () => {
    const { triggerJob, calls } = loadTriggerJob();

    const result = await triggerJob('test-property-scope-supported', { propertyId: 'property-allowed' });

    assert.equal(result.queued, true);
    assert.deepEqual(calls.added[0].data, { dryRun: false, propertyId: 'property-allowed' });
  });
});

test('allowlisted scoped dry-run is accepted while its per-job activation flag is false', async () => {
  await withEnv({
    SMOKE_TEST_PROPERTY_ALLOWLIST: 'property-allowed',
    WORKER_MANUAL_TRIGGERS_ENABLED: 'true',
    WORKER_JOB_TEST_PROPERTY_SCOPE_SUPPORTED_ENABLED: 'false',
  }, async () => {
    const { triggerJob, calls } = loadTriggerJob();

    const result = await triggerJob('test-property-scope-supported', {
      dryRun: true,
      propertyId: 'property-allowed',
    });

    assert.equal(result.queued, true);
    assert.deepEqual(calls.added[0].data, {
      dryRun: true,
      propertyId: 'property-allowed',
    });
  });
});

test('unscoped dry-run cannot bypass a disabled job', async () => {
  await withEnv({
    WORKER_MANUAL_TRIGGERS_ENABLED: 'true',
    WORKER_JOB_TEST_DRY_RUN_SUPPORTED_ENABLED: 'false',
  }, async () => {
    const { triggerJob } = loadTriggerJob();
    await assert.rejects(
      () => triggerJob('test-dry-run-supported', { dryRun: true }),
      /property-scoped dry-run required/,
    );
  });
});
