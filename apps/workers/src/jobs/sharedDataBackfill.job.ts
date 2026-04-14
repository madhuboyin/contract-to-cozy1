import { sharedDataBackfillService } from '../../../backend/src/services/sharedDataBackfill.service';
import { logger } from '../lib/logger';

type SharedDataBackfillJobResult = {
  processedProperties: number;
  skippedProperties: number;
  erroredProperties: number;
  totalPropertiesConsidered: number;
};

export async function runSharedDataBackfillJob(): Promise<SharedDataBackfillJobResult> {
  const limitEnv = Number(process.env.SHARED_DATA_BACKFILL_LIMIT ?? '0');
  const limit = Number.isFinite(limitEnv) && limitEnv > 0 ? Math.floor(limitEnv) : undefined;

  const summary = await sharedDataBackfillService.runBackfill({
    dryRun: false,
    limit,
  });

  logger.info(
    `[shared-data-backfill] complete total=${summary.totalPropertiesConsidered} ` +
      `processed=${summary.processedProperties} skipped=${summary.skippedProperties} errored=${summary.erroredProperties}`,
  );

  return {
    processedProperties: summary.processedProperties,
    skippedProperties: summary.skippedProperties,
    erroredProperties: summary.erroredProperties,
    totalPropertiesConsidered: summary.totalPropertiesConsidered,
  };
}
