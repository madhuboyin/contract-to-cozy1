import type { OperationalWorkActorType, OperationalWorkEventType, OperationalWorkItemDisposition, OperationalWorkItemState } from '@prisma/client';
import { applyTransition } from '../domain/transitions';
import { findWorkItemById, recordWorkEvent, updateWorkItemState, type WorkItemDb } from '../infrastructure/workItemRepository';
import { emitWorkItemLifecycleChange, type WorkItemLifecycleEventCallback } from '../infrastructure/workItemChangeEmitter';
import { prisma } from '../../../lib/prisma';
import { assertDecisionLineageSatisfiedForAcceptance } from '../../../services/decisionPlatform/homeActionDecisionLineage';
import { reopenLinkedDomainRecords } from '../infrastructure/domainReopenDispatch';

/**
 * Maps a legal state transition to the event vocabulary the parent plan
 * names in its completion/write-back contract (section 9.2). Event-type
 * selection is an application-layer concern (the pure domain/transitions.ts
 * only knows about state legality), so it lives here rather than in the
 * domain module.
 */
function eventTypeForTransition(to: OperationalWorkItemState, disposition: OperationalWorkItemDisposition | null): OperationalWorkEventType {
  if (to === 'CLOSED' && disposition) return 'WORK_DISPOSITION_RECORDED';
  switch (to) {
    case 'ACCEPTED': return 'WORK_ACCEPTED';
    case 'SCHEDULED': return 'WORK_SCHEDULED';
    case 'IN_PROGRESS': return 'EXECUTION_STARTED';
    case 'BLOCKED': return 'EXECUTION_BLOCKED';
    case 'DEFERRED': return 'WORK_DEFERRED';
    case 'REPORTED_COMPLETE': return 'WORK_REPORTED_COMPLETE';
    case 'REOPENED': return 'WORK_REOPENED';
    case 'VERIFIED': return 'OUTCOME_VERIFIED';
    case 'FOLLOW_UP_DUE': return 'FOLLOW_UP_CREATED';
    // IN_GUIDANCE / IN_PROJECT / CLOSED (no disposition, i.e. verified-completion close)
    default: return 'EXECUTION_STARTED';
  }
}

// Item #19 (§5.15) Slice 1: only these two timestamp fields represent a
// forward-looking "check back on this" moment (deferredUntil/nextReviewAt)
// rather than an as-of-now entry marker (acceptedAt, startedAt, etc.) — a
// caller-supplied timestampValue is only ever honored for these, so a
// mistaken future date can't silently rewrite historical entry timestamps.
const FORWARD_LOOKING_TIMESTAMP_FIELDS = new Set(['deferredUntil', 'nextReviewAt']);

export interface TransitionWorkItemInput {
  workItemId: string;
  to: OperationalWorkItemState;
  disposition?: OperationalWorkItemDisposition;
  actorType: OperationalWorkActorType;
  actorUserId?: string | null;
  idempotencyKey: string;
  payload?: Record<string, unknown> | null;
  /**
   * A real future date for DEFERRED (deferredUntil) or BLOCKED
   * (nextReviewAt) — e.g. "defer until next month," not "defer as of right
   * now." Ignored for every other target state.
   */
  timestampValue?: Date;
  /**
   * HI-ATT-010: overrides eventTypeForTransition's default mapping. Not
   * exposed through any user-facing route — only the booking reconciliation
   * service passes this, for the SCHEDULED/IN_PROGRESS -> ACCEPTED rollback
   * case, so the event history reads as a governed cancellation-driven
   * rollback (EXECUTION_CANCELLED) rather than a fresh homeowner acceptance
   * (WORK_ACCEPTED).
   */
  eventTypeOverride?: OperationalWorkEventType;
  /** Domain reconciliation may explicitly return a reversible decision to undecided. */
  resetAcceptanceOnReopen?: boolean;
}

export async function transitionWorkItem(
  input: TransitionWorkItemInput,
  db: WorkItemDb = prisma,
  onLifecycleEvent?: WorkItemLifecycleEventCallback,
) {
  const workItem = await findWorkItemById(input.workItemId, db);
  if (!workItem) throw new Error(`OperationalWorkItem ${input.workItemId} not found.`);

  const result = applyTransition(workItem, input.to, { disposition: input.disposition });
  if (result.state === 'REOPENED' && input.resetAcceptanceOnReopen) {
    result.acceptanceState = 'PROPOSED';
  }

  // Home Intelligence Functional Completeness FRD Phase 3 review finding 4,
  // delivery step 5 — server-side commitment-boundary enforcement. Every
  // commitment path (explicit accept, booking creation, project creation)
  // funnels through this one CANDIDATE -> ACCEPTED edge regardless of
  // actorType (booking-driven acceptance runs as actorType: 'SYSTEM'), so
  // this is the single chokepoint that must independently reject an
  // acceptance the UI failed to gate. See homeActionDecisionLineage.ts.
  if (result.state === 'ACCEPTED' && workItem.state === 'CANDIDATE') {
    await assertDecisionLineageSatisfiedForAcceptance(workItem.propertyId, input.workItemId, db);
  }

  const timestampValue = result.timestampField && FORWARD_LOOKING_TIMESTAMP_FIELDS.has(result.timestampField)
    ? input.timestampValue
    : undefined;
  let updated = await updateWorkItemState(input.workItemId, { ...result, timestampValue }, db);

  if (result.state === 'VERIFIED' || result.state === 'CLOSED') {
    await db.operationalWorkSource.updateMany({
      where: { workItemId: input.workItemId, active: true },
      data: { active: false, reconciledAt: new Date() },
    });
  } else if (
    result.state === 'REOPENED' ||
    (result.state === 'ACCEPTED' && workItem.state === 'FOLLOW_UP_DUE')
  ) {
    await db.operationalWorkSource.updateMany({
      where: { workItemId: input.workItemId },
      data: { active: true, reconciledAt: null, lastObservedAt: new Date() },
    });
    if (workItem.state === 'FOLLOW_UP_DUE' || result.state === 'REOPENED') {
      updated = await db.operationalWorkItem.update({
        where: { id: input.workItemId },
        data: { scheduleOverrideAt: null },
      });
    }
    // Home Intelligence Functional Completeness FRD Phase 4 review finding
    // 6 gap fix: both branches here mean "previously-verified work is open
    // again" -- the authoritative domain record must follow, not just this
    // item's own source links. Best-effort, after the item's own state is
    // already committed (see reopenLinkedDomainRecords's own docblock for
    // why it must never block this transition).
    await reopenLinkedDomainRecords(input.workItemId);
  }

  const event = await recordWorkEvent({
    workItemId: input.workItemId,
    eventType: input.eventTypeOverride ?? eventTypeForTransition(result.state, result.disposition),
    actorType: input.actorType,
    actorUserId: input.actorUserId,
    idempotencyKey: input.idempotencyKey,
    payload: { from: workItem.state, to: result.state, disposition: result.disposition, ...(input.payload ?? {}) },
  }, db);

  if (result.state === 'VERIFIED' || result.state === 'CLOSED') {
    await recordWorkEvent({
      workItemId: input.workItemId,
      eventType: 'SOURCE_RECONCILED',
      actorType: 'SYSTEM',
      idempotencyKey: `source-links-reconciled:${input.idempotencyKey}`,
      payload: { outcomeState: result.state, disposition: result.disposition, sourceLinksClosed: true },
    }, db);
  }

  // Item #20 (Slice 8: "digest limited to changed or due work") — best-effort,
  // see workItemChangeEmitter.ts. event is nullable in type only for a
  // theoretical race on the idempotent-retry lookup; recordWorkEvent always
  // returns a row in practice for a freshly-issued idempotencyKey.
  // HI-ATT-010: inside a caller-owned transaction (onLifecycleEvent
  // supplied), defer this until after commit instead.
  if (event) {
    if (onLifecycleEvent) {
      await onLifecycleEvent(updated, event);
    } else {
      await emitWorkItemLifecycleChange(updated, event);
    }
  }

  return updated;
}
