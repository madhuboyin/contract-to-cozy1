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

function evidencePolicyFor(safetyTier: RecommendationSafetyTier) {
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
  await PropertyMaintenanceTaskService.updateTaskStatus(
    input.userId,
    primaryExecution.executionEntityId,
    'COMPLETED',
    input.costCents != null ? input.costCents / 100 : undefined,
    input.observedResult ?? undefined,
    idempotencyKey,
  );

  const updatedItem = await prisma.operationalWorkItem.findUniqueOrThrow({ where: { id: item.id }, select: { state: true } });

  const observation = await recordOperationalWorkOutcome({
    propertyId: input.propertyId,
    workItemId: item.id,
    userId: input.userId,
    costCents: input.costCents ?? null,
    recommendationSnapshotId: input.decisionLineage?.status === 'LINKED'
      ? input.decisionLineage.thread.currentRecommendationSnapshotId
      : null,
  });

  return { alreadyComplete: false, workItemState: updatedItem.state, observationId: observation.id };
}
