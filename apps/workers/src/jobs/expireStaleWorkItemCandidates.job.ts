import { expireStaleWorkItemCandidates } from '@worker-shared/modules/homeOperations/application/expireStaleWorkItemCandidates.usecase';
import { logger } from '../lib/logger';
import type { WorkerRunResult } from '../lib/workerRunResult';

export async function runExpireStaleWorkItemCandidatesJob(
  opts?: { propertyId?: string; dryRun?: boolean },
): Promise<WorkerRunResult> {
  const result = await expireStaleWorkItemCandidates(opts);
  logger.info(
    { ...result },
    `[expire-stale-work-item-candidates] examined=${result.examined} updated=${result.updated} skipped=${result.skipped} failed=${result.failed}`,
  );
  return result;
}
