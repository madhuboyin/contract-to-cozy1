import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

/**
 * Sweeps ACTIVE GuidanceSignals whose expiresAt has passed and transitions
 * them to ARCHIVED status. Runs daily so expired signals never linger in
 * active queries longer than ~24 hours past their expiry time.
 */
export async function expireGuidanceSignalsJob(): Promise<{ archived: number }> {
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
