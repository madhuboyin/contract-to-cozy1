// apps/workers/src/jobs/refreshNeighborhoodEvents.job.ts
//
// Scheduled job: weekly batch recompute of all property neighborhood radars.
// Re-runs property-to-event proximity matching and impact generation for
// every active property so that newly ingested or updated events are linked.
//
// Schedule: Weekly (Sunday 5:00 AM EST via worker.ts cron)
// Can be disabled: NEIGHBORHOOD_REFRESH_ENABLED=false

import { NeighborhoodPropertyMatchService } from '@worker-shared/neighborhoodIntelligence/neighborhoodPropertyMatchService';
import { prisma } from '../lib/prisma';
import { isPropertyAllowlisted } from '@worker-shared/config/smokeTestConfig';
import { generateSmokeCorrelationId } from '@worker-shared/lib/smokeTestCorrelation';
import { logger } from '../lib/logger';

const matchService = new NeighborhoodPropertyMatchService();

const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function refreshNeighborhoodEventsJob(
  opts?: { dryRun?: boolean; propertyId?: string },
): Promise<{ examined: number; refreshed: number; skipped: number; failed: number; smokeCorrelationId?: string }> {
  const dryRun = opts?.dryRun === true;
  if (opts?.propertyId && !isPropertyAllowlisted(opts.propertyId)) {
    throw new Error(
      `[NEIGHBORHOOD-REFRESH] propertyId ${opts.propertyId} is not in SMOKE_TEST_PROPERTY_ALLOWLIST`,
    );
  }
  const smokeCorrelationId = opts?.propertyId ? generateSmokeCorrelationId('neighborhood-radar-refresh') : undefined;

  const enabled = process.env.NEIGHBORHOOD_REFRESH_ENABLED !== 'false';
  if (!enabled) {
    logger.info('[NEIGHBORHOOD-REFRESH] Skipped — NEIGHBORHOOD_REFRESH_ENABLED=false');
    return { examined: 0, refreshed: 0, skipped: 0, failed: 0, smokeCorrelationId };
  }

  logger.info(`[NEIGHBORHOOD-REFRESH] Starting weekly neighborhood radar refresh...${dryRun ? ' (dry run)' : ''}`);

  const where = opts?.propertyId ? { id: opts.propertyId } : undefined;

  // Count total properties for progress logging
  const total = await (prisma as any).property.count({ where });
  if (total === 0) {
    logger.info('[NEIGHBORHOOD-REFRESH] No properties found, nothing to do.');
    return { examined: 0, refreshed: 0, skipped: 0, failed: 0, smokeCorrelationId };
  }

  let offset = 0;
  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;

  while (offset < total) {
    const properties = await (prisma as any).property.findMany({
      select: { id: true },
      where,
      skip: offset,
      take: BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
    });

    if (properties.length === 0) break;

    for (const property of properties) {
      // Shallow dry-run: NeighborhoodPropertyMatchService's recompute has
      // multiple interleaved deleteMany/upsert/createMany write sites —
      // threading a real dryRun through it is out of proportion for this
      // slice. Skip the call entirely and count what would have run.
      if (dryRun) {
        skippedCount++;
        logger.info(`[NEIGHBORHOOD-REFRESH] (dry run) Would recompute radar for property ${property.id}`);
        continue;
      }
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
    `[NEIGHBORHOOD-REFRESH] Completed. success=${successCount} skipped=${skippedCount} failures=${failureCount} total=${total}`,
  );

  return { examined: total, refreshed: successCount, skipped: skippedCount, failed: failureCount, smokeCorrelationId };
}
