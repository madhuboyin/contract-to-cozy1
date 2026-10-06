// apps/backend/src/services/diy/diyTaskReconciliationRequest.ts
//
// The producer half of reverse reconciliation (docs/architecture/ASK_COZY_DIY_TASK_RECONCILIATION_PLAN.md section 3.1). Called by the two governed
// maintenance-task writers INSIDE the transaction that moves a task to COMPLETED, so the request exists exactly when the completion does. It finds the
// open DIY projects linked to the task through an indexed lookup; if there are none it does nothing at all (the common case). Otherwise it generates a unique
// occurrence id (never derived from a date a caller can repeat), which the writer stores in the task's completionMetadata in the same write, and, after
// that write succeeds, inserts the outbox event carrying a snapshot of what the completion said and the ids of the projects found.
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { DomainEventsService } from '../domainEvents/domainEvents.service';
import { hasPropertyRoleWithin } from '../propertyAccess.service';

/** More open linked projects than this are not snapshotted; the page's disclosure still tells their owners the task was completed. */
export const DIY_RECONCILE_PROJECT_CAP = 25;
export const DIY_TASK_RECONCILE_EVENT_KEY = (taskId: string, occurrenceId: string) => `diy-task-reconcile:${taskId}:${occurrenceId}`;
const OPEN_STATUSES = ['PLANNING', 'IN_PROGRESS'] as const;

export type DiyReconcileRequest = { occurrenceId: string; projectIds: string[] };

/**
 * Returns the request to write with this completion, or null when no open project is linked to the task. When the caller's access has not been verified
 * elsewhere, it is verified here, inside the transaction (a viewer, or someone no longer in the household, is refused exactly as the public path refuses them).
 */
export async function planDiyTaskReconciliation(
  tx: Prisma.TransactionClient,
  input: { taskId: string; propertyId: string; actorUserId: string; accessVerifiedElsewhere: boolean },
): Promise<DiyReconcileRequest | null> {
  const projects = await tx.diyProject.findMany({
    where: { maintenanceTaskId: input.taskId, propertyId: input.propertyId, status: { in: [...OPEN_STATUSES] } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: DIY_RECONCILE_PROJECT_CAP,
  });
  if (projects.length === 0) return null;
  if (!input.accessVerifiedElsewhere && !(await hasPropertyRoleWithin(tx, input.actorUserId, input.propertyId, 'CONTRIBUTOR'))) {
    throw new Error('User does not have access to perform this action on this task.');
  }
  return { occurrenceId: randomUUID(), projectIds: projects.map((project) => project.id) };
}

/** The completionMetadata to write: whatever the completion already builds (or the task already has), plus the occurrence id the event is keyed by. */
export function withOccurrenceId(planned: unknown, existing: unknown, occurrenceId: string): Record<string, unknown> {
  const asObject = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
  return { ...asObject(existing), ...asObject(planned), reconciliationOccurrenceId: occurrenceId };
}

/** Inserts the outbox event. Call only after the task's compare-and-swap write succeeded, in the same transaction. */
export async function emitDiyTaskReconciliation(
  tx: Prisma.TransactionClient,
  input: {
    request: DiyReconcileRequest; taskId: string; propertyId: string; actorUserId: string; completedAt: Date;
    fulfillmentMode: 'DIY' | 'PROVIDER' | null; completionKey: string | null;
  },
) {
  await DomainEventsService.emit({
    type: 'DIY_TASK_COMPLETED_RECONCILE',
    propertyId: input.propertyId,
    userId: input.actorUserId,
    idempotencyKey: DIY_TASK_RECONCILE_EVENT_KEY(input.taskId, input.request.occurrenceId),
    payload: {
      taskId: input.taskId,
      propertyId: input.propertyId,
      occurrenceId: input.request.occurrenceId,
      actorUserId: input.actorUserId,
      completedAt: input.completedAt.toISOString(),
      fulfillmentMode: input.fulfillmentMode,
      completionKey: input.completionKey,
      projectIds: input.request.projectIds,
    },
  }, tx);
}
