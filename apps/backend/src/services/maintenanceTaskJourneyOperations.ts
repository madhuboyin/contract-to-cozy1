// A maintenance task's verified completion, and what it proves to a guided journey (continuation FRD section 36).
//
// A task counts toward a journey step only through an explicit `GuidanceStepMaintenanceTaskLink` (never a matching title or category), and only when its
// completion is VERIFIED: the task is COMPLETED and at least one evidence document it names exists on this property. Creating a task, or marking it complete
// with nothing attached, proves nothing. Desktop and Ask both complete tasks through `PropertyMaintenanceTaskService`, which calls `reportLinkedTaskCompletion`.

import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { logger } from '../lib/logger';
import { guidanceJourneyService } from './guidanceEngine/guidanceJourney.service';
import { resolveGuidanceStepBinding, type GuidanceStepBinding } from './guidanceEngine/guidanceStepBinding';

export const MAINTENANCE_STEP_TOOL_KEY = 'maintenance';
export const MAINTENANCE_LINKABLE_STEP_KEYS = ['complete_compliance_task'];
export type MaintenanceLinkSource = 'DESKTOP' | 'ASK';

/** The evidence documents a completed task names that exist on its property; an empty list means the completion is self-reported only. */
export async function verifiedCompletionEvidence(task: { id: string; propertyId: string; status: string; completionMetadata: unknown }): Promise<string[]> {
  if (task.status !== 'COMPLETED') return [];
  const meta = task.completionMetadata && typeof task.completionMetadata === 'object' && !Array.isArray(task.completionMetadata) ? task.completionMetadata as Record<string, unknown> : {};
  const ids = Array.isArray(meta.photoDocumentIds) ? meta.photoDocumentIds.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
  if (ids.length === 0) return [];
  const found = await prisma.document.findMany({ where: { id: { in: ids }, propertyId: task.propertyId }, select: { id: true } });
  return found.map((doc: { id: string }) => doc.id);
}

/** Links a task to one journey step. The step is re-read (open, maintenance tool, compliance step) and the task must belong to the same property. */
export async function linkMaintenanceTaskToStep(propertyId: string, userId: string, taskId: string, stepId: string, source: MaintenanceLinkSource) {
  const task = await prisma.propertyMaintenanceTask.findFirst({ where: { id: taskId, propertyId }, select: { id: true } });
  if (!task) throw new APIError('Maintenance task not found.', 404, 'MAINTENANCE_TASK_NOT_FOUND');
  const bound = await resolveGuidanceStepBinding(propertyId, stepId, { toolKey: MAINTENANCE_STEP_TOOL_KEY, stepKeys: MAINTENANCE_LINKABLE_STEP_KEYS });
  if (!bound.ok) throw new APIError('That journey step cannot be linked to a maintenance task.', 409, `GUIDANCE_STEP_${bound.reason}`);
  const existing = await prisma.guidanceStepMaintenanceTaskLink.findFirst({ where: { stepId, maintenanceTaskId: taskId } });
  if (existing) return { link: existing, reused: true };
  const link = await prisma.guidanceStepMaintenanceTaskLink.create({
    data: { propertyId, journeyId: bound.binding.journeyId, stepId, maintenanceTaskId: taskId, source, linkedByUserId: userId },
  });
  return { link, reused: false };
}

export function buildMaintenanceTaskCompletion(propertyId: string, actorUserId: string, task: { id: string; lastCompletedDate: Date | null }, evidenceDocumentIds: string[], binding: GuidanceStepBinding) {
  return {
    propertyId, actorUserId, journeyId: binding.journeyId, inventoryItemId: binding.inventoryItemId, signalIntentFamily: binding.signalIntentFamily ?? 'compliance_deadline', issueDomain: 'MAINTENANCE' as const,
    sourceToolKey: MAINTENANCE_STEP_TOOL_KEY, sourceEntityType: 'PROPERTY_MAINTENANCE_TASK', sourceEntityId: task.id, stepKey: binding.stepKey, status: 'COMPLETED' as const,
    dedupeKey: `maintenance-task-verified:${propertyId}:${task.id}:${binding.stepId}`,
    producedData: { proofType: 'maintenance_task_verified_completion', proofId: task.id, taskId: task.id, evidenceDocumentIds, completedAt: (task.lastCompletedDate ?? new Date()).toISOString() },
  };
}

/**
 * Reports a just-completed task to every step it is linked to, when (and only when) the completion is verified. A step that no longer fits reports nothing;
 * a failed report never undoes the completion. Returns the step ids reported.
 */
export async function reportLinkedTaskCompletion(actorUserId: string, taskId: string): Promise<string[]> {
  const task = await prisma.propertyMaintenanceTask.findUnique({ where: { id: taskId } });
  if (!task || task.status !== 'COMPLETED') return [];
  const links = await prisma.guidanceStepMaintenanceTaskLink.findMany({ where: { maintenanceTaskId: taskId, propertyId: task.propertyId } });
  if (links.length === 0) return [];
  const evidence = await verifiedCompletionEvidence(task);
  if (evidence.length === 0) return [];
  const reported: string[] = [];
  for (const link of links) {
    try {
      const bound = await resolveGuidanceStepBinding(task.propertyId, link.stepId, { toolKey: MAINTENANCE_STEP_TOOL_KEY, stepKeys: MAINTENANCE_LINKABLE_STEP_KEYS });
      if (!bound.ok || bound.binding.journeyId !== link.journeyId) continue;
      await guidanceJourneyService.recordToolCompletion(buildMaintenanceTaskCompletion(task.propertyId, actorUserId, task, evidence, bound.binding));
      reported.push(link.stepId);
    } catch (guidanceError) {
      logger.warn({ guidanceError, taskId, stepId: link.stepId }, '[GUIDANCE] linked maintenance completion report failed');
    }
  }
  return reported;
}
