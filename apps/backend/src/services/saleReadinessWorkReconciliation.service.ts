// Home Intelligence Functional Completeness FRD Phase 4 review finding 3 —
// a SALE_PREP-kind HomeAction is workKeyEligible (WORK_ITEM_ELIGIBLE_SOURCE_
// KINDS) and can become an accepted OperationalWorkItem, but
// propertySaleCase.service.ts's setItemDecision only ever wrote
// SaleReadinessItem.status — the linked work item (if the homeowner had
// accepted the promoted Home Action) was never reconciled. This module
// closes that gap the same way propertyRecord.adapter.ts's
// syncPropertyRecordWorkItem does for RECORD_REVIEW: no separate
// OperationalWorkExecution row is needed, since the SaleReadinessItem
// record IS both the trigger and the resolution evidence for its own
// obligation.
//
// Best-effort: a reconciliation failure must never block the sale-case
// mutation that triggered it.
import { logger } from '../lib/logger';
import type { OperationalWorkItemState } from '@prisma/client';
import { resolveSalePrepWorkKey } from '../modules/homeOperations/adapters/homeActionWorkItem.adapter';
import { transitionWorkItem } from '../modules/homeOperations/application/transitionWorkItem.usecase';
import { findWorkItemByWorkKey } from '../modules/homeOperations/infrastructure/workItemRepository';
import { recordReconciliationFailure } from '../modules/homeOperations/infrastructure/reconciliationRepository';
import { recordOperationalWorkOutcome } from './decisionPlatform/outcomeObservationService';
import { resolveWorkItemRecommendationSnapshotId } from './decisionPlatform/homeActionDecisionLineage';

export type SaleReadinessItemDecisionAction = 'WAIVE' | 'REOPEN' | 'PURSUE' | 'UNPURSUE';

/**
 * Called right after propertySaleCase.service.ts's setItemDecision writes
 * the SaleReadinessItem. WAIVE and PURSUE are durable homeowner decisions
 * (setItemDecision's own comments) with a clean forward mapping onto the
 * work item's own lifecycle: WAIVE means "not doing this," so the linked
 * work item closes; PURSUE means "committing to this," so a still-CANDIDATE
 * work item is accepted.
 *
 * Reversible checklist decisions are reversible in the canonical work
 * lifecycle too: REOPEN/UNPURSUE restore the obligation to REOPENED, and a
 * subsequent PURSUE moves it back into active progress.
 */
export async function reconcileSaleReadinessItemDecision(input: {
  propertyId: string;
  itemId: string;
  userId: string;
  action: SaleReadinessItemDecisionAction;
}): Promise<void> {
  try {
    const workKey = resolveSalePrepWorkKey(input.propertyId, input.itemId);
    const workItem = await findWorkItemByWorkKey(input.propertyId, workKey);
    if (!workItem) return;

    if (input.action === 'WAIVE') {
      if (workItem.state === 'CLOSED') return;
      const disposition = workItem.state === 'CANDIDATE' ? 'NOT_RELEVANT' : 'CANCELLED';
      await transitionWorkItem({
        workItemId: workItem.id,
        to: 'CLOSED',
        disposition,
        actorType: 'USER',
        actorUserId: input.userId,
        idempotencyKey: `sale-prep-waived:${input.itemId}`,
        payload: { saleReadinessItemId: input.itemId, decision: 'WAIVE' },
      });
      return;
    }

    if (input.action === 'REOPEN' || input.action === 'UNPURSUE') {
      if (workItem.state === 'CLOSED' || workItem.state === 'ACCEPTED') {
        await transitionWorkItem({
          workItemId: workItem.id,
          to: 'REOPENED',
          actorType: 'USER',
          actorUserId: input.userId,
          resetAcceptanceOnReopen: true,
          idempotencyKey: `sale-prep-reopened:${input.itemId}:${input.action}`,
          payload: { saleReadinessItemId: input.itemId, decision: input.action },
        });
      }
      return;
    }

    // PURSUE
    if (workItem.state === 'CANDIDATE') {
      await transitionWorkItem({
        workItemId: workItem.id,
        to: 'ACCEPTED',
        actorType: 'USER',
        actorUserId: input.userId,
        idempotencyKey: `sale-prep-pursued:${input.itemId}`,
        payload: { saleReadinessItemId: input.itemId, decision: 'PURSUE' },
      });
    } else if (workItem.state === 'CLOSED') {
      await transitionWorkItem({
        workItemId: workItem.id, to: 'REOPENED', actorType: 'USER', actorUserId: input.userId,
        resetAcceptanceOnReopen: true,
        idempotencyKey: `sale-prep-pursued-reopen:${input.itemId}`,
        payload: { saleReadinessItemId: input.itemId, decision: 'PURSUE' },
      });
      await transitionWorkItem({
        workItemId: workItem.id, to: 'ACCEPTED', actorType: 'USER', actorUserId: input.userId,
        idempotencyKey: `sale-prep-pursued-accept:${input.itemId}`,
        payload: { saleReadinessItemId: input.itemId, decision: 'PURSUE' },
      });
    } else if (workItem.state === 'REOPENED') {
      await transitionWorkItem({
        workItemId: workItem.id, to: 'ACCEPTED', actorType: 'USER', actorUserId: input.userId,
        idempotencyKey: `sale-prep-pursued-accept:${input.itemId}`,
        payload: { saleReadinessItemId: input.itemId, decision: 'PURSUE' },
      });
    }
  } catch (err) {
    await recordReconciliationFailure({
      propertyId: input.propertyId,
      operation: 'SALE_PREP_WORK_SYNC',
      sourceType: 'SALE_PREP',
      sourceEntityId: input.itemId,
      idempotencyKey: `sale-prep-work-sync:${input.itemId}:${input.action}`,
      payload: { itemId: input.itemId, action: input.action },
      error: err,
    }).catch(() => null);
    logger.warn({ err, propertyId: input.propertyId, itemId: input.itemId, action: input.action }, 'Home Operations sale-readiness work item sync failed; sale case mutation proceeds regardless');
  }
}

/** Reconcile source disappearance as genuine completion, not cancellation. */
export async function reconcileSaleReadinessItemResolved(input: {
  propertyId: string;
  itemId: string;
}): Promise<void> {
  try {
    const workItem = await findWorkItemByWorkKey(input.propertyId, resolveSalePrepWorkKey(input.propertyId, input.itemId));
    if (!workItem || workItem.state === 'VERIFIED' || workItem.state === 'CLOSED') return;
    if (workItem.state === 'CANDIDATE') {
      await transitionWorkItem({
        workItemId: workItem.id, to: 'CLOSED', disposition: 'NOT_RELEVANT', actorType: 'SYSTEM',
        idempotencyKey: `sale-prep-source-resolved:${input.itemId}:candidate`,
        payload: { saleReadinessItemId: input.itemId, sourceResolved: true },
      });
      return;
    }
    let state: OperationalWorkItemState = workItem.state;
    if (state === 'FOLLOW_UP_DUE') {
      const accepted = await transitionWorkItem({
        workItemId: workItem.id, to: 'ACCEPTED', actorType: 'SYSTEM',
        idempotencyKey: `sale-prep-source-resolved:${input.itemId}:accepted`,
        payload: { saleReadinessItemId: input.itemId, sourceResolved: true },
      });
      state = accepted.state;
    }
    if (state === 'BLOCKED' || state === 'DEFERRED' || state === 'REOPENED') {
      const active = await transitionWorkItem({
        workItemId: workItem.id, to: 'IN_PROGRESS', actorType: 'SYSTEM',
        idempotencyKey: `sale-prep-source-resolved:${input.itemId}:active`,
        payload: { saleReadinessItemId: input.itemId, sourceResolved: true },
      });
      state = active.state;
    }
    if (state !== 'REPORTED_COMPLETE') {
      const reported = await transitionWorkItem({
        workItemId: workItem.id, to: 'REPORTED_COMPLETE', actorType: 'SYSTEM',
        idempotencyKey: `sale-prep-source-resolved:${input.itemId}:reported`,
        payload: { saleReadinessItemId: input.itemId, sourceResolved: true },
      });
      state = reported.state;
    }
    if (state === 'REPORTED_COMPLETE') {
      const verified = await transitionWorkItem({
        workItemId: workItem.id, to: 'VERIFIED', actorType: 'SYSTEM',
        idempotencyKey: `sale-prep-source-resolved:${input.itemId}:verified`,
        payload: { saleReadinessItemId: input.itemId, sourceResolved: true },
      });
      await recordOperationalWorkOutcome({
        propertyId: input.propertyId,
        workItemId: verified.id,
        userId: null,
        costCents: null,
        recommendationSnapshotId: await resolveWorkItemRecommendationSnapshotId(input.propertyId, verified.id),
      });
    }
  } catch (err) {
    await recordReconciliationFailure({
      propertyId: input.propertyId, operation: 'SALE_PREP_WORK_SYNC', sourceType: 'SALE_PREP',
      sourceEntityId: input.itemId, idempotencyKey: `sale-prep-work-sync:${input.itemId}:RESOLVED`,
      payload: { itemId: input.itemId, action: 'RESOLVED' }, error: err,
    }).catch(() => null);
    logger.warn({ err, ...input }, 'Home Operations sale-readiness resolution sync failed');
  }
}
