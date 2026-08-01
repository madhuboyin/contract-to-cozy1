import { prisma } from '../lib/prisma';
import { PropertyMaintenanceTaskService } from './PropertyMaintenanceTask.service';
import { syncJourneyWorkItemForProjectEvent, syncProjectExecutionWorkItemOnCompletion } from './projectTracker.service';
import { resolveAndUpsertWorkItem } from '../modules/homeOperations/application/resolveWorkItem.usecase';
import { findWorkItemByWorkKey } from '../modules/homeOperations/infrastructure/workItemRepository';
import { resolveInspectionFindingWorkKey } from '../modules/homeOperations/adapters/inspectionFinding.adapter';
import { transitionWorkItem } from '../modules/homeOperations/application/transitionWorkItem.usecase';
import type { ProposedWorkItem } from '../modules/homeOperations/domain/sourceAdapter';

export async function retryHomeOperationsReconciliation(propertyId: string, reconciliationId: string) {
  const row = await prisma.operationalWorkReconciliation.findFirst({ where: { id: reconciliationId, propertyId } });
  if (!row) throw new Error('Reconciliation record not found.');
  if (row.status === 'RESOLVED') return row;

  const claim = await prisma.operationalWorkReconciliation.updateMany({
    where: { id: row.id, status: { in: ['PENDING', 'FAILED'] } },
    data: { status: 'RETRYING', attempts: { increment: 1 }, lastAttemptAt: new Date() },
  });
  if (claim.count === 0) {
    return prisma.operationalWorkReconciliation.findUniqueOrThrow({ where: { id: row.id } });
  }

  const payload = (row.payload ?? {}) as Record<string, any>;
  try {
    if (row.operation === 'MAINTENANCE_TASK_SYNC') {
      await PropertyMaintenanceTaskService.retryWorkItemReconciliation(String(payload.taskId ?? row.sourceEntityId));
    } else if (row.operation === 'PROJECT_JOURNEY_SYNC') {
      await syncJourneyWorkItemForProjectEvent(
        propertyId,
        String(payload.guidanceJourneyId),
        String(payload.projectId ?? row.sourceEntityId),
        payload.event,
        payload.actorUserId ?? null,
        payload.responsibleParty,
        true,
      );
    } else if (row.operation === 'PROJECT_EXECUTION_SYNC') {
      await syncProjectExecutionWorkItemOnCompletion(
        propertyId,
        String(payload.projectId ?? row.sourceEntityId),
        payload.event,
        true,
      );
    } else if (row.operation === 'HOME_ACTION_RESOLVE') {
      const raw = payload.proposal as Record<string, any>;
      const proposal: ProposedWorkItem = {
        ...raw,
        dueWindowStart: raw.dueWindowStart ? new Date(raw.dueWindowStart) : null,
        dueAt: raw.dueAt ? new Date(raw.dueAt) : null,
        dueWindowEnd: raw.dueWindowEnd ? new Date(raw.dueWindowEnd) : null,
      } as ProposedWorkItem;
      await resolveAndUpsertWorkItem(proposal);
    } else if (row.operation === 'INSPECTION_DISMISS_SYNC') {
      const findingId = String(payload.findingId ?? row.sourceEntityId);
      const workKey = resolveInspectionFindingWorkKey(findingId, propertyId);
      const workItem = await findWorkItemByWorkKey(propertyId, workKey);
      if (workItem && workItem.state !== 'CLOSED') {
        await transitionWorkItem({
          workItemId: workItem.id,
          to: 'CLOSED',
          disposition: 'NOT_RELEVANT',
          actorType: payload.actorUserId ? 'USER' : 'SYSTEM',
          actorUserId: payload.actorUserId ?? null,
          idempotencyKey: `inspection-finding-dismissed:${workItem.id}`,
        });
      }
    } else {
      throw new Error(`No replay adapter is registered for ${row.operation}.`);
    }

    return prisma.operationalWorkReconciliation.update({
      where: { id: row.id },
      data: { status: 'RESOLVED', errorMessage: null, nextRetryAt: null, resolvedAt: new Date(), lastAttemptAt: new Date() },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await prisma.operationalWorkReconciliation.update({
      where: { id: row.id },
      data: {
        status: row.attempts + 1 >= 5 ? 'FAILED' : 'PENDING',
        errorMessage,
        nextRetryAt: new Date(Date.now() + Math.min(60, 5 * Math.max(1, row.attempts)) * 60_000),
        lastAttemptAt: new Date(),
      },
    });
    throw error;
  }
}

export async function retryDueHomeOperationsReconciliations(input?: { propertyId?: string; limit?: number }) {
  const now = new Date();
  const rows = await prisma.operationalWorkReconciliation.findMany({
    where: {
      ...(input?.propertyId ? { propertyId: input.propertyId } : {}),
      status: 'PENDING',
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    },
    orderBy: [{ nextRetryAt: 'asc' }, { createdAt: 'asc' }],
    take: Math.min(Math.max(input?.limit ?? 100, 1), 500),
    select: { id: true, propertyId: true },
  });

  const result = { examined: rows.length, reconciled: 0, failed: 0 };
  for (const row of rows) {
    try {
      await retryHomeOperationsReconciliation(row.propertyId, row.id);
      result.reconciled += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}
