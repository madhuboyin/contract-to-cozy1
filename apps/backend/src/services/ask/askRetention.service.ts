import { prisma } from '../../lib/prisma';
import { askRetentionDeletionsTotal } from '../../lib/metrics';

export async function purgeExpiredAskSessions(now = new Date(), batchSize = 500): Promise<number> {
  const expired = await prisma.askSession.findMany({
    where: { expiresAt: { lte: now } },
    select: { id: true },
    orderBy: { expiresAt: 'asc' },
    take: Math.max(1, Math.min(batchSize, 2_000)),
  });
  if (!expired.length) return 0;
  const deleted = await prisma.askSession.deleteMany({ where: { id: { in: expired.map(({ id }) => id) } } });
  askRetentionDeletionsTotal.inc({ reason: 'expired' }, deleted.count);
  return deleted.count;
}

// AskSession.expiresAt slides forward on every new message in that session
// (createAskExecution), so a session a homeowner touches at least once per
// retention window never reaches purgeExpiredAskSessions. Each individual
// AskExecution instead gets a fixed expiresAt at its own creation time that
// never moves, so this purges raw execution content (message text, resolved
// parameters, results, and their cascaded events/capture/confirmation
// receipts) on its own 30-day clock regardless of how active the parent
// session stays. This does not delete the session row itself, only content
// that has individually aged out.
export async function purgeExpiredAskExecutions(now = new Date(), batchSize = 500): Promise<number> {
  const expired = await prisma.askExecution.findMany({
    where: { expiresAt: { lte: now } },
    select: { id: true },
    orderBy: { expiresAt: 'asc' },
    take: Math.max(1, Math.min(batchSize, 2_000)),
  });
  if (!expired.length) return 0;
  const deleted = await prisma.askExecution.deleteMany({ where: { id: { in: expired.map(({ id }) => id) } } });
  askRetentionDeletionsTotal.inc({ reason: 'execution_expired' }, deleted.count);
  return deleted.count;
}

export async function purgeExpiredAskFeedback(retentionDays: number, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const deleted = await prisma.feedback.deleteMany({
    where: { page: { startsWith: 'ask:execution:' }, createdAt: { lte: cutoff } },
  });
  return deleted.count;
}

export async function deleteAskSessionForUser(userId: string, sessionId: string): Promise<boolean> {
  const session = await prisma.askSession.findFirst({ where: { id: sessionId, userId }, select: { executions: { select: { id: true } } } });
  if (!session) return false;
  const pages = session.executions.map(({ id }) => `ask:execution:${id}`);
  const deleted = await prisma.$transaction(async (tx) => {
    if (pages.length) await tx.feedback.deleteMany({ where: { userId, page: { in: pages } } });
    return tx.askSession.deleteMany({ where: { id: sessionId, userId } });
  });
  if (deleted.count) askRetentionDeletionsTotal.inc({ reason: 'user_request' }, deleted.count);
  return deleted.count > 0;
}
