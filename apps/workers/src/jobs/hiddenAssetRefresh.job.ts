// apps/workers/src/jobs/hiddenAssetRefresh.job.ts
//
// Batch job: runs a hidden asset scan for every property in the database.
// Invoked by the Sunday 3 AM cron in worker.ts.

import { prisma } from '../lib/prisma';
import { HiddenAssetService } from '@worker-shared/services/hiddenAssets.service';
import { isPropertyAllowlisted } from '@worker-shared/config/smokeTestConfig';
import { generateSmokeCorrelationId } from '@worker-shared/lib/smokeTestCorrelation';
import { logger } from '../lib/logger';

const hiddenAssetService = new HiddenAssetService();

export async function runHiddenAssetRefreshJob(
  opts?: { dryRun?: boolean; propertyId?: string },
): Promise<{ examined: number; refreshed: number; skipped: number; failed: number; smokeCorrelationId?: string }> {
  const dryRun = opts?.dryRun === true;
  if (opts?.propertyId && !isPropertyAllowlisted(opts.propertyId)) {
    throw new Error(
      `[HIDDEN-ASSETS] propertyId ${opts.propertyId} is not in SMOKE_TEST_PROPERTY_ALLOWLIST`,
    );
  }
  const smokeCorrelationId = opts?.propertyId ? generateSmokeCorrelationId('hidden-asset-refresh') : undefined;

  logger.info(`[HIDDEN-ASSETS] Starting batch refresh at ${new Date().toISOString()}${dryRun ? ' (dry run)' : ''}`);

  const properties = await prisma.property.findMany({
    select: { id: true },
    ...(opts?.propertyId ? { where: { id: opts.propertyId } } : {}),
  });

  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;

  for (const property of properties) {
    // Shallow dry-run: HiddenAssetService.refreshMatchesInternal() has 6+
    // interleaved write call sites and is also invoked from the live
    // property-intelligence pipeline — threading a real dryRun through it
    // is out of proportion for this slice and risks affecting that other
    // caller. Skip the call entirely and count what would have run instead.
    if (dryRun) {
      skippedCount++;
      logger.info(`[HIDDEN-ASSETS] (dry run) Would refresh matches for property ${property.id}`);
      continue;
    }
    try {
      await hiddenAssetService.refreshMatchesInternal(property.id);
      successCount++;
    } catch (error) {
      failureCount++;
      logger.error({ err: error }, `[HIDDEN-ASSETS] Scan failed for property ${property.id}`);
    }
  }

  logger.info(
    `[HIDDEN-ASSETS] Batch refresh complete. ` +
      `Success: ${successCount}, Skipped: ${skippedCount}, Failed: ${failureCount}, Total: ${properties.length}`,
  );

  return { examined: properties.length, refreshed: successCount, skipped: skippedCount, failed: failureCount, smokeCorrelationId };
}
