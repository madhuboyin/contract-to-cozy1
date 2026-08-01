import { retryDueHomeOperationsReconciliations } from '@worker-shared/services/homeOperationsReconciliation.service';
import { logger } from '../lib/logger';
import type { WorkerRunResult } from '../lib/workerRunResult';

export async function runHomeOperationsReconciliation(
  opts?: { propertyId?: string },
): Promise<WorkerRunResult> {
  const result = await retryDueHomeOperationsReconciliations({ propertyId: opts?.propertyId });
  logger.info(
    { ...result },
    `[home-operations-reconciliation] examined=${result.examined} reconciled=${result.reconciled} failed=${result.failed}`,
  );
  return { examined: result.examined, refreshed: result.reconciled, failed: result.failed };
}
