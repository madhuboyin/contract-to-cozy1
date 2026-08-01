import { getWorkItemGraph } from '../infrastructure/workItemRepository';
import { closureDispositionRuleFor } from '../domain/transitions';
import { legalUserWorkItemTransitions } from '../domain/userGovernance';
import { prisma } from '../../../lib/prisma';

export async function getWorkItem(workItemId: string) {
  const item = await getWorkItemGraph(workItemId);
  if (!item) return null;
  const maintenanceTaskIds = item.executions
    .filter((execution) => execution.executionType === 'MAINTENANCE_TASK')
    .map((execution) => execution.executionEntityId);
  const canLoadMaintenance = typeof prisma.propertyMaintenanceTask?.findFirst === 'function';
  const canLoadReconciliation = typeof prisma.operationalWorkReconciliation?.findFirst === 'function';
  const [routineTask, reconciliation] = await Promise.all([
    maintenanceTaskIds.length > 0 && canLoadMaintenance
      ? prisma.propertyMaintenanceTask.findFirst({
        where: {
          id: { in: maintenanceTaskIds },
          OR: [
            { isRecurring: true },
            { adoptedByHabit: { isNot: null } },
          ],
        },
        select: { id: true },
      })
      : Promise.resolve(null),
    canLoadReconciliation ? prisma.operationalWorkReconciliation.findFirst({
      where: { workItemId, status: { in: ['PENDING', 'RETRYING', 'FAILED'] } },
      select: { id: true },
    }) : Promise.resolve(null),
  ]);

  return {
    id: item.id,
    propertyId: item.propertyId,
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
    acceptedAt: item.acceptedAt,
    startedAt: item.startedAt,
    reportedCompletedAt: item.reportedCompletedAt,
    verifiedAt: item.verifiedAt,
    deferredUntil: item.deferredUntil,
    dismissedAt: item.dismissedAt,
    closedAt: item.closedAt,
    supersededByWorkItemId: item.supersededByWorkItemId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    sources: item.sources.map((s) => ({
      sourceType: s.sourceType,
      sourceEntityId: s.sourceEntityId,
      sourceVersion: s.sourceVersion,
      sourceRole: s.sourceRole,
      active: s.active,
    })),
    executions: item.executions.map((e) => ({
      executionType: e.executionType,
      executionEntityId: e.executionEntityId,
      role: e.role,
      responsibleParty: e.responsibleParty,
    })),
    evidence: item.evidence.map((e) => ({
      id: e.id,
      evidenceType: e.evidenceType,
      evidenceEntityId: e.evidenceEntityId,
      verificationStatus: e.verificationStatus,
      observedAt: e.observedAt,
    })),
    watchers: item.watchers.map((w) => ({ userId: w.userId, addedAt: w.addedAt })),
    snoozedUntil: item.snoozedUntil,
    understoodAt: item.understoodAt,
    materialApprovalRequired: item.materialApprovalRequired,
    materialApprovedAt: item.materialApprovedAt,
    materialApprovedByUserId: item.materialApprovedByUserId,
    isRoutine: Boolean(routineTask),
    reconciliationPending: Boolean(reconciliation),
    // Home Operations Item #16: computed so the write-API frontend never
    // needs its own copy of the state machine.
    legalNextStates: legalUserWorkItemTransitions(item),
    closureDispositionRule: item.state === 'CLOSED' ? null : closureDispositionRuleFor(item.state),
  };
}
