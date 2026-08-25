import { PropertyMaintenanceTaskService } from './PropertyMaintenanceTask.service';

/**
 * Shared cross-surface boundary for the canonical ownership-care task model.
 * Keeping callers on these functions makes the parity requirement explicit
 * without exposing the task service's internal work-item implementation.
 */
export async function reconcileActiveMaintenanceTaskWork(propertyId: string): Promise<number> {
  return PropertyMaintenanceTaskService.reconcileActiveTaskWorkItems(propertyId);
}

export async function reconcileMaintenanceTaskWork(taskId: string): Promise<void> {
  await PropertyMaintenanceTaskService.retryWorkItemReconciliation(taskId);
}
