const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Ask Cozy Stage 3, Phase 2 (implementation plan §8/§20; FRD §22). Small,
// isolated module with a single prisma dependency -- genuinely runtime-mocked
// via require.cache injection for ../../src/lib/prisma.ts, same pattern as
// domainEventClaimToken.test.js / capabilityInvokePolicyEnforcement.test.js,
// rather than a source-governance (regex-on-text) test.

function loadModule({ askExecutionFindUnique, receiptFindUnique, homeEventUpdateMany } = {}) {
  const calls = { transaction: [], askExecutionFindUnique: [], receiptFindUnique: [], homeEventUpdateMany: [] };
  const prismaMock = {
    $transaction: async (ops) => {
      calls.transaction.push(ops);
      return Promise.all(ops);
    },
    askExecution: {
      findUnique: async (args) => {
        calls.askExecutionFindUnique.push(args);
        return askExecutionFindUnique ? askExecutionFindUnique(args) : null;
      },
      update: async (args) => args,
    },
    askConfirmationReceipt: {
      findUnique: async (args) => {
        calls.receiptFindUnique.push(args);
        return receiptFindUnique ? receiptFindUnique(args) : null;
      },
    },
    homeEvent: {
      updateMany: async (args) => {
        calls.homeEventUpdateMany.push(args);
        return homeEventUpdateMany ? homeEventUpdateMany(args) : { count: 0 };
      },
    },
  };

  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  delete require.cache[prismaPath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: prismaMock } };

  const modulePath = require.resolve('../../src/services/ask/captureLinkReconciliation.ts');
  delete require.cache[modulePath];
  return { ...require(modulePath), calls };
}

test('linkSiblingCaptureExecutions points both executions at each other atomically, in one transaction', async () => {
  const { linkSiblingCaptureExecutions, calls } = loadModule();

  await linkSiblingCaptureExecutions('exec-a', 'exec-b');

  assert.equal(calls.transaction.length, 1, 'must be a single $transaction call');
  assert.equal(calls.transaction[0].length, 2);
});

test('reconcileCaptureLink is a no-op when the execution has no linkedExecutionId', async () => {
  const { reconcileCaptureLink, calls } = loadModule({
    askExecutionFindUnique: () => ({ id: 'exec-a', linkedExecutionId: null }),
  });

  await reconcileCaptureLink('exec-a');

  assert.equal(calls.receiptFindUnique.length, 0, 'must never look up receipts without a linked sibling');
  assert.equal(calls.homeEventUpdateMany.length, 0);
});

test('reconcileCaptureLink is a no-op when only one side has completed', async () => {
  const { reconcileCaptureLink, calls } = loadModule({
    askExecutionFindUnique: () => ({ id: 'exec-a', linkedExecutionId: 'exec-b' }),
    receiptFindUnique: (args) => (
      args.where.executionId === 'exec-a'
        ? { status: 'COMPLETED', artifactType: 'HOME_EVENT', artifactId: 'event-1' }
        : { status: 'PENDING', artifactType: 'WARRANTY', artifactId: 'warranty-1' }
    ),
  });

  await reconcileCaptureLink('exec-a');

  assert.equal(calls.homeEventUpdateMany.length, 0, 'must not write until both sides are COMPLETED');
});

test('reconcileCaptureLink is a no-op when neither completed side is a HOME_EVENT/WARRANTY pair', async () => {
  const { reconcileCaptureLink, calls } = loadModule({
    askExecutionFindUnique: () => ({ id: 'exec-a', linkedExecutionId: 'exec-b' }),
    receiptFindUnique: () => ({ status: 'COMPLETED', artifactType: 'PROPERTY_FACT', artifactId: 'fact-1' }),
  });

  await reconcileCaptureLink('exec-a');

  assert.equal(calls.homeEventUpdateMany.length, 0);
});

test('reconcileCaptureLink links the HomeEvent to its sibling Warranty once both sides have completed', async () => {
  const { reconcileCaptureLink, calls } = loadModule({
    askExecutionFindUnique: () => ({ id: 'exec-a', linkedExecutionId: 'exec-b' }),
    receiptFindUnique: (args) => (
      args.where.executionId === 'exec-a'
        ? { status: 'COMPLETED', artifactType: 'HOME_EVENT', artifactId: 'event-1' }
        : { status: 'COMPLETED', artifactType: 'WARRANTY', artifactId: 'warranty-1' }
    ),
    homeEventUpdateMany: () => ({ count: 1 }),
  });

  await reconcileCaptureLink('exec-a');

  assert.equal(calls.homeEventUpdateMany.length, 1);
  assert.deepEqual(calls.homeEventUpdateMany[0].where, { id: 'event-1', warrantyId: null });
  assert.deepEqual(calls.homeEventUpdateMany[0].data, { warrantyId: 'warranty-1' });
});

test('reconcileCaptureLink is order-independent: works whichever side (self vs linked) holds the HOME_EVENT artifact', async () => {
  const { reconcileCaptureLink, calls } = loadModule({
    askExecutionFindUnique: () => ({ id: 'exec-b', linkedExecutionId: 'exec-a' }),
    receiptFindUnique: (args) => (
      args.where.executionId === 'exec-b'
        ? { status: 'COMPLETED', artifactType: 'WARRANTY', artifactId: 'warranty-1' }
        : { status: 'COMPLETED', artifactType: 'HOME_EVENT', artifactId: 'event-1' }
    ),
    homeEventUpdateMany: () => ({ count: 1 }),
  });

  await reconcileCaptureLink('exec-b');

  assert.deepEqual(calls.homeEventUpdateMany[0].where, { id: 'event-1', warrantyId: null });
  assert.deepEqual(calls.homeEventUpdateMany[0].data, { warrantyId: 'warranty-1' });
});

test('reconcileCaptureLink guards the write with warrantyId: null so a duplicate/retriggered reconcile is a genuine no-op', async () => {
  const { reconcileCaptureLink, calls } = loadModule({
    askExecutionFindUnique: () => ({ id: 'exec-a', linkedExecutionId: 'exec-b' }),
    receiptFindUnique: (args) => (
      args.where.executionId === 'exec-a'
        ? { status: 'COMPLETED', artifactType: 'HOME_EVENT', artifactId: 'event-1' }
        : { status: 'COMPLETED', artifactType: 'WARRANTY', artifactId: 'warranty-1' }
    ),
    homeEventUpdateMany: () => ({ count: 0 }), // already reconciled -- warrantyId no longer null
  });

  await assert.doesNotReject(reconcileCaptureLink('exec-a'));
  assert.equal(calls.homeEventUpdateMany.length, 1, 'still attempts the guarded write, which the DB safely elides');
});
