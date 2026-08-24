// Home Intelligence Functional Completeness FRD Phase 4 gap fix (§8.5 work
// item 3: "Complete Operational Work reconciliation adapters for
// maintenance, projects, guidance, inspection, bookings, claims, and sale
// readiness."). Claims previously had zero touchpoint with OperationalWorkItem
// — claims.service.ts never imported anything from modules/homeOperations,
// and no HOME_ACTION_SOURCE_KINDS entry or work-item source adapter existed
// for CLAIM. Unlike a recommendation-originated obligation, a claim has no
// prior Home Action to accept: a homeowner filing a claim is, by definition,
// already-committed work, so this mirrors bookingWorkReconciliation.service
// .ts's standalone-item branch (propose -> CANDIDATE -> immediate ACCEPTED)
// rather than the acceptance-gated flow most adapters use.
//
// Best-effort, like guidanceCompletionHooks/projectWorkItemReconciliation/
// propertyRecord.adapter's own sync functions: a Home Operations sync
// failure must never block the claim mutation that triggered it.
import type { OperationalWorkItem, OperationalWorkItemState } from '@prisma/client';
import { logger } from '../lib/logger';
import type { ProposedWorkItem } from '../modules/homeOperations/domain/sourceAdapter';
import { resolveWorkKey } from '../modules/homeOperations/domain/workKey';
import { resolveAndUpsertWorkItem } from '../modules/homeOperations/application/resolveWorkItem.usecase';
import { transitionWorkItem } from '../modules/homeOperations/application/transitionWorkItem.usecase';
import { findWorkItemByWorkKey, linkWorkExecution } from '../modules/homeOperations/infrastructure/workItemRepository';
import { recordReconciliationFailure } from '../modules/homeOperations/infrastructure/reconciliationRepository';
import { recordClaimOutcome } from './decisionPlatform/outcomeObservationService';

function claimObligationSlug(claimId: string): string {
  return `claim-${claimId}`;
}

function resolveClaimWorkKey(propertyId: string, claimId: string): string {
  return resolveWorkKey({
    propertyId,
    subject: { type: 'PROPERTY', id: propertyId },
    obligationType: 'CLAIM_RESOLUTION',
    occurrence: { obligationSlug: claimObligationSlug(claimId) },
  });
}

/**
 * Called right after claims.service.ts creates a Claim. Resolves/creates the
 * standalone CLAIM_RESOLUTION work item and immediately accepts it — a
 * homeowner who just filed a claim is not being "recommended" to do so, so
 * there is no CANDIDATE review step to wait on. CLAIM is not in
 * WORK_ITEM_DECISION_LINEAGE_SOURCE_TYPES (homeActionDecisionLineage.ts), so
 * the CANDIDATE -> ACCEPTED chokepoint's decision-lineage gate never applies
 * here, matching booking's own standalone-item precedent.
 */
export async function reconcileClaimCreated(input: {
  propertyId: string;
  claimId: string;
  userId: string;
  title: string;
  createdAt: Date;
}): Promise<void> {
  try {
    const proposal: ProposedWorkItem = {
      propertyId: input.propertyId,
      subject: { type: 'PROPERTY', id: input.propertyId },
      obligationType: 'CLAIM_RESOLUTION',
      occurrence: { obligationSlug: claimObligationSlug(input.claimId) },
      title: `Carry claim through to resolution: ${input.title}`,
      homeownerReason: 'You started an insurance or warranty claim that needs to be carried through to a final decision.',
      expectedOutcome: 'The claim reaches a final decision (approved, denied, or otherwise closed) and any settlement is recorded.',
      priority: 'SOON',
      safetyTier: 'MATERIAL_FINANCIAL',
      source: {
        sourceType: 'CLAIM',
        sourceEntityId: input.claimId,
        sourceVersion: input.createdAt.toISOString(),
        sourceRole: 'TRIGGER',
      },
    };
    let workItem = await resolveAndUpsertWorkItem(proposal);
    if (workItem.state === 'CANDIDATE') {
      workItem = await transitionWorkItem({
        workItemId: workItem.id,
        to: 'ACCEPTED',
        actorType: 'USER',
        actorUserId: input.userId,
        idempotencyKey: `claim-accepted:${input.claimId}`,
        payload: { claimId: input.claimId, reason: 'claim_filed' },
      });
    }
    await linkWorkExecution({ workItemId: workItem.id, executionType: 'CLAIM', executionEntityId: input.claimId, role: 'PRIMARY' });
  } catch (err) {
    await recordReconciliationFailure({
      propertyId: input.propertyId,
      operation: 'CLAIM_WORK_SYNC',
      sourceType: 'CLAIM',
      sourceEntityId: input.claimId,
      idempotencyKey: `claim-created-sync:${input.claimId}`,
      payload: { claimId: input.claimId },
      error: err,
    }).catch(() => null);
    logger.warn({ err, propertyId: input.propertyId, claimId: input.claimId }, 'Home Operations claim work item creation failed; claim mutation proceeds regardless');
  }
}

async function walkToReportedComplete(workItem: OperationalWorkItem, idempotencySuffix: string): Promise<OperationalWorkItem> {
  let current = workItem;
  if (current.state === 'BLOCKED' || current.state === 'DEFERRED') {
    current = await transitionWorkItem({
      workItemId: current.id, to: 'IN_PROGRESS', actorType: 'SYSTEM',
      idempotencyKey: `claim-progress:${idempotencySuffix}`,
    });
  }
  if (current.state !== 'REPORTED_COMPLETE' && current.state !== 'VERIFIED') {
    current = await transitionWorkItem({
      workItemId: current.id, to: 'REPORTED_COMPLETE', actorType: 'SYSTEM',
      idempotencyKey: `claim-reported:${idempotencySuffix}`,
    });
  }
  return current;
}

/**
 * Called from claims.service.ts's updateClaim on every real status
 * transition. APPROVED/DENIED are the claim's own terminal decision states
 * (isValidTransition in claims.transitions.ts) — the domain-owned evidence
 * that reconciles the work item to VERIFIED and records the outcome, same
 * "authoritative record, no separate homeowner confirmation gate" pattern
 * bookingWorkReconciliation.service.ts's COMPLETED event uses. CLOSED can
 * arrive either after APPROVED/DENIED (already VERIFIED — this just closes
 * it) or directly from an earlier status (an abandoned claim — closes with
 * disposition CANCELLED, the same disposition HI-ATT-010 uses for "accepted
 * work ended without an independent completion").
 */
export async function reconcileClaimStatusChanged(input: {
  propertyId: string;
  claimId: string;
  userId: string;
  toStatus: 'IN_PROGRESS' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'DENIED' | 'CLOSED';
  settlementAmountCents: number | null;
}): Promise<void> {
  try {
    const workKey = resolveClaimWorkKey(input.propertyId, input.claimId);
    const workItem = await findWorkItemByWorkKey(input.propertyId, workKey);
    if (!workItem) return;
    if (workItem.state === 'CLOSED') return;

    if (input.toStatus === 'APPROVED' || input.toStatus === 'DENIED') {
      let state: OperationalWorkItemState = workItem.state;
      if (state === 'CANDIDATE') {
        const accepted = await transitionWorkItem({
          workItemId: workItem.id, to: 'ACCEPTED', actorType: 'SYSTEM',
          idempotencyKey: `claim-decided-accepted:${input.claimId}`,
        });
        state = accepted.state;
      }
      const reported = await walkToReportedComplete({ ...workItem, state }, input.claimId);
      if (reported.state === 'REPORTED_COMPLETE') {
        await transitionWorkItem({
          workItemId: reported.id, to: 'VERIFIED', actorType: 'SYSTEM',
          idempotencyKey: `claim-verified:${input.claimId}`,
          payload: { claimId: input.claimId, decision: input.toStatus },
        });
      }
      await recordClaimOutcome({
        propertyId: input.propertyId,
        claimId: input.claimId,
        userId: input.userId,
        decision: input.toStatus,
        costCents: input.settlementAmountCents,
        recommendationSnapshotId: null,
      });
      return;
    }

    if (input.toStatus === 'CLOSED') {
      if (workItem.state === 'VERIFIED') {
        await transitionWorkItem({
          workItemId: workItem.id, to: 'CLOSED', actorType: 'USER', actorUserId: input.userId,
          idempotencyKey: `claim-closed:${input.claimId}`,
        });
      } else {
        // Abandoned before a decision was recorded — accepted work that
        // ended without an independent completion (HI-ATT-010's own
        // reasoning for CANCELLED, reused here for the same shape of event).
        await transitionWorkItem({
          workItemId: workItem.id, to: 'CLOSED', disposition: 'CANCELLED', actorType: 'USER', actorUserId: input.userId,
          idempotencyKey: `claim-abandoned:${input.claimId}`,
        });
      }
      return;
    }

    // IN_PROGRESS / SUBMITTED / UNDER_REVIEW: the claim is still being
    // actively worked through its checklist. No dedicated work-item state
    // exists for each sub-stage; ACCEPTED already represents "accepted,
    // ongoing work." Only bring a CANDIDATE item forward defensively —
    // reconcileClaimCreated should already have accepted it.
    if (workItem.state === 'CANDIDATE') {
      await transitionWorkItem({
        workItemId: workItem.id, to: 'ACCEPTED', actorType: 'SYSTEM',
        idempotencyKey: `claim-in-progress-accepted:${input.claimId}`,
      });
    }
  } catch (err) {
    await recordReconciliationFailure({
      propertyId: input.propertyId,
      operation: 'CLAIM_STATUS_SYNC',
      sourceType: 'CLAIM',
      sourceEntityId: input.claimId,
      idempotencyKey: `claim-status-sync:${input.claimId}:${input.toStatus}`,
      payload: { claimId: input.claimId, toStatus: input.toStatus },
      error: err,
    }).catch(() => null);
    logger.warn({ err, propertyId: input.propertyId, claimId: input.claimId, toStatus: input.toStatus }, 'Home Operations claim status sync failed; claim mutation proceeds regardless');
  }
}
