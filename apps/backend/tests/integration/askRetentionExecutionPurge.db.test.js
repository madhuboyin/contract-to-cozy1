const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const databaseUrl = process.env.ASK_RETENTION_ACCEPTANCE_DATABASE_URL;
if (databaseUrl) process.env.DATABASE_URL = databaseUrl;

// Regression coverage for a retention gap: AskSession.expiresAt slides
// forward on every new message in that session (createAskExecution), so a
// session touched at least once per retention window never reaches
// purgeExpiredAskSessions. Each AskExecution instead gets a fixed
// expiresAt at its own creation time that never moves. This proves
// purgeExpiredAskExecutions purges an individually-aged-out execution (and
// its cascaded child rows) even while its parent session stays "active"
// (a future session.expiresAt), and leaves a not-yet-expired sibling
// execution and the session itself untouched.
test('purgeExpiredAskExecutions purges aged-out executions inside a still-active session', {
  skip: !databaseUrl,
  timeout: 60_000,
}, async () => {
  require('ts-node/register/transpile-only');
  const { prisma } = require('../../src/lib/prisma.ts');
  const { purgeExpiredAskExecutions, purgeExpiredAskSessions } = require('../../src/services/ask/askRetention.service.ts');

  const id = `ask-retention-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const homeowner = await prisma.user.create({
    data: {
      email: `${id}-homeowner@example.invalid`,
      firstName: 'Retention',
      lastName: 'Purge',
      role: 'HOMEOWNER',
      passwordHash: 'acceptance-only-not-a-login',
      homeownerProfile: { create: {} },
    },
  });

  try {
    const now = new Date();
    const sessionExpiresInFuture = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const session = await prisma.askSession.create({
      data: { userId: homeowner.id, title: 'Retention purge test', expiresAt: sessionExpiresInFuture },
    });

    const expiredExecution = await prisma.askExecution.create({
      data: {
        sessionId: session.id,
        userId: homeowner.id,
        clientRequestId: `${id}-expired`,
        message: 'What maintenance is overdue?',
        status: 'ANSWERED',
        expiresAt: new Date(now.getTime() - 60 * 1000),
      },
    });
    await prisma.askExecutionEvent.create({
      data: { executionId: expiredExecution.id, eventType: 'RECEIVED', metadataJson: { surface: 'test' } },
    });
    const freshExecution = await prisma.askExecution.create({
      data: {
        sessionId: session.id,
        userId: homeowner.id,
        clientRequestId: `${id}-fresh`,
        message: 'Which items are missing coverage?',
        status: 'ANSWERED',
        expiresAt: new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000),
      },
    });

    // The bug this guards: purging by session expiry alone leaves the
    // expired execution in place because the session's own expiresAt was
    // pushed 30 days out by the (simulated) later message.
    const sessionDeletions = await purgeExpiredAskSessions(now);
    assert.equal(sessionDeletions, 0, 'still-active session must not be deleted by session-level purge');
    assert.ok(await prisma.askExecution.findUnique({ where: { id: expiredExecution.id } }), 'expired execution should still exist before execution-level purge runs');

    const executionDeletions = await purgeExpiredAskExecutions(now);
    assert.ok(executionDeletions >= 1);

    assert.equal(await prisma.askExecution.findUnique({ where: { id: expiredExecution.id } }), null, 'aged-out execution must be purged');
    assert.equal(await prisma.askExecutionEvent.findFirst({ where: { executionId: expiredExecution.id } }), null, 'cascaded events must be purged with the execution');
    assert.ok(await prisma.askExecution.findUnique({ where: { id: freshExecution.id } }), 'not-yet-expired execution must be preserved');
    assert.ok(await prisma.askSession.findUnique({ where: { id: session.id } }), 'session row itself must not be deleted by execution-level purge');
  } finally {
    await prisma.user.delete({ where: { id: homeowner.id } }).catch(() => {});
    await prisma.$disconnect();
  }
});
