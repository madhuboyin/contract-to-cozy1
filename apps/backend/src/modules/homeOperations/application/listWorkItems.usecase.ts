import type { OperationalObligationType, OperationalWorkItemState, OperationalWorkSubjectType } from '@prisma/client';
import { listWorkItemsForProperty } from '../infrastructure/workItemRepository';
import { prisma } from '../../../lib/prisma';

export interface ListWorkItemsInput {
  propertyId: string;
  state?: OperationalWorkItemState;
  obligationType?: OperationalObligationType;
  ownerUserId?: string;
  subjectType?: OperationalWorkSubjectType;
  subjectId?: string;
}

export async function listWorkItems(input: ListWorkItemsInput) {
  const items = await listWorkItemsForProperty(input);
  const maintenanceTaskIds = items.flatMap((item) => item.executions
    .filter((execution) => execution.executionType === 'MAINTENANCE_TASK')
    .map((execution) => execution.executionEntityId));
  const [recurringTasks, adoptedHabits, pendingReconciliations] = await Promise.all([
    maintenanceTaskIds.length > 0
      ? prisma.propertyMaintenanceTask.findMany({ where: { id: { in: maintenanceTaskIds }, propertyId: input.propertyId, isRecurring: true }, select: { id: true } })
      : Promise.resolve([]),
    maintenanceTaskIds.length > 0
      ? prisma.propertyHabit.findMany({ where: { propertyId: input.propertyId, linkedMaintenanceTaskId: { in: maintenanceTaskIds } }, select: { linkedMaintenanceTaskId: true } })
      : Promise.resolve([]),
    prisma.operationalWorkReconciliation.findMany({
      where: { propertyId: input.propertyId, status: { in: ['PENDING', 'RETRYING', 'FAILED'] }, workItemId: { not: null } },
      select: { workItemId: true },
    }),
  ]);
  const routineTaskIds = new Set([
    ...recurringTasks.map((task) => task.id),
    ...adoptedHabits.flatMap((habit) => habit.linkedMaintenanceTaskId ? [habit.linkedMaintenanceTaskId] : []),
  ]);
  const pendingWorkItemIds = new Set(pendingReconciliations.flatMap((entry) => entry.workItemId ? [entry.workItemId] : []));
  return items.map((item) => ({
    id: item.id,
    workKey: item.workKey,
    subjectType: item.subjectType,
    subjectId: item.subjectId,
    obligationType: item.obligationType,
    state: item.state,
    acceptanceState: item.acceptanceState,
    disposition: item.disposition,
    priority: item.priority,
    safetyTier: item.safetyTier,
    title: item.title,
    homeownerReason: item.homeownerReason,
    expectedOutcome: item.expectedOutcome,
    dueWindowStart: item.dueWindowStart,
    dueAt: item.dueAt,
    dueWindowEnd: item.dueWindowEnd,
    scheduleOverrideAt: item.scheduleOverrideAt,
    recurrenceTemplateKey: item.recurrenceTemplateKey,
    occurrenceKey: item.occurrenceKey,
    ownerUserId: item.ownerUserId,
    confidence: item.confidence,
    missingContext: item.missingContext,
    snoozedUntil: item.snoozedUntil,
    understoodAt: item.understoodAt,
    materialApprovalRequired: item.materialApprovalRequired,
    materialApprovedAt: item.materialApprovedAt,
    isRoutine: item.executions.some((execution) => execution.executionType === 'MAINTENANCE_TASK' && routineTaskIds.has(execution.executionEntityId)),
    executions: item.executions.map((execution) => ({
      executionType: execution.executionType,
      executionEntityId: execution.executionEntityId,
      role: execution.role,
      responsibleParty: execution.responsibleParty,
    })),
    // A source with role EXECUTION means a real domain record (e.g. a
    // PropertyMaintenanceTask) backs this item — see maintenanceTask
    // .adapter.ts's doc comment ("once a task exists it IS the execution
    // record"). Without one, the item exists only as a proposed candidate
    // from its TRIGGER source (e.g. a forecast-driven environment insight
    // via homeActionSourcePromotion.service.ts's
    // adaptEnvironmentInsightsToHomeActions) — callers use this to tell
    // "real, homeowner-tracked work" apart from "advisory only."
    hasExecutionBackedSource: item.sources.some((source) => source.active && source.sourceRole === 'EXECUTION'),
    reconciliationPending: pendingWorkItemIds.has(item.id),
    supersededByWorkItemId: item.supersededByWorkItemId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));
}
