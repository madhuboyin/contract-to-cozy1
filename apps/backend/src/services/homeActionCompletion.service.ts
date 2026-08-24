// Home Intelligence Functional Completeness FRD Phase 4 — evidence-backed
// completion and outcome loop (§8.5 HI-OUT-001/002/004/005/006). Closes
// the gap the Phase 0 registry report documented: every accepted
// OperationalWorkItem re-projected onto Home by appendAcceptedOperationalWork
// (homeActions.service.ts) offered only CORRECT_FACT/SNOOZE — there was no
// COMPLETE control, no reconciliation write-back to the authoritative
// domain record, and no OutcomeObservation ever created for any of the 23
// Home Action producers.
//
// Scope of this slice: the maintenance-task-backed accepted work item, the
// highest-volume obligation type. Routes through
// PropertyMaintenanceTaskService.updateTaskStatus -- the same authoritative
// completion path the maintenance page itself uses -- rather than writing a
// second, parallel completion path against the work item alone (the "two
// task systems" trap already hit once in this codebase; see
// PropertyMaintenanceTask.service.ts's syncTaskWorkItem). That single call
// already handles work-item transition, HomeEvent, evidence, Property
// Change emission, and (Phase 2) recompute -- this module's only new
// responsibility is the evidence-policy gate and OutcomeObservation/
// attribution creation.

import { prisma } from '../lib/prisma';
import { PropertyMaintenanceTaskService } from './PropertyMaintenanceTask.service';
import { recordOperationalWorkOutcome } from './decisionPlatform/outcomeObservationService';
import { COMPLETION_EVIDENCE_POLICY } from './intelligence/completionEvidencePolicy.registry';
import type { RecommendationSafetyTier } from '../productFramework/recommendationGovernance.contract';
import type { HomeActionDecisionLineage } from './decisionPlatform/homeActionDecisionLineage';
import { recordWorkEvidence, recordWorkEvent } from '../modules/homeOperations/infrastructure/workItemRepository';
import { transitionWorkItem } from '../modules/homeOperations/application/transitionWorkItem.usecase';

export class CompletionEvidencePolicyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompletionEvidencePolicyViolationError';
  }
}

export class UnsupportedWorkItemCompletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedWorkItemCompletionError';
  }
}

export function evidencePolicyFor(safetyTier: RecommendationSafetyTier) {
  const entry = COMPLETION_EVIDENCE_POLICY.find((candidate) => candidate.safetyTier === safetyTier);
  if (!entry) throw new Error(`No completion evidence policy declared for safety tier "${safetyTier}".`);
  return entry;
}

/**
 * HI-OUT-002. Checked before any mutation so a rejected request never
 * partially applies. REGULATED_COVERAGE/SAFETY_EMERGENCY declare
 * attestation INSUFFICIENT -- those must go through the work item's
 * evidence/approval flow (WorkItemManageDrawer -> recordEvidenceHandler /
 * approveMaterialWorkHandler), not this quick-complete path.
 */
export function assertCompletionEvidenceSatisfied(
  safetyTier: RecommendationSafetyTier,
  input: { costCents?: number | null; observedResult?: string | null },
): void {
  const policy = evidencePolicyFor(safetyTier);
  if (policy.attestation === 'INSUFFICIENT') {
    throw new CompletionEvidencePolicyViolationError(
      `${safetyTier} work cannot be completed by a simple mark-done. ${policy.minimumCompletionBehavior} Use "Manage action" to record evidence instead.`,
    );
  }
  if (policy.costOrObservedResult === 'REQUIRED' && input.costCents == null && !input.observedResult) {
    throw new CompletionEvidencePolicyViolationError(
      `${safetyTier} work requires a cost or an observed result to complete. ${policy.minimumCompletionBehavior}`,
    );
  }
}

export interface CompleteAcceptedWorkItemInput {
  workItemId: string;
  propertyId: string;
  userId: string;
  safetyTier: RecommendationSafetyTier;
  decisionLineage: HomeActionDecisionLineage | null;
  costCents?: number | null;
  observedResult?: 'CONFIRMED_HEALTHY' | 'NEEDS_ATTENTION' | 'FAILED' | null;
  // Home Intelligence Functional Completeness FRD Phase 4 review finding 2
  // gap fix (HI-OUT-003): completion date, DIY/provider, provider identity,
  // notes, photos/documents, and follow-up need -- the full field set the
  // FRD requires, adapted here to the one obligation type quick-complete
  // supports today (maintenance).
  completedAt?: string | null;
  fulfillmentMode?: 'DIY' | 'PROVIDER' | null;
  providerName?: string | null;
  notes?: string | null;
  followUpNeeded?: boolean;
  photoDocumentIds?: string[];
}

export type CompleteAcceptedWorkItemResult =
  | { alreadyComplete: true }
  | { alreadyComplete: false; workItemState: string; observationId: string };

/**
 * HI-OUT-001/004/005/006. Idempotent: completing an already-VERIFIED/CLOSED
 * item is a no-op success, not an error, matching the rest of this
 * codebase's completion-command idempotency convention.
 */
export async function completeAcceptedOperationalWorkItem(
  input: CompleteAcceptedWorkItemInput,
): Promise<CompleteAcceptedWorkItemResult> {
  assertCompletionEvidenceSatisfied(input.safetyTier, input);

  const item = await prisma.operationalWorkItem.findUnique({
    where: { id: input.workItemId },
    include: { executions: { where: { role: 'PRIMARY' }, take: 1 } },
  });
  if (!item || item.propertyId !== input.propertyId) {
    throw new Error('Work item was not found for this property.');
  }
  if (item.state === 'VERIFIED' || item.state === 'CLOSED') {
    return { alreadyComplete: true };
  }

  const primaryExecution = item.executions[0];
  if (primaryExecution?.executionType !== 'MAINTENANCE_TASK') {
    throw new UnsupportedWorkItemCompletionError(
      'Quick completion is only available for maintenance work today. Use "Manage action" to record completion with evidence.',
    );
  }

  const idempotencyKey = `home-action-complete:${item.id}:${input.userId}`;
  const parsedCompletedAt = input.completedAt ? new Date(input.completedAt) : undefined;
  await PropertyMaintenanceTaskService.updateTaskStatus(
    input.userId,
    primaryExecution.executionEntityId,
    'COMPLETED',
    input.costCents != null ? input.costCents / 100 : undefined,
    input.observedResult ?? undefined,
    idempotencyKey,
    {
      completedAt: parsedCompletedAt && !Number.isNaN(parsedCompletedAt.getTime()) ? parsedCompletedAt : undefined,
      fulfillmentMode: input.fulfillmentMode ?? undefined,
      providerName: input.providerName ?? undefined,
      notes: input.notes ?? undefined,
      followUpNeeded: input.followUpNeeded ?? undefined,
      photoDocumentIds: input.photoDocumentIds ?? undefined,
    },
  );

  // Photos/documents become durable OperationalWorkEvidence, not just JSON
  // on the maintenance task -- the same evidence list "Manage action"
  // already renders for evidence recorded through the other completion path.
  for (const documentId of input.photoDocumentIds ?? []) {
    await recordWorkEvidence({
      workItemId: item.id,
      evidenceType: 'DOCUMENT',
      evidenceEntityId: documentId,
      verificationStatus: 'VERIFIED',
      observedAt: parsedCompletedAt && !Number.isNaN(parsedCompletedAt.getTime()) ? parsedCompletedAt : new Date(),
    });
  }
  if (input.notes) {
    await recordWorkEvent({
      workItemId: item.id,
      eventType: 'OUTCOME_EVIDENCE_ADDED',
      actorType: 'USER',
      actorUserId: input.userId,
      idempotencyKey: `${idempotencyKey}:notes`,
      payload: { notes: input.notes, fulfillmentMode: input.fulfillmentMode ?? null, providerName: input.providerName ?? null },
    });
  }

  let updatedItem = await prisma.operationalWorkItem.findUniqueOrThrow({ where: { id: item.id }, select: { id: true, propertyId: true, state: true } });

  const observation = await recordOperationalWorkOutcome({
    propertyId: input.propertyId,
    workItemId: item.id,
    userId: input.userId,
    costCents: input.costCents ?? null,
    recommendationSnapshotId: input.decisionLineage?.status === 'LINKED'
      ? input.decisionLineage.thread.currentRecommendationSnapshotId
      : null,
  });

  // "Follow-up need" (HI-OUT-003) -- VERIFIED work the homeowner flagged as
  // needing another look moves straight to FOLLOW_UP_DUE, a legal direct
  // edge (domain/transitions.ts) that already drives its own reminder
  // policy (reminderPolicy.ts's remindOnNextReview).
  if (input.followUpNeeded && updatedItem.state === 'VERIFIED') {
    const followedUp = await transitionWorkItem({
      workItemId: item.id,
      to: 'FOLLOW_UP_DUE',
      actorType: 'USER',
      actorUserId: input.userId,
      idempotencyKey: `${idempotencyKey}:follow-up`,
      payload: { reason: 'homeowner_flagged_follow_up_needed' },
    });
    updatedItem = { id: followedUp.id, propertyId: followedUp.propertyId, state: followedUp.state };
  }

  return { alreadyComplete: false, workItemState: updatedItem.state, observationId: observation.id };
}
