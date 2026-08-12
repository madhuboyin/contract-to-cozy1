const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const databaseUrl = process.env.ASK_ORPHAN_RECLAIM_ACCEPTANCE_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

// Regression coverage for a stuck-forever bug: a backend crash/restart
// between "status: RUNNING" and the follow-up write that records an
// operation's outcome left the row wedged at RUNNING permanently -- no
// in-process code ever ran again to move it forward, it was invisible to
// pending-work, and a retry with the same clientRequestId returned the
// same stuck row verbatim. This proves the orphan-reclaim sweep flips an
// old, confirmation-receipt-free RUNNING row to FAILED_RETRYABLE (both via
// getAskPendingWork and via createAskExecution's duplicate-request path),
// while leaving a genuinely fresh RUNNING row and a RUNNING row still
// inside a claimed confirmation lease untouched -- the command-claim
// system already owns correct recovery for the latter.
test('orphaned RUNNING executions are reclaimed to FAILED_RETRYABLE without disturbing in-flight or claimed rows', {
  skip: !databaseUrl,
  timeout: 60_000,
}, async () => {
  require('ts-node/register/transpile-only');
  const { prisma } = require('../../src/lib/prisma.ts');
  const { getAskPendingWork, createAskExecution } = require('../../src/services/ask/askOrchestrator.service.ts');

  const id = `ask-orphan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const homeowner = await prisma.user.create({
    data: {
      email: `${id}-homeowner@example.invalid`,
      firstName: 'Orphan',
      lastName: 'Reclaim',
      role: 'HOMEOWNER',
      passwordHash: 'acceptance-only-not-a-login',
      homeownerProfile: { create: {} },
    },
  });

  try {
    const session = await prisma.askSession.create({ data: { userId: homeowner.id, title: 'Orphan reclaim test' } });
    const longAgo = new Date(Date.now() - 5 * 60 * 1000);

    // 1. Orphaned: RUNNING, no confirmation receipt, well past the
    //    execution-timeout + grace threshold.
    const orphaned = await prisma.askExecution.create({
      data: { sessionId: session.id, userId: homeowner.id, clientRequestId: `${id}-orphaned`, message: 'What maintenance is overdue?', status: 'RUNNING' },
    });
    await prisma.askExecution.update({ where: { id: orphaned.id }, data: { updatedAt: longAgo } });

    // 2. Fresh: RUNNING, no confirmation receipt, just started.
    const fresh = await prisma.askExecution.create({
      data: { sessionId: session.id, userId: homeowner.id, clientRequestId: `${id}-fresh`, message: 'Which items are missing coverage?', status: 'RUNNING' },
    });

    // 3. Claimed: RUNNING with an active confirmation receipt, also old --
    //    must be left alone for confirmAskExecution's own lease recovery.
    const claimed = await prisma.askExecution.create({
      data: { sessionId: session.id, userId: homeowner.id, clientRequestId: `${id}-claimed`, message: 'Create a maintenance task', status: 'RUNNING', operationId: 'MAINTENANCE_TASK_CREATE' },
    });
    await prisma.askExecution.update({ where: { id: claimed.id }, data: { updatedAt: longAgo } });
    await prisma.askConfirmationReceipt.create({
      data: {
        executionId: claimed.id,
        idempotencyKey: `${id}-claimed-key`,
        confirmationVersion: 1,
        status: 'CLAIMED',
        inputHash: 'test-hash',
        leaseExpiresAt: longAgo,
      },
    });

    const items = await getAskPendingWork(homeowner.id, null);
    const itemIds = new Set(items.map((item) => item.execution.executionId));

    assert.ok(!itemIds.has(orphaned.id), 'reclaimed orphan should no longer read as pending work');
    assert.ok(!itemIds.has(fresh.id), 'a genuinely fresh RUNNING row is not old enough to be pending work either');
    assert.ok(itemIds.has(claimed.id), 'a claimed-confirmation RUNNING row remains visible for its own recovery path');

    const orphanedAfter = await prisma.askExecution.findUniqueOrThrow({ where: { id: orphaned.id } });
    assert.equal(orphanedAfter.status, 'FAILED_RETRYABLE');
    assert.equal(orphanedAfter.reasonCode, 'ASK_EXECUTION_INTERRUPTED');

    const freshAfter = await prisma.askExecution.findUniqueOrThrow({ where: { id: fresh.id } });
    assert.equal(freshAfter.status, 'RUNNING', 'fresh in-flight row must not be reclaimed');

    const claimedAfter = await prisma.askExecution.findUniqueOrThrow({ where: { id: claimed.id } });
    assert.equal(claimedAfter.status, 'RUNNING', 'claimed-confirmation row must not be reclaimed by the orphan sweep');

    // A retry reusing the same clientRequestId must not see the stuck
    // RUNNING row verbatim -- it should observe the reclaimed terminal state.
    const retryResponse = await createAskExecution(homeowner.id, {
      clientRequestId: `${id}-orphaned`,
      sessionId: session.id,
      message: 'What maintenance is overdue?',
    });
    assert.equal(retryResponse.status, 'FAILED_RETRYABLE');
  } finally {
    await prisma.user.delete({ where: { id: homeowner.id } }).catch(() => {});
    await prisma.$disconnect();
  }
});
