import { sharedDataBackfillService } from '@worker-shared/services/sharedDataBackfill.service';
import { isPropertyAllowlisted } from '@worker-shared/config/smokeTestConfig';
import { generateSmokeCorrelationId } from '@worker-shared/lib/smokeTestCorrelation';
import { logger, AppLogger } from '../lib/logger';

type SharedDataBackfillJobResult = {
  dryRun: boolean;
  processedProperties: number;
  skippedProperties: number;
  erroredProperties: number;
  totalPropertiesConsidered: number;
  smokeCorrelationId?: string;
};

// W4 item 1: small, job-scoped dependency interface (see
// reserveFundBalanceReminder.job.ts for the pattern).
export interface SharedDataBackfillDeps {
  sharedDataBackfillService: Pick<typeof sharedDataBackfillService, 'runBackfill'>;
  logger: AppLogger;
}

const defaultDeps: SharedDataBackfillDeps = { sharedDataBackfillService, logger };

export async function runSharedDataBackfillJob(
  opts?: { dryRun?: boolean; propertyId?: string },
  deps: SharedDataBackfillDeps = defaultDeps,
): Promise<SharedDataBackfillJobResult> {
  const { sharedDataBackfillService, logger } = deps;
  if (opts?.propertyId && !isPropertyAllowlisted(opts.propertyId)) {
    throw new Error(
      `[shared-data-backfill] propertyId ${opts.propertyId} is not in SMOKE_TEST_PROPERTY_ALLOWLIST`,
    );
  }
  const smokeCorrelationId = opts?.propertyId ? generateSmokeCorrelationId('shared-data-backfill') : undefined;

  const limitEnv = Number(process.env.SHARED_DATA_BACKFILL_LIMIT ?? '0');
  const limit = Number.isFinite(limitEnv) && limitEnv > 0 ? Math.floor(limitEnv) : undefined;
  // W4 item 8: the daily cron tick is always a real run (dryRun defaults
  // false here) — dryRun only ever comes from an explicit manual trigger
  // requesting it (gated by the registry's supportsDryRun + triggerJob()'s
  // reject-if-unsupported check upstream, see adminWorkerJobs.service.ts).
  const dryRun = opts?.dryRun === true;

  const summary = await sharedDataBackfillService.runBackfill({
    dryRun,
    limit,
    propertyId: opts?.propertyId,
  });

  logger.info(
    `[shared-data-backfill] complete dryRun=${summary.dryRun} total=${summary.totalPropertiesConsidered} ` +
      `processed=${summary.processedProperties} skipped=${summary.skippedProperties} errored=${summary.erroredProperties}`,
  );

  return {
    dryRun: summary.dryRun,
    processedProperties: summary.processedProperties,
    skippedProperties: summary.skippedProperties,
    erroredProperties: summary.erroredProperties,
    totalPropertiesConsidered: summary.totalPropertiesConsidered,
    smokeCorrelationId,
  };
}
