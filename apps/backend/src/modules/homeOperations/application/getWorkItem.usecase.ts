import { getWorkItemGraph } from '../infrastructure/workItemRepository';
import { LEGAL_TRANSITIONS, closureDispositionRuleFor } from '../domain/transitions';

export async function getWorkItem(workItemId: string) {
  const item = await getWorkItemGraph(workItemId);
  if (!item) return null;

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
    })),
    evidence: item.evidence.map((e) => ({
      evidenceType: e.evidenceType,
      evidenceEntityId: e.evidenceEntityId,
      verificationStatus: e.verificationStatus,
      observedAt: e.observedAt,
    })),
    watchers: item.watchers.map((w) => ({ userId: w.userId, addedAt: w.addedAt })),
    // Home Operations Item #16: computed so the write-API frontend never
    // needs its own copy of the state machine.
    legalNextStates: LEGAL_TRANSITIONS[item.state],
    closureDispositionRule: item.state === 'CLOSED' ? null : closureDispositionRuleFor(item.state),
  };
}
