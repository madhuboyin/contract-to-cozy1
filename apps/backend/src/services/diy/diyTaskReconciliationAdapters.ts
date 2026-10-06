// apps/backend/src/services/diy/diyTaskReconciliationAdapters.ts
//
// The default wiring for the DIY_TASK_COMPLETED_RECONCILE handler (docs/architecture/ASK_COZY_DIY_TASK_RECONCILIATION_PLAN.md section 3.2). The worker reaches
// it through `@worker-shared`.
import { prisma } from '../../lib/prisma';
import { diyService } from '../diy.service';
import { processDiyTaskReconciliationEvent, type DiyTaskReconciliationDeps } from './diyTaskReconciliation';

export const defaultDiyTaskReconciliationDeps: DiyTaskReconciliationDeps = {
  async getTask(taskId) {
    return prisma.propertyMaintenanceTask.findUnique({ where: { id: taskId }, select: { id: true, propertyId: true, status: true } });
  },

  async reconcileProject({ projectId, propertyId, mode, actorUserId, completedAt }) {
    const outcome = await diyService.reconcileProjectFromLinkedTask(projectId, propertyId, { mode, actorUserId, completedAt });
    return outcome;
  },

  async recordOutcome(eventId, projectId, outcome) {
    // One worker holds the event's lease at a time, so this read-modify-write of the payload is not contended; it never touches the status or the lease.
    const row = await prisma.domainEvent.findUnique({ where: { id: eventId }, select: { payload: true } });
    const payload = row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? (row.payload as Record<string, any>) : {};
    await prisma.domainEvent.update({
      where: { id: eventId },
      data: { payload: { ...payload, projectOutcomes: { ...(payload.projectOutcomes ?? {}), [projectId]: outcome } } },
    });
  },
};

/** What the worker's domain-events job calls for a DIY_TASK_COMPLETED_RECONCILE event. */
export const processDiyTaskReconciliationEventWithDefaults = (event: { id: string; payload: unknown }) =>
  processDiyTaskReconciliationEvent(event, defaultDiyTaskReconciliationDeps);
