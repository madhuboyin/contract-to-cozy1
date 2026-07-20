// apps/backend/tests/unit/permitDisclosureExportGate.test.js
//
// W4 cross-cutting fix: requestDisclosureExport's on-demand enqueue
// previously bypassed evaluateWorkerExecution entirely. This is the
// user's primary requested action, so a blocked decision now fails the
// request before any PermitDisclosureExport row is created.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadService() {
  const calls = { creates: [], enqueued: [] };

  const prismaMock = {
    permitDisclosureExport: {
      create: async (args) => {
        calls.creates.push(args);
        return { id: 'export-1', ...args.data };
      },
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const jobQueuePath = require.resolve('../../src/services/JobQueue.service.ts');
  require.cache[jobQueuePath] = {
    id: jobQueuePath,
    filename: jobQueuePath,
    loaded: true,
    exports: {
      getGeneratePermitDisclosureQueue: () => ({
        add: async (name, data) => {
          calls.enqueued.push({ name, data });
          return { id: 'job-1' };
        },
      }),
    },
  };

  const presignPath = require.resolve('../../src/services/storage/presign.ts');
  require.cache[presignPath] = {
    id: presignPath,
    filename: presignPath,
    loaded: true,
    exports: { presignGetObject: async () => 'https://signed.example.com/x' },
  };

  const servicePath = require.resolve('../../src/services/permitTracker.service.ts');
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

test('requestDisclosureExport enqueues when the worker execution policy allows it', async () => {
  await withEnv({ WORKER_JOB_GENERATE_PERMIT_DISCLOSURE_ENABLED: 'true' }, async () => {
    const { permitTrackerService, calls } = loadService();

    const result = await permitTrackerService.requestDisclosureExport('property-1', 'user-1');

    assert.equal(result.exportId, 'export-1');
    assert.equal(calls.creates.length, 1);
    assert.equal(calls.enqueued.length, 1);
  });
});

test('requestDisclosureExport is blocked by per-job override and creates no row', async () => {
  await withEnv({ WORKER_JOB_GENERATE_PERMIT_DISCLOSURE_ENABLED: 'false' }, async () => {
    const { permitTrackerService, calls } = loadService();

    await assert.rejects(
      () => permitTrackerService.requestDisclosureExport('property-1', 'user-1'),
      (err) => {
        assert.equal(err.statusCode, 503);
        assert.equal(err.code, 'WORKER_JOB_DISABLED');
        return true;
      },
    );
    assert.equal(calls.creates.length, 0, 'must not create an export row when policy-disabled');
    assert.equal(calls.enqueued.length, 0);
  });
});
