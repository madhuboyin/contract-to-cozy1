// Item #20 (Slice 8 punch list: "digest limited to changed or due work") —
// daily batch that emits a PropertyChange for every OperationalWorkItem
// entering its reminder-policy due window, so it surfaces on the next
// hourly home-briefing-delivery run. See workItemChangeEmitter.ts for the
// "changed" half, wired directly into the Home Operations usecases instead
// of a separate job.

import { emitDueSoonWorkItemChanges } from '@worker-shared/modules/homeOperations/infrastructure/workItemChangeEmitter';
import { logger } from '../lib/logger';
import type { WorkerRunResult } from '../lib/workerRunResult';

export async function runHomeOperationsDueDigest(): Promise<WorkerRunResult> {
  const result = await emitDueSoonWorkItemChanges();

  logger.info(
    { ...result },
    `[home-operations-due-digest] examined=${result.examined} created=${result.created} skipped=${result.skipped} failed=${result.failed}`,
  );

  return {
    examined: result.examined,
    created: result.created,
    skipped: result.skipped,
    failed: result.failed,
  };
}
