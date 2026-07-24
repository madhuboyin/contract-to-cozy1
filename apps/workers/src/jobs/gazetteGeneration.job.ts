// apps/workers/src/jobs/gazetteGeneration.job.ts
//
// Weekly cron job: generates the Home Gazette edition for every property.
// Runs Mondays at 6:00 AM EST (after weekly score snapshots at 4 AM).
// Invoked by the 'home-gazette-generation' registry entry in worker.ts.
//
// Design:
//   - Iterates all properties and calls GazetteGenerationJobRunnerService.generate()
//   - Per-property errors are caught and logged — one failure does not stop others
//   - The generation service is idempotent: already-published editions are skipped
//   - Notification and analytics are handled inside the generation service on publish

import { prisma } from '../lib/prisma';
import { GazetteGenerationJobRunnerService } from '@worker-shared/modules/gazette/services/gazetteGenerationJobRunner.service';
import { logger } from '../lib/logger';
import { getAggregationContextBatch } from '@worker-shared/services/aggregationContext/batch';
import { isPropertyAllowlisted } from '@worker-shared/config/smokeTestConfig';
import { generateSmokeCorrelationId } from '@worker-shared/lib/smokeTestCorrelation';

export async function runGazetteGenerationJob(
  opts?: { propertyId?: string },
): Promise<{ published: number; skipped: number; alreadyPublished: number; failed: number; examined: number; smokeCorrelationId?: string }> {
  if (opts?.propertyId && !isPropertyAllowlisted(opts.propertyId)) {
    throw new Error(
      `[GAZETTE-GENERATION] propertyId ${opts.propertyId} is not in SMOKE_TEST_PROPERTY_ALLOWLIST`,
    );
  }
  const smokeCorrelationId = opts?.propertyId ? generateSmokeCorrelationId('home-gazette-generation') : undefined;

  const startedAt = new Date().toISOString();
  logger.info(`[GAZETTE-GENERATION] Starting weekly generation at ${startedAt}${opts?.propertyId ? ` (scoped to ${opts.propertyId})` : ''}`);

  const properties = await prisma.property.findMany({
    select: { id: true, homeownerProfile: { select: { userId: true } } },
    ...(opts?.propertyId ? { where: { id: opts.propertyId } } : {}),
  });

  const batchContext = await getAggregationContextBatch(
    properties.flatMap((property) => property.homeownerProfile?.userId
      ? [{ propertyId: property.id, userId: property.homeownerProfile.userId }]
      : []),
    'HOME_GAZETTE',
    10,
  );
  const eligibleProperties = new Set(batchContext
    .filter((result) => result.status === 'READY' && result.envelope?.decision.status === 'APPLICABLE')
    .map((result) => result.propertyId));

  logger.info(`[GAZETTE-GENERATION] Processing ${properties.length} properties`);

  let published = 0;
  let skipped = 0;
  let alreadyPublished = 0;
  let failed = 0;

  for (const property of properties) {
    if (!eligibleProperties.has(property.id)) {
      skipped++;
      continue;
    }
    try {
      const result = await GazetteGenerationJobRunnerService.generate({
        propertyId: property.id,
      });

      if (result.status === 'PUBLISHED') {
        published++;
        logger.info(
          `[GAZETTE-GENERATION] ✅ Published edition ${result.editionId} ` +
          `for property ${property.id} (${result.selectedCount} stories, ${result.durationMs}ms)`,
        );
      } else if (result.status === 'SKIPPED') {
        skipped++;
      } else if (result.status === 'ALREADY_PUBLISHED') {
        alreadyPublished++;
      }
    } catch (error: unknown) {
      failed++;
      logger.error(
        `[GAZETTE-GENERATION] ❌ Failed for property ${property.id}:`,
        (error as Error)?.message ?? error,
      );
    }
  }

  logger.info(
    `[GAZETTE-GENERATION] Completed at ${new Date().toISOString()}. ` +
    `Published: ${published}, Skipped: ${skipped}, ` +
    `Already published: ${alreadyPublished}, Failed: ${failed}, ` +
    `Total: ${properties.length}`,
  );

  return { published, skipped, alreadyPublished, failed, examined: properties.length, smokeCorrelationId };
}
