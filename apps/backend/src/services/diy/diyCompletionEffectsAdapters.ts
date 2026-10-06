// apps/backend/src/services/diy/diyCompletionEffectsAdapters.ts
//
// The default wiring for the DIY_PROJECT_COMPLETED handler (docs/architecture/ASK_COZY_DIY_COMPLETION_OUTBOX_PLAN.md section 3.2). It is the ONLY module
// allowed to import `completeMaintenanceTaskForDiyOutbox` (a test enforces that). The worker reaches it through `@worker-shared`; both services it wraps
// are already part of the worker's module graph (plan section 12, F1).
import { prisma } from '../../lib/prisma';
import { HomeEventsService } from '../homeEvents.service';
import { completeMaintenanceTaskForDiyOutbox } from '../PropertyMaintenanceTask.service';
import { processDiyProjectCompletedEvent, type DiyCompletionEffectDeps } from './diyCompletionEffects';

const homeEventsService = new HomeEventsService();

export const defaultDiyCompletionEffectDeps: DiyCompletionEffectDeps = {
  async getTask(taskId) {
    return prisma.propertyMaintenanceTask.findUnique({ where: { id: taskId }, select: { id: true, propertyId: true, status: true } });
  },

  async ensureHomeEvent({ snapshot, eventType, idempotencyKey }) {
    const existing = await prisma.homeEvent.findFirst({ where: { propertyId: snapshot.propertyId, idempotencyKey }, select: { id: true } });
    if (existing) return { id: existing.id, existed: true };
    const created = await homeEventsService.createHomeEvent({
      propertyId: snapshot.propertyId,
      userId: snapshot.actorUserId,
      body: {
        type: eventType,
        importance: 'NORMAL',
        occurredAt: snapshot.completedAt,
        title: snapshot.title,
        summary: 'DIY — completed by homeowner',
        amount: snapshot.actualMaterialCostCents != null ? snapshot.actualMaterialCostCents / 100 : undefined,
        meta: { source: 'DIY_PROJECT_CENTER', diyProjectId: snapshot.projectId, actualMinutes: snapshot.actualMinutes, category: snapshot.category },
        idempotencyKey,
      },
    });
    return { id: created.id, existed: false };
  },

  async linkHomeEvent(projectId, homeEventId) {
    await prisma.diyProject.updateMany({ where: { id: projectId, homeEventId: null }, data: { homeEventId } });
  },

  async completeTask({ snapshot, taskId, completionKey }) {
    await completeMaintenanceTaskForDiyOutbox(
      snapshot.actorUserId,
      taskId,
      'COMPLETED',
      snapshot.actualMaterialCostCents != null ? snapshot.actualMaterialCostCents / 100 : undefined,
      undefined,
      completionKey,
      { completedAt: new Date(snapshot.completedAt), fulfillmentMode: 'DIY' },
    );
  },
};

/** What the worker's domain-events job calls for a DIY_PROJECT_COMPLETED event. */
export const processDiyProjectCompletedEventWithDefaults = (event: { id: string; payload: unknown }) =>
  processDiyProjectCompletedEvent(event, defaultDiyCompletionEffectDeps);
