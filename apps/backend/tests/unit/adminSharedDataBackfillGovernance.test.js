// apps/backend/tests/unit/adminSharedDataBackfillGovernance.test.js
//
// W3 (home intelligence) — WKR-011 says shared-data-backfill is disabled by
// default in beta. The queued admin trigger path (adminWorkerJobs.service.ts
// #triggerJob) already enforced this via evaluateWorkerExecution, but
// runSharedDataBackfillHandler (the REST POST /admin/shared-data/backfill
// endpoint) called the backfill service directly with no equivalent gate —
// any admin holding the SHARED_DATA_OPERATE capability could run a real,
// unscoped write bypassing the beta safety default entirely.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadController({ runBackfillImpl } = {}) {
  const backfillCalls = [];
  const servicePath = require.resolve('../../src/services/sharedDataBackfill.service.ts');
  require.cache[servicePath] = {
    id: servicePath,
    filename: servicePath,
    loaded: true,
    exports: {
      sharedDataBackfillService: {
        runBackfill: async (input) => {
          backfillCalls.push(input);
          return runBackfillImpl ? runBackfillImpl(input) : { scanned: 0, updated: 0 };
        },
      },
    },
  };

  const controllerPath = require.resolve('../../src/controllers/adminSharedData.controller.ts');
  delete require.cache[controllerPath];
  return { controller: require(controllerPath), getBackfillCalls: () => backfillCalls };
}

function mockRes() {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

test('blocks the backfill by default (WORKER_JOB_SHARED_DATA_BACKFILL_ENABLED unset)', async () => {
  delete process.env.WORKER_JOB_SHARED_DATA_BACKFILL_ENABLED;
  const { controller, getBackfillCalls } = loadController();
  const res = mockRes();

  await controller.runSharedDataBackfillHandler({ body: { dryRun: false } }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.success, false);
  assert.equal(getBackfillCalls().length, 0, 'must not reach the backfill service when execution policy blocks it');
});

test('allows the backfill once explicitly enabled via the per-job override', async () => {
  process.env.WORKER_JOB_SHARED_DATA_BACKFILL_ENABLED = 'true';
  try {
    const { controller, getBackfillCalls } = loadController({ runBackfillImpl: () => ({ scanned: 5, updated: 2 }) });
    const res = mockRes();

    await controller.runSharedDataBackfillHandler({ body: { dryRun: true } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(getBackfillCalls().length, 1);
  } finally {
    delete process.env.WORKER_JOB_SHARED_DATA_BACKFILL_ENABLED;
  }
});
