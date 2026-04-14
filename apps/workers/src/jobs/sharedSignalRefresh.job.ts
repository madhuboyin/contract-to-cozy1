import { prisma } from '../lib/prisma';
import { signalService } from '../../../backend/src/services/signal.service';
import { logger } from '../lib/logger';

export type SharedSignalRefreshJobSummary = {
  processedProperties: number;
  erroredProperties: number;
  refreshedSignalCount: number;
  skippedSignalCount: number;
  interactionCount: number;
};

export async function runSharedSignalRefreshJob(): Promise<SharedSignalRefreshJobSummary> {
  const limitEnv = Number(process.env.SHARED_SIGNAL_REFRESH_LIMIT ?? '0');
  const limit = Number.isFinite(limitEnv) && limitEnv > 0 ? Math.floor(limitEnv) : 250;

  const properties = await prisma.property.findMany({
    select: { id: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
  });

  let processedProperties = 0;
  let erroredProperties = 0;
  let refreshedSignalCount = 0;
  let skippedSignalCount = 0;
  let interactionCount = 0;

  for (const property of properties) {
    try {
      const refreshed = await signalService.refreshSignalsForProperty(property.id);
      processedProperties += 1;
      refreshedSignalCount += refreshed.refreshedSignals.length;
      skippedSignalCount += refreshed.skippedSignals.length;
      interactionCount += refreshed.interactionCount;
    } catch (error) {
      erroredProperties += 1;
      logger.error(`[shared-signal-refresh] Failed for property ${property.id}:`, error);
    }
  }

  logger.info(
    `[shared-signal-refresh] processed=${processedProperties} errors=${erroredProperties} ` +
      `refreshedSignals=${refreshedSignalCount} skippedSignals=${skippedSignalCount} interactions=${interactionCount}`,
  );

  return {
    processedProperties,
    erroredProperties,
    refreshedSignalCount,
    skippedSignalCount,
    interactionCount,
  };
}
