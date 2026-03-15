// apps/workers/src/jobs/hiddenAssetRefresh.job.ts
//
// Batch job: runs a hidden asset scan for every property in the database.
// Invoked by the Sunday 3 AM cron in worker.ts.

import { prisma } from '../lib/prisma';
import { HiddenAssetService } from '../../../backend/src/services/hiddenAssets.service';

const hiddenAssetService = new HiddenAssetService();

export async function runHiddenAssetRefreshJob(): Promise<void> {
  console.log(`[HIDDEN-ASSETS] Starting batch refresh at ${new Date().toISOString()}`);

  const properties = await prisma.property.findMany({
    select: { id: true },
  });

  let successCount = 0;
  let failureCount = 0;

  for (const property of properties) {
    try {
      await hiddenAssetService.refreshMatchesInternal(property.id);
      successCount++;
    } catch (error) {
      failureCount++;
      console.error(`[HIDDEN-ASSETS] Scan failed for property ${property.id}:`, error);
    }
  }

  console.log(
    `[HIDDEN-ASSETS] Batch refresh complete. ` +
      `Success: ${successCount}, Failed: ${failureCount}, Total: ${properties.length}`,
  );
}
