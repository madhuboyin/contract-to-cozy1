import { prisma } from '../../../lib/prisma';
import type { HouseholdRole } from '@prisma/client';
import { approveMaterialWorkItem, recordWorkEvent } from '../infrastructure/workItemRepository';
import { transitionWorkItem } from './transitionWorkItem.usecase';
import { assertMaterialApprovalEvidenceSatisfiesPolicy } from '../../../services/homeOperationsMaterialApprovalEvidence.service';
import { recordOperationalWorkOutcome } from '../../../services/decisionPlatform/outcomeObservationService';
import { resolveWorkItemRecommendationSnapshotId } from '../../../services/decisionPlatform/homeActionDecisionLineage';

/** A request the approval cannot take (not required, evidence not on this work). The route maps `status` and `code` to its response. */
export class MaterialApprovalRequestError extends Error {
  constructor(readonly status: 400 | 409, readonly code: 'APPROVAL_NOT_REQUIRED' | 'EVIDENCE_REQUIRED', message: string) {
    super(message);
    this.name = 'MaterialApprovalRequestError';
  }
}

type ApprovableItem = Parameters<typeof assertMaterialApprovalEvidenceSatisfiesPolicy>[0] & { state: string; materialApprovalRequired: boolean };

/**
 * The owner's approval of material or safety work: the route's own steps, shared with Ask so both run the same policy gate. Consults the completion
 * evidence policy before any mutation (HI-OUT-002), marks the evidence verified, records the approval, and, when the work was reported complete,
 * verifies it and records an attributed outcome (HI-OUT-005/006). Throws MaterialApprovalRequestError or MaterialApprovalEvidencePolicyViolationError.
 */
export async function approveMaterialWork(input: {
  item: ApprovableItem; role: HouseholdRole; actorUserId: string; evidenceId: string; decisionNote: string;
  costCents?: number | null; observedResult?: string | null;
}) {
  const { item } = input;
  if (!item.materialApprovalRequired) {
    throw new MaterialApprovalRequestError(409, 'APPROVAL_NOT_REQUIRED', 'This work does not require material approval.');
  }
  const evidence = await prisma.operationalWorkEvidence.findFirst({ where: { id: input.evidenceId, workItemId: item.id } });
  if (!evidence) throw new MaterialApprovalRequestError(400, 'EVIDENCE_REQUIRED', 'Select evidence attached to this work item.');
  // Home Intelligence Functional Completeness FRD Phase 4 review finding 1 gap fix: the same consequence-based policy the quick-complete path
  // enforces (HI-OUT-002), so REGULATED_COVERAGE work cannot be approved with any evidence type and SAFETY_EMERGENCY evidence is tied to a real record.
  await assertMaterialApprovalEvidenceSatisfiesPolicy(item, input.role, evidence, {
    costCents: input.costCents ?? null,
    observedResult: input.observedResult ?? null,
  });
  await prisma.operationalWorkEvidence.update({ where: { id: evidence.id }, data: { verificationStatus: 'VERIFIED' } });
  await approveMaterialWorkItem(item.id, input.actorUserId);
  await recordWorkEvent({
    workItemId: item.id,
    eventType: 'WORK_APPROVED',
    actorType: 'USER',
    actorUserId: input.actorUserId,
    idempotencyKey: `material-approval:${item.id}:${evidence.id}`,
    payload: { evidenceId: evidence.id, decisionNote: input.decisionNote },
  });
  if (item.state === 'REPORTED_COMPLETE') {
    const verified = await transitionWorkItem({
      workItemId: item.id,
      to: 'VERIFIED',
      actorType: 'USER',
      actorUserId: input.actorUserId,
      idempotencyKey: `material-approved-verified:${item.id}:${evidence.id}`,
    });
    // The quick-complete path records an OutcomeObservation on VERIFIED; this approval path, reserved for the highest-consequence work, does too.
    await recordOperationalWorkOutcome({
      propertyId: verified.propertyId,
      workItemId: verified.id,
      userId: input.actorUserId,
      costCents: input.costCents ?? null,
      recommendationSnapshotId: await resolveWorkItemRecommendationSnapshotId(verified.propertyId, verified.id),
    });
  }
}
