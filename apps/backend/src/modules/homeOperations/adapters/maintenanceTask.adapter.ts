import type { PropertyMaintenanceTask, OperationalWorkItemPriority, RecommendationSafetyTier } from '@prisma/client';
import type { ProposedWorkItem, WorkItemSourceAdapter } from '../domain/sourceAdapter';
import { resolveWorkKey, type WorkSubject } from '../domain/workKey';

/**
 * Home Operations Slice 3: the first real use of the raw-record
 * WorkItemSourceAdapter<TSourceRecord> contract Slice 1 built (Slice 2 used
 * a HomeAction-level generic mapper instead, since it only needed to
 * resolve identity for still-just-recommended candidates). Once a
 * PropertyMaintenanceTask exists, it IS the execution record — this adapter
 * runs from PropertyMaintenanceTask.service.ts on every create/status
 * transition, not from the Home Action feed.
 *
 * Known limitation: converting a checklist/seasonal recommendation into a
 * task does not reconcile with any CANDIDATE work item Slice 2 may have
 * already resolved for the pre-conversion recommendation — that recommends-
 * stage workKey is keyed off the checklist/orchestration entity id, this
 * task-stage workKey off actionKey/task id. The stale candidate work item
 * is simply never touched again once its source HomeAction is suppressed.
 * Full continuity requires threading the originating workKey through the
 * conversion call chain or a dedicated duplicate-detection pass — a focused
 * follow-up, not this slice.
 */

const PRIORITY_MAP: Record<PropertyMaintenanceTask['priority'], OperationalWorkItemPriority> = {
  URGENT: 'NOW',
  HIGH: 'SOON',
  MEDIUM: 'PLAN',
  LOW: 'CONSIDER',
};

// Graded, unlike the binary CRITICAL-vs-everything-else collapse orchestration
// .service.ts used before Slice 0 flagged it (doc §5.13) — MODERATE/ELEVATED/
// HIGH riskLevel now reach MATERIAL_FINANCIAL instead of being folded into
// LOW_CONSEQUENCE.
function resolveSafetyTier(riskLevel: PropertyMaintenanceTask['riskLevel']): RecommendationSafetyTier {
  if (riskLevel === 'CRITICAL') return 'SAFETY_EMERGENCY';
  if (riskLevel === 'HIGH' || riskLevel === 'ELEVATED' || riskLevel === 'MODERATE') return 'MATERIAL_FINANCIAL';
  return 'LOW_CONSEQUENCE';
}

type SubjectFields = Pick<PropertyMaintenanceTask, 'inventoryItemId'>;
type SlugFields = Pick<PropertyMaintenanceTask, 'actionKey' | 'id'>;

function resolveSubject(task: SubjectFields, propertyId: string): WorkSubject {
  if (task.inventoryItemId) return { type: 'INVENTORY_ITEM', id: task.inventoryItemId };
  return { type: 'PROPERTY', id: propertyId };
}

// Prefer actionKey when present — it already carries stable per-property
// -per-assetType identity for ACTION_CENTER/project-follow-up-sourced tasks
// (see the known-limitation note above for why this is only a partial fix,
// not full recommendation-to-acceptance continuity).
function resolveObligationSlug(task: SlugFields): string {
  return task.actionKey ? `maintenance-${task.actionKey}` : `maintenance-task-${task.id}`;
}

/**
 * Exposed so callers (PropertyMaintenanceTask.service.ts's syncTaskWorkItem)
 * can look up an existing work item for a task whose current status makes
 * propose() return null (CANCELLED) — there is no proposal to read a
 * workKey off in that case, but the identity is still deterministic.
 */
export function resolveMaintenanceTaskWorkKey(task: SubjectFields & SlugFields, propertyId: string): string {
  return resolveWorkKey({
    propertyId,
    subject: resolveSubject(task, propertyId),
    obligationType: 'MAINTENANCE_TASK',
    occurrence: { obligationSlug: resolveObligationSlug(task) },
  });
}

export const maintenanceTaskSourceAdapter: WorkItemSourceAdapter<PropertyMaintenanceTask> = {
  sourceType: 'MAINTENANCE',
  propose(task, propertyId): ProposedWorkItem | null {
    if (task.status === 'CANCELLED') return null;

    return {
      propertyId,
      subject: resolveSubject(task, propertyId),
      obligationType: 'MAINTENANCE_TASK',
      occurrence: { obligationSlug: resolveObligationSlug(task) },
      title: task.title,
      homeownerReason: task.description ?? 'A maintenance task is tracked for your home.',
      expectedOutcome: 'The task is completed and recorded.',
      priority: PRIORITY_MAP[task.priority],
      safetyTier: resolveSafetyTier(task.riskLevel),
      dueAt: task.nextDueDate,
      confidence: null,
      missingContext: [],
      source: {
        // Once a task exists it IS the execution record, distinct from
        // Slice 2's TRIGGER role for the still-just-a-recommendation stage.
        sourceType: 'MAINTENANCE',
        sourceEntityId: task.id,
        sourceVersion: task.updatedAt.toISOString(),
        sourceRole: 'EXECUTION',
      },
    };
  },
};
