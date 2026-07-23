import { prisma } from '../lib/prisma';
import { logger, AppLogger } from '../lib/logger';

// W4 item 1: small, job-scoped dependency interface (see
// reserveFundBalanceReminder.job.ts for the pattern).
export interface ExpireGuidanceSignalsDeps {
  prisma: Pick<typeof prisma, 'guidanceSignal'>;
  logger: AppLogger;
}

const defaultDeps: ExpireGuidanceSignalsDeps = { prisma, logger };

/**
 * Sweeps ACTIVE GuidanceSignals whose expiresAt has passed and transitions
 * them to ARCHIVED status. Runs daily so expired signals never linger in
 * active queries longer than ~24 hours past their expiry time.
 */
export async function expireGuidanceSignalsJob(
  deps: ExpireGuidanceSignalsDeps = defaultDeps,
): Promise<{ archived: number }> {
  const { prisma, logger } = deps;
  const now = new Date();

  const expired = await prisma.guidanceSignal.findMany({
    where: {
      status: 'ACTIVE',
      expiresAt: { lte: now },
    },
    select: { id: true },
  });

  if (expired.length === 0) {
    return { archived: 0 };
  }

  await prisma.guidanceSignal.updateMany({
    where: {
      id: { in: expired.map((s) => s.id) },
      status: 'ACTIVE',
    },
    data: {
      status: 'ARCHIVED',
      archivedAt: now,
    },
  });

  logger.info(`[expire-guidance-signals] Archived ${expired.length} expired signal(s)`);
  return { archived: expired.length };
}
