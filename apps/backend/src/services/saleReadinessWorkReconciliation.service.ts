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
import { resolveSalePrepWorkKey } from '../modules/homeOperations/adapters/homeActionWorkItem.adapter';
import { transitionWorkItem } from '../modules/homeOperations/application/transitionWorkItem.usecase';
import { findWorkItemByWorkKey } from '../modules/homeOperations/infrastructure/workItemRepository';
import { recordReconciliationFailure } from '../modules/homeOperations/infrastructure/reconciliationRepository';

export type SaleReadinessItemDecisionAction = 'WAIVE' | 'REOPEN' | 'PURSUE' | 'UNPURSUE';

/**
 * Called right after propertySaleCase.service.ts's setItemDecision writes
 * the SaleReadinessItem. WAIVE and PURSUE are durable homeowner decisions
 * (setItemDecision's own comments) with a clean forward mapping onto the
 * work item's own lifecycle: WAIVE means "not doing this," so the linked
 * work item closes; PURSUE means "committing to this," so a still-CANDIDATE
 * work item is accepted.
 *
 * REOPEN/UNPURSUE deliberately do not force any work-item transition.
 * loadSalePrepActions (homeActionSourcePromotion.service.ts) only proposes
 * this action while the item's status is OPEN, so once WAIVE closes the
 * work item, REOPEN cannot resurrect that same row through the normal
 * pipeline either — domain/transitions.ts's LEGAL_TRANSITIONS.CLOSED is []
 * (terminal by design, same constraint documented in
 * incidentWorkReconciliation.service.ts). Forcing a transition CLOSED does
 * not support would require bypassing the shared state machine every other
 * domain adapter in this module honors; a homeowner who wants that specific
 * recommendation back has Home Operations' own governed reopen/duplicate
 * tooling for it. UNPURSUE similarly has no legal ACCEPTED -> CANDIDATE
 * edge — the work item, if already accepted, remains accepted; unpursuing
 * only clears the homeowner's separate checklist-level commitment marker.
 */
export async function reconcileSaleReadinessItemDecision(input: {
  propertyId: string;
  itemId: string;
  userId: string;
  action: SaleReadinessItemDecisionAction;
}): Promise<void> {
  if (input.action !== 'WAIVE' && input.action !== 'PURSUE') return;

  try {
    const workKey = resolveSalePrepWorkKey(input.propertyId, input.itemId);
    const workItem = await findWorkItemByWorkKey(input.propertyId, workKey);
    if (!workItem || workItem.state === 'CLOSED') return;

    if (input.action === 'WAIVE') {
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
