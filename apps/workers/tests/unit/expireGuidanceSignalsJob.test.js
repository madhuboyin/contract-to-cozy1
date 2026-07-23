// apps/workers/tests/unit/expireGuidanceSignalsJob.test.js
//
// W4 item 4: expireGuidanceSignalsJob had no dedicated test. Small, pure
// job — two Prisma calls, no external services.
//
// W4 item 1 (DI refactor): dependencies are injected directly instead of
// via require.cache.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { expireGuidanceSignalsJob } = require('../../src/jobs/expireGuidanceSignals.job.ts');

const noopLogger = { info() {}, warn() {}, error() {}, debug() {}, fatal() {}, child() { return this; } };

function fakeDeps({ expiredSignals }) {
  const calls = { updateManyArgs: null };
  const deps = {
    prisma: {
      guidanceSignal: {
        findMany: async () => expiredSignals,
        updateMany: async (args) => {
          calls.updateManyArgs = args;
          return { count: args.where.id.in.length };
        },
      },
    },
    logger: noopLogger,
  };
  return { deps, calls };
}

test('archives every ACTIVE signal past its expiresAt', async () => {
  const { deps, calls } = fakeDeps({
    expiredSignals: [{ id: 'signal-1' }, { id: 'signal-2' }],
  });

  const result = await expireGuidanceSignalsJob(deps);

  assert.deepEqual(result, { archived: 2 });
  assert.deepEqual(calls.updateManyArgs.where.id.in, ['signal-1', 'signal-2']);
  assert.equal(calls.updateManyArgs.data.status, 'ARCHIVED');
  assert.ok(calls.updateManyArgs.data.archivedAt instanceof Date);
});

test('re-guards status: ACTIVE in the updateMany so a signal reactivated between the two queries is not clobbered', async () => {
  const { deps, calls } = fakeDeps({ expiredSignals: [{ id: 'signal-1' }] });

  await expireGuidanceSignalsJob(deps);

  assert.equal(calls.updateManyArgs.where.status, 'ACTIVE');
});

test('does nothing and does not call updateMany when nothing has expired', async () => {
  const { deps, calls } = fakeDeps({ expiredSignals: [] });

  const result = await expireGuidanceSignalsJob(deps);

  assert.deepEqual(result, { archived: 0 });
  assert.equal(calls.updateManyArgs, null);
});
