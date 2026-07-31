// apps/workers/tests/unit/cronLease.test.js
//
// WKR-007: cronLease.ts previously had zero test coverage despite being the
// only concurrency-safety mechanism between replicas (and, as of this
// slice, between a scheduled tick and a manual trigger too — see
// cronExecutionCoordinator.test.js). Covers the CAS acquire logic
// (updateMany-guard then create-on-P2002-loss), the ownership-guarded
// renew/release, and that a renew/release never touches a lease this
// process doesn't hold.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadCronLease({ updateManyImpl, createImpl } = {}) {
  const calls = { updateMany: [], create: [] };

  const prismaMock = {
    cronJobLock: {
      updateMany: async (args) => {
        calls.updateMany.push(args);
        if (updateManyImpl) return updateManyImpl(args);
        return { count: 0 };
      },
      create: async (args) => {
        calls.create.push(args);
        if (createImpl) return createImpl(args);
        return { ...args.data };
      },
    },
  };

  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const modulePath = require.resolve('../../src/lib/cronLease.ts');
  delete require.cache[modulePath];
  return { ...require(modulePath), calls };
}

test('acquireCronLease: claims an unowned/expired row via updateMany without needing create', async () => {
  const { acquireCronLease, calls } = loadCronLease({
    updateManyImpl: () => ({ count: 1 }),
  });

  const got = await acquireCronLease('freeze-risk-incidents', 60_000);

  assert.equal(got, true);
  assert.equal(calls.updateMany.length, 1);
  assert.equal(calls.create.length, 0);
  assert.deepEqual(calls.updateMany[0].where.jobKey, 'freeze-risk-incidents');
});

test('acquireCronLease: falls back to create() when no row exists yet, and wins', async () => {
  const { acquireCronLease, calls } = loadCronLease({
    updateManyImpl: () => ({ count: 0 }),
    createImpl: (args) => ({ ...args.data }),
  });

  const got = await acquireCronLease('home-briefing-delivery', 60_000);

  assert.equal(got, true);
  assert.equal(calls.create.length, 1);
  assert.equal(calls.create[0].data.jobKey, 'home-briefing-delivery');
});

test('acquireCronLease: loses gracefully when create() hits a unique-constraint race (P2002)', async () => {
  const { acquireCronLease } = loadCronLease({
    updateManyImpl: () => ({ count: 0 }),
    createImpl: () => {
      const err = new Error('Unique constraint failed');
      err.code = 'P2002';
      throw err;
    },
  });

  const got = await acquireCronLease('home-briefing-delivery', 60_000);

  assert.equal(got, false);
});

test('acquireCronLease: an unexpected updateMany error fails closed (does not fall through to create)', async () => {
  const { acquireCronLease, calls } = loadCronLease({
    updateManyImpl: () => {
      throw new Error('connection reset');
    },
  });

  const got = await acquireCronLease('home-briefing-delivery', 60_000);

  assert.equal(got, false);
  assert.equal(calls.create.length, 0);
});

test('renewCronLease: extends the TTL only when this process still owns the row (lockedBy guard)', async () => {
  const { renewCronLease, calls } = loadCronLease({
    updateManyImpl: () => ({ count: 1 }),
  });

  const renewed = await renewCronLease('freeze-risk-incidents', 60_000);

  assert.equal(renewed, true);
  assert.equal(calls.updateMany.length, 1);
  assert.ok('lockedBy' in calls.updateMany[0].where, 'renew must guard on lockedBy, not just jobKey');
});

test('renewCronLease: returns false when this process no longer owns the lease (already reclaimed)', async () => {
  const { renewCronLease } = loadCronLease({
    updateManyImpl: () => ({ count: 0 }),
  });

  const renewed = await renewCronLease('freeze-risk-incidents', 60_000);

  assert.equal(renewed, false);
});

test('renewCronLease: a thrown error fails closed rather than throwing out to the caller', async () => {
  const { renewCronLease } = loadCronLease({
    updateManyImpl: () => {
      throw new Error('connection reset');
    },
  });

  const renewed = await renewCronLease('freeze-risk-incidents', 60_000);

  assert.equal(renewed, false);
});

test('releaseCronLease: only updates rows this process owns (lockedBy guard), never throws', async () => {
  const { releaseCronLease, calls } = loadCronLease({
    updateManyImpl: () => ({ count: 1 }),
  });

  await releaseCronLease('freeze-risk-incidents');

  assert.equal(calls.updateMany.length, 1);
  assert.deepEqual(calls.updateMany[0].where.jobKey, 'freeze-risk-incidents');
  assert.ok('lockedBy' in calls.updateMany[0].where);
});
