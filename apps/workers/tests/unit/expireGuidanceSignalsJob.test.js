// apps/workers/tests/unit/expireGuidanceSignalsJob.test.js
//
// W4 item 4: expireGuidanceSignalsJob had no dedicated test. Small, pure
// job — two Prisma calls, no external services.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadJob({ expiredSignals }) {
  const calls = { updateManyArgs: null };

  const prismaMock = {
    guidanceSignal: {
      findMany: async () => expiredSignals,
      updateMany: async (args) => {
        calls.updateManyArgs = args;
        return { count: args.where.id.in.length };
      },
    },
  };
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const jobPath = require.resolve('../../src/jobs/expireGuidanceSignals.job.ts');
  delete require.cache[jobPath];
  return { ...require(jobPath), calls };
}

test('archives every ACTIVE signal past its expiresAt', async () => {
  const { expireGuidanceSignalsJob, calls } = loadJob({
    expiredSignals: [{ id: 'signal-1' }, { id: 'signal-2' }],
  });

  const result = await expireGuidanceSignalsJob();

  assert.deepEqual(result, { archived: 2 });
  assert.deepEqual(calls.updateManyArgs.where.id.in, ['signal-1', 'signal-2']);
  assert.equal(calls.updateManyArgs.data.status, 'ARCHIVED');
  assert.ok(calls.updateManyArgs.data.archivedAt instanceof Date);
});

test('re-guards status: ACTIVE in the updateMany so a signal reactivated between the two queries is not clobbered', async () => {
  const { expireGuidanceSignalsJob, calls } = loadJob({ expiredSignals: [{ id: 'signal-1' }] });

  await expireGuidanceSignalsJob();

  assert.equal(calls.updateManyArgs.where.status, 'ACTIVE');
});

test('does nothing and does not call updateMany when nothing has expired', async () => {
  const { expireGuidanceSignalsJob, calls } = loadJob({ expiredSignals: [] });

  const result = await expireGuidanceSignalsJob();

  assert.deepEqual(result, { archived: 0 });
  assert.equal(calls.updateManyArgs, null);
});
