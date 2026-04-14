// apps/workers/src/jobs/refreshNeighborhoodEvents.job.ts
//
// Scheduled job: weekly batch recompute of all property neighborhood radars.
// Re-runs property-to-event proximity matching and impact generation for
// every active property so that newly ingested or updated events are linked.
//
// Schedule: Weekly (Sunday 5:00 AM EST via worker.ts cron)
// Can be disabled: NEIGHBORHOOD_REFRESH_ENABLED=false

import { NeighborhoodPropertyMatchService } from '../../../backend/src/neighborhoodIntelligence/neighborhoodPropertyMatchService';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const matchService = new NeighborhoodPropertyMatchService();

const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function refreshNeighborhoodEventsJob(): Promise<void> {
  const enabled = process.env.NEIGHBORHOOD_REFRESH_ENABLED !== 'false';
  if (!enabled) {
    logger.info('[NEIGHBORHOOD-REFRESH] Skipped — NEIGHBORHOOD_REFRESH_ENABLED=false');
    return;
  }

  logger.info('[NEIGHBORHOOD-REFRESH] Starting weekly neighborhood radar refresh...');

  // Count total properties for progress logging
  const total = await (prisma as any).property.count();
  if (total === 0) {
    logger.info('[NEIGHBORHOOD-REFRESH] No properties found, nothing to do.');
    return;
  }

  let offset = 0;
  let successCount = 0;
  let failureCount = 0;

  while (offset < total) {
    const properties = await (prisma as any).property.findMany({
      select: { id: true },
      skip: offset,
      take: BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    });

    if (properties.length === 0) break;

    for (const property of properties) {
      try {
        const result = await matchService.recomputePropertyNeighborhoodRadar(property.id);
        logger.info(
          `[NEIGHBORHOOD-REFRESH] Property ${property.id}: processed ${result.processed} events`,
        );
        successCount++;
      } catch (err: any) {
        logger.error(
          `[NEIGHBORHOOD-REFRESH] Failed for property ${property.id}:`,
          err?.message ?? err,
        );
        failureCount++;
      }
    }

    offset += properties.length;

    if (offset < total) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  logger.info(
    `[NEIGHBORHOOD-REFRESH] Completed. success=${successCount} failures=${failureCount} total=${total}`,
  );
}
