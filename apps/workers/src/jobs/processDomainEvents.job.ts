import type { DomainEventType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotificationService } from '@worker-shared/services/notification.service';
import { claimDetailUrl } from '../lib/deepLinks';
import {
  processRefinanceTransitionAlert,
  type RefinanceAlertTransition,
} from './refinanceTransitionAlert.job';
import {
  processRadarPropertyReconciliationEvent,
} from '@worker-shared/modules/homeEventRadar/services/radarPropertyReconciliation.service';
import {
  processRecomputeRequestedEvent,
  processRecomputeRetryRequestedEvent,
} from '@worker-shared/services/intelligenceRecompute/intelligenceRecompute.service';
import {
  reconcileCaptureLink,
} from '@worker-shared/services/ask/captureLinkReconciliation';
import {
  processAskExtractionRequestedEvent,
  processGoalCandidateAttachEvent,
  processCaptureNotificationEvent,
} from '@worker-shared/services/ask/conversationalUnderstanding/conversationalCapture';
import {
  processRadarNotificationMaterializeEvent,
} from '@worker-shared/modules/homeEventRadar/services/radarNotificationMaterializationReconciliation.service';

type DomainEventStatus = 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'DEAD_LETTER';
// Ask Cozy Stage 3, Phase 2 (implementation plan §4.4/§8; FRD §17).
// DomainEventType is now the real Prisma-generated enum, imported above,
// not a hand-copied union -- it had already drifted from the schema before
// this phase touched anything (Phase 0's audit, implementation plan §4.4),
// and this file's own new ASK_CAPTURE_LINK_RECONCILE consumer below needs
// the two members this phase's earlier schema commit added.

export const MAX_DOMAIN_EVENT_ATTEMPTS = 8;
export const DOMAIN_EVENT_LEASE_MS = 15 * 60_000;

// W4 item 1: small, job-scoped dependency interface (see
// reserveFundBalanceReminder.job.ts for the pattern).
export interface ProcessDomainEventsDeps {
  prisma: Pick<typeof prisma, 'notification' | 'domainEvent' | 'intelligenceRecomputeRun' | 'intelligenceRecomputeTarget'>;
  notificationService: Pick<typeof NotificationService, 'create'>;
  refinanceTransitionAlert?: typeof processRefinanceTransitionAlert;
  radarPropertyReconciliation?: typeof processRadarPropertyReconciliationEvent;
  recomputeRequested?: typeof processRecomputeRequestedEvent;
  recomputeRetryRequested?: typeof processRecomputeRetryRequestedEvent;
  captureLinkReconcile?: typeof reconcileCaptureLink;
  askExtractionRequested?: typeof processAskExtractionRequestedEvent;
  radarNotificationMaterialize?: typeof processRadarNotificationMaterializeEvent;
  goalCandidateAttach?: typeof processGoalCandidateAttachEvent;
  captureNotification?: typeof processCaptureNotificationEvent;
}

const defaultDeps: ProcessDomainEventsDeps = {
  prisma,
  notificationService: NotificationService,
  refinanceTransitionAlert: processRefinanceTransitionAlert,
  radarPropertyReconciliation: processRadarPropertyReconciliationEvent,
  recomputeRequested: processRecomputeRequestedEvent,
  recomputeRetryRequested: processRecomputeRetryRequestedEvent,
  captureLinkReconcile: reconcileCaptureLink,
  askExtractionRequested: processAskExtractionRequestedEvent,
  radarNotificationMaterialize: processRadarNotificationMaterializeEvent,
  goalCandidateAttach: processGoalCandidateAttachEvent,
  captureNotification: processCaptureNotificationEvent,
};

function computeBackoffMinutes(attempts: number) {
  if (attempts <= 0) return 0;
  if (attempts === 1) return 1;
  if (attempts === 2) return 2;
  if (attempts === 3) return 5;
  if (attempts === 4) return 10;
  if (attempts === 5) return 30;
  return 60;
}

function mustHave<T>(v: T | null | undefined, msg: string): T {
  if (v === null || v === undefined) throw new Error(msg);
  return v;
}

function safeString(v: any) {
  if (v === null || v === undefined) return '';
  return String(v);
}

async function ensureNotificationForDomainEvent(
  args: {
    domainEventId: string;
    domainEventType: DomainEventType;
    userId: string;
    propertyId?: string | null;
    claimId: string;
    title: string;
    message: string;
    actionUrl?: string;
    deliveries: Array<'IN_APP' | 'EMAIL' | 'PUSH' | 'SMS'>;
    metadata?: any;
  },
  deps: ProcessDomainEventsDeps,
) {
  const {
    domainEventId,
    domainEventType,
    userId,
    propertyId,
    claimId,
    title,
    message,
    actionUrl,
    metadata,
  } = args;

  // Idempotency at notification creation level:
  // If the domain event is retried and we already created the notification, do nothing.
  // Postgres JSON path filter is supported by Prisma with path/equals.
  const existing = await deps.prisma.notification.findFirst({
    where: {
      userId,
      type: domainEventType,
      entityType: 'CLAIM',
      entityId: claimId,
      metadata: {
        path: ['domainEventId'],
        equals: domainEventId,
      },
    },
    select: { id: true },
  });

  if (existing) return existing;

  const notification = await deps.notificationService.create({
      userId,
      type: domainEventType,
      title,
      message,
      actionUrl: actionUrl ?? undefined,
      entityType: 'CLAIM',
      entityId: claimId,
      category: 'WORKFLOW',
      urgency: 'MATERIAL',
      metadata: {
        ...(metadata ?? {}),
        domainEventId,
        propertyId: propertyId ?? undefined,
        claimId,
      },
  });

  return notification;
}

async function handleClaimSubmitted(ev: any, deps: ProcessDomainEventsDeps) {
  const userId = ev.userId ?? ev.payload?.userId;
  const claimId = ev.payload?.claimId;
  const propertyId = ev.propertyId ?? ev.payload?.propertyId;

  mustHave(userId, 'DomainEvent missing userId');
  mustHave(claimId, 'DomainEvent payload missing claimId');

  const providerName = safeString(ev.payload?.providerName);
  const claimNumber = safeString(ev.payload?.claimNumber);

  const actionUrl = claimDetailUrl(propertyId, claimId);

  const title = 'Claim submitted';
  const message =
    providerName || claimNumber
      ? `Your claim was submitted${providerName ? ` to ${providerName}` : ''}${claimNumber ? ` (Claim #${claimNumber})` : ''}.`
      : 'Your claim was submitted.';

  // Choose channels.
  // V1 suggestion: IN_APP + EMAIL. Add PUSH/SMS later based on user prefs.
  await ensureNotificationForDomainEvent({
    domainEventId: ev.id,
    domainEventType: 'CLAIM_SUBMITTED',
    userId,
    propertyId,
    claimId,
    title,
    message,
    actionUrl,
    deliveries: ['IN_APP', 'EMAIL'],
    metadata: {
      submittedAt: ev.payload?.submittedAt,
      providerName: providerName || undefined,
      claimNumber: claimNumber || undefined,
      priority: 'HIGH',
    },
  }, deps);
}

async function handleClaimClosed(ev: any, deps: ProcessDomainEventsDeps) {
  const userId = ev.userId ?? ev.payload?.userId;
  const claimId = ev.payload?.claimId;
  const propertyId = ev.propertyId ?? ev.payload?.propertyId;

  mustHave(userId, 'DomainEvent missing userId');
  mustHave(claimId, 'DomainEvent payload missing claimId');

  const actionUrl = claimDetailUrl(propertyId, claimId);

  const title = 'Claim closed';
  const message = 'Your claim was closed.';

  await ensureNotificationForDomainEvent({
    domainEventId: ev.id,
    domainEventType: 'CLAIM_CLOSED',
    userId,
    propertyId,
    claimId,
    title,
    message,
    actionUrl,
    deliveries: ['IN_APP', 'EMAIL'],
    metadata: {
      closedAt: ev.payload?.closedAt,
      settlementAmount: ev.payload?.settlementAmount,
      finalStatus: ev.payload?.status,
      priority: 'HIGH',
    },
  }, deps);
}

async function handleRefinanceTransition(
  ev: any,
  expectedTransition: 'OPEN' | 'UPDATE' | 'CLOSED',
  deps: ProcessDomainEventsDeps,
) {
  const propertyId = ev.propertyId ?? ev.payload?.propertyId;
  const snapshotId = ev.payload?.snapshotId;
  const transitionType = ev.payload?.transitionType;

  mustHave(propertyId, 'Refinance DomainEvent missing propertyId');
  mustHave(snapshotId, 'Refinance DomainEvent payload missing snapshotId');
  if (transitionType !== expectedTransition) {
    throw new Error(
      `Refinance DomainEvent transition mismatch: expected ${expectedTransition}, received ${safeString(transitionType) || 'missing'}`,
    );
  }

  // CLOSED updates the canonical Home projection silently. OPEN and material
  // UPDATE transitions may enter the separately gated external-alert policy.
  if (expectedTransition !== 'CLOSED' && deps.refinanceTransitionAlert) {
    return deps.refinanceTransitionAlert({
      domainEventId: ev.id,
      propertyId,
      snapshotId,
      transitionType: expectedTransition as RefinanceAlertTransition,
      materialChangeReasons: Array.isArray(ev.payload?.materialChangeReasons)
        ? ev.payload.materialChangeReasons
        : [],
    });
  }
  return null;
}

function handleRefinanceDataRequired(ev: any) {
  const propertyId = ev.propertyId ?? ev.payload?.propertyId;
  const snapshotId = ev.payload?.snapshotId;
  const missingFields = ev.payload?.missingFields;

  mustHave(propertyId, 'Refinance DATA_REQUIRED event missing propertyId');
  mustHave(snapshotId, 'Refinance DATA_REQUIRED payload missing snapshotId');
  if (!Array.isArray(missingFields) || missingFields.length === 0) {
    throw new Error('Refinance DATA_REQUIRED payload missing missingFields');
  }
  // The durable event is projected into the canonical Home action feed.
  // External delivery remains intentionally disabled.
}

function handleRecomputeRequested(ev: any, deps: ProcessDomainEventsDeps) {
  const propertyId = ev.propertyId ?? ev.payload?.propertyId;
  const triggerType = ev.payload?.triggerType;
  const triggerEntityType = ev.payload?.triggerEntityType;
  const triggerEntityId = ev.payload?.triggerEntityId;
  const changedFactKeys = Array.isArray(ev.payload?.changedFactKeys) ? ev.payload.changedFactKeys : [];
  const changedReferences = Array.isArray(ev.payload?.changedReferences) ? ev.payload.changedReferences : [];
  const idempotencyKey = ev.payload?.idempotencyKey ?? ev.idempotencyKey;

  mustHave(propertyId, 'Recompute REQUESTED event missing propertyId');
  mustHave(triggerType, 'Recompute REQUESTED event missing triggerType');
  mustHave(triggerEntityType, 'Recompute REQUESTED event missing triggerEntityType');
  mustHave(triggerEntityId, 'Recompute REQUESTED event missing triggerEntityId');
  mustHave(idempotencyKey, 'Recompute REQUESTED event missing idempotencyKey');

  return (deps.recomputeRequested ?? processRecomputeRequestedEvent)(deps.prisma as any, {
    propertyId,
    triggerType,
    triggerEntityType,
    triggerEntityId,
    changedFactKeys,
    changedReferences,
    sourceHealth: ev.payload?.sourceHealth ?? null,
    requestedContextVersion: ev.payload?.requestedContextVersion ?? null,
    idempotencyKey,
  });
}

function handleRecomputeRetryRequested(ev: any, deps: ProcessDomainEventsDeps) {
  const recomputeRunId = ev.payload?.recomputeRunId;
  const targetId = ev.payload?.targetId;

  mustHave(recomputeRunId, 'Recompute RETRY_REQUESTED event missing recomputeRunId');
  mustHave(targetId, 'Recompute RETRY_REQUESTED event missing targetId');

  return (deps.recomputeRetryRequested ?? processRecomputeRetryRequestedEvent)(deps.prisma as any, {
    recomputeRunId,
    targetId,
  });
}

// Ask Cozy Stage 3, Phase 2 (implementation plan §8/§20; FRD §22). No real
// emitter yet (nothing creates a linked capture pair before Phase 3's
// warranty-capture work, which hasn't started) -- reconcileCaptureLink is
// itself a no-op whenever an execution has no linkedExecutionId or either
// side hasn't completed, so this consumer is safe to register ahead of any
// producer, matching the claim-token utility's own "buildable and testable
// synthetically" precedent.
function handleAskCaptureLinkReconcile(ev: any, deps: ProcessDomainEventsDeps) {
  const executionId = ev.payload?.executionId;
  mustHave(executionId, 'ASK_CAPTURE_LINK_RECONCILE event missing executionId');
  return (deps.captureLinkReconcile ?? reconcileCaptureLink)(executionId);
}

// Ask Cozy Stage 3, Phase 3 (implementation plan §9/§21; FRD §9/§14/§22's
// async-fallback path). The common case (extraction finishes within its
// ~1.5s inline budget, or shortly after in the background -- JS has no true
// promise cancellation) never reaches this consumer at all; this only fires
// when the backend process that started an attempt crashed/restarted before
// it could finish, so this event's lease genuinely expired. `ev` here is the
// PRE-claim row this loop read before its own updateMany above incremented
// attempts -- ev.attempts + 1 is this worker's own post-claim value, the
// same "claimedAttempts" contract domainEventClaimToken.ts documents.
// conversationalCapture.ts's own transaction re-verifies that value before
// persisting anything, so a nested race (this worker's own attempt somehow
// outlives its 15-minute lease and gets reclaimed by a third attempt) fails
// safely via that same check rather than double-writing -- rare enough
// (needs a >15-minute extraction call) not to warrant its own error class
// here.
function handleAskExtractionRequested(ev: any, deps: ProcessDomainEventsDeps) {
  return (deps.askExtractionRequested ?? processAskExtractionRequestedEvent)(
    { id: ev.id, propertyId: ev.propertyId ?? null, userId: ev.userId ?? null, payload: ev.payload },
    (ev.attempts ?? 0) + 1,
  );
}

// Ask Cozy Stage 3, Phase 5 (FRD §29/§31: Home Event Radar's direct
// Notification write migrated onto this rail -- see
// radarNotificationMaterializationReconciliation.service.ts's own header
// comment for the full rationale). materialize() is itself idempotent
// (dedup via the decision's own notificationId / the deterministic
// deduplicationKey), so an at-least-once redelivery of this event is safe.
function handleRadarNotificationMaterialize(ev: any, deps: ProcessDomainEventsDeps) {
  return (deps.radarNotificationMaterialize ?? processRadarNotificationMaterializeEvent)({
    id: ev.id,
    propertyId: ev.propertyId ?? null,
    payload: ev.payload,
  });
}

// Ask Cozy Stage 3, Phase 6 review [P2] (FRD §21): goal-candidate
// attachment (a DecisionThread create/resume + child AskExecution) is now
// its own durable, retryable DomainEvent instead of best-effort work run
// after the triggering ASK_EXTRACTION_REQUESTED event was already marked
// PROCESSED -- see conversationalCapture.ts's processGoalCandidateAttachEvent
// header comment for the full rationale. Self-completing (marks its own
// event PROCESSED on success), same shape as ASK_EXTRACTION_REQUESTED's own
// handler -- this file's own generic completion write below is guarded on
// status still being PROCESSING, so it naturally no-ops here too.
function handleGoalCandidateAttach(ev: any, deps: ProcessDomainEventsDeps) {
  return (deps.goalCandidateAttach ?? processGoalCandidateAttachEvent)(
    { id: ev.id, payload: ev.payload },
    (ev.attempts ?? 0) + 1,
  );
}

// External review, 2026-09-14 (FRD §10/§29): the proactive notification
// pointing a homeowner at their pending capture-confirmation candidates is
// now its own durable, retryable DomainEvent instead of a plain call made
// after the triggering ASK_EXTRACTION_REQUESTED event was already marked
// PROCESSED -- see conversationalCapture.ts's processCaptureNotificationEvent
// header comment for the full rationale. Self-completing (marks its own
// event PROCESSED only on a real successful send), same shape as
// ASK_GOAL_CANDIDATE_ATTACH_REQUESTED's own handler above -- this file's own
// generic completion write below is guarded on status still being
// PROCESSING, so it naturally no-ops here too.
function handleCaptureNotification(ev: any, deps: ProcessDomainEventsDeps) {
  return (deps.captureNotification ?? processCaptureNotificationEvent)(
    { id: ev.id, payload: ev.payload },
    (ev.attempts ?? 0) + 1,
  );
}

/**
 * Poll + process a batch of DomainEvent rows.
 * Safe for multiple replicas via PROCESSING "lock".
 */
export async function processDomainEventsJob(
  opts?: { batchSize?: number },
  deps: ProcessDomainEventsDeps = defaultDeps,
) {
  const { prisma } = deps;
  const batchSize = opts?.batchSize ?? 25;

  const now = new Date();
  const pending = await prisma.domainEvent.findMany({
    where: {
      OR: [
        { status: 'PENDING' as DomainEventStatus, availableAt: { lte: now } },
        { status: 'FAILED' as DomainEventStatus, availableAt: { lte: now } },
        { status: 'PROCESSING' as DomainEventStatus, leaseExpiresAt: { lte: now } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });

  if (pending.length === 0) return { processed: 0 };

  let processed = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const ev of pending) {
    // The database predicate is authoritative, but retain a defensive
    // eligibility check for an event returned by a lagging replica/read or
    // an older row that predates availableAt.
    const eligibleAt = ev.availableAt instanceof Date
      ? ev.availableAt
      : ev.status === 'FAILED' && ev.updatedAt instanceof Date
        ? new Date(ev.updatedAt.getTime() + computeBackoffMinutes(ev.attempts ?? 0) * 60_000)
        : null;
    if (eligibleAt && eligibleAt > now) continue;

    // Acquire or reclaim the durable lease. A worker crash cannot strand a
    // PROCESSING event because the expired lease makes it eligible again.
    const claimedAt = new Date();
    const locked = await prisma.domainEvent.updateMany({
      where: {
        id: ev.id,
        status: ev.status as DomainEventStatus,
        ...(ev.status === 'PROCESSING'
          ? { leaseExpiresAt: { lte: claimedAt } }
          : { availableAt: { lte: claimedAt } }),
      },
      data: {
        status: 'PROCESSING' as DomainEventStatus,
        attempts: { increment: 1 },
        lastError: null,
        processingStartedAt: claimedAt,
        leaseExpiresAt: new Date(claimedAt.getTime() + DOMAIN_EVENT_LEASE_MS),
      },
    });
    if (locked.count !== 1) continue;

    // Long fan-out recomputes can exceed the initial lease. Renew it while
    // this worker is alive so another replica cannot reclaim the same event
    // and overlap target processing. A crash stops the heartbeat naturally;
    // the last lease then expires and makes the event recoverable.
    const leaseHeartbeat = setInterval(() => {
      void prisma.domainEvent.updateMany({
        where: { id: ev.id, status: 'PROCESSING' as DomainEventStatus },
        data: { leaseExpiresAt: new Date(Date.now() + DOMAIN_EVENT_LEASE_MS) },
      }).catch(() => undefined);
    }, Math.floor(DOMAIN_EVENT_LEASE_MS / 3));

    try {
      const type = ev.type as DomainEventType;

      let processingOutcome: unknown = null;
      switch (type) {
        case 'CLAIM_SUBMITTED':
          await handleClaimSubmitted(ev, deps);
          break;
        case 'CLAIM_CLOSED':
          await handleClaimClosed(ev, deps);
          break;
        case 'REFINANCE_OPPORTUNITY_OPENED':
          processingOutcome = await handleRefinanceTransition(ev, 'OPEN', deps);
          break;
        case 'REFINANCE_OPPORTUNITY_UPDATED':
          processingOutcome = await handleRefinanceTransition(ev, 'UPDATE', deps);
          break;
        case 'REFINANCE_OPPORTUNITY_CLOSED':
          processingOutcome = await handleRefinanceTransition(ev, 'CLOSED', deps);
          break;
        case 'REFINANCE_DATA_REQUIRED':
          handleRefinanceDataRequired(ev);
          break;
        case 'REFINANCE_DECISION_RECORDED':
        case 'REFINANCE_DECISION_CHANGED':
        case 'REFINANCE_NEXT_STEP_STARTED':
        case 'REFINANCE_OUTCOME_COMPLETED':
          // Durable internal lifecycle signals. They feed Home/analytics and
          // deliberately do not contact lenders or trigger external delivery.
          break;
        case 'RADAR_PROPERTY_RECONCILIATION_REQUESTED':
          processingOutcome = await (
            deps.radarPropertyReconciliation
            ?? processRadarPropertyReconciliationEvent
          )(ev);
          break;
        case 'PROPERTY_INTELLIGENCE_RECOMPUTE_REQUESTED':
          processingOutcome = await handleRecomputeRequested(ev, deps);
          break;
        case 'PROPERTY_INTELLIGENCE_RECOMPUTE_RETRY_REQUESTED':
          processingOutcome = await handleRecomputeRetryRequested(ev, deps);
          break;
        case 'ASK_CAPTURE_LINK_RECONCILE':
          await handleAskCaptureLinkReconcile(ev, deps);
          break;
        case 'ASK_EXTRACTION_REQUESTED':
          processingOutcome = await handleAskExtractionRequested(ev, deps);
          break;
        case 'RADAR_NOTIFICATION_MATERIALIZE_REQUESTED':
          processingOutcome = await handleRadarNotificationMaterialize(ev, deps);
          break;
        case 'ASK_GOAL_CANDIDATE_ATTACH_REQUESTED':
          processingOutcome = await handleGoalCandidateAttach(ev, deps);
          break;
        case 'ASK_CAPTURE_NOTIFICATION_REQUESTED':
          await handleCaptureNotification(ev, deps);
          break;
        default:
          throw new Error(`Unhandled DomainEvent type: ${type}`);
      }

      // Code review finding (2026-09-13): this used to be an unconditional
      // update -- for ASK_EXTRACTION_REQUESTED, whose handler
      // (handleAskExtractionRequested -> persistCandidates) already commits
      // its candidates AND marks this event PROCESSED atomically inside its
      // OWN transaction, this write is redundant by design (see
      // conversationalCapture.ts). If this redundant write then failed for
      // any reason (a transient DB blip), the thrown error fell into the
      // catch block below, which used to unconditionally flip the row's
      // status to FAILED/DEAD_LETTER -- discarding a genuinely successful,
      // already-durably-committed extraction and letting the poller
      // reprocess it. Guarded on status still being PROCESSING: for every
      // OTHER event type (none of which self-complete), the row IS still
      // PROCESSING here, so this proceeds exactly as before; for
      // ASK_EXTRACTION_REQUESTED, the row is already PROCESSED by the time
      // we reach this line, so the guard naturally no-ops instead of
      // re-writing (and potentially clobbering) what the handler already
      // committed.
      await prisma.domainEvent.updateMany({
        where: { id: ev.id, status: 'PROCESSING' as DomainEventStatus },
        data: {
          status: 'PROCESSED' as DomainEventStatus,
          processedAt: new Date(),
          lastError: null,
          processingStartedAt: null,
          leaseExpiresAt: null,
          ...(processingOutcome
            ? {
                payload: {
                  ...(ev.payload && typeof ev.payload === 'object'
                    ? ev.payload
                    : {}),
                  processingOutcome,
                },
              }
            : {}),
        },
      });

      processed += 1;
    } catch (err: any) {
      const msg = err?.message ? String(err.message) : 'Unknown error';
      const nextAttempts = (ev.attempts ?? 0) + 1;
      const terminalStatus: DomainEventStatus =
        nextAttempts >= MAX_DOMAIN_EVENT_ATTEMPTS ? 'DEAD_LETTER' : 'FAILED';
      const availableAt = terminalStatus === 'FAILED'
        ? new Date(Date.now() + computeBackoffMinutes(nextAttempts) * 60_000)
        : new Date();
      // Code review finding (2026-09-13): fenced on both status still being
      // PROCESSING and attempts still matching this iteration's own claimed
      // value (nextAttempts, the value this loop's own claim above set).
      // Without the status condition, a handler whose OWN transaction had
      // already committed the row to PROCESSED (ASK_EXTRACTION_REQUESTED)
      // but then failed on this file's own redundant follow-up write would
      // have this catch block flip a genuinely successful, already-durable
      // result back to FAILED/DEAD_LETTER. Without the attempts condition,
      // a handler that is merely slow -- past its own lease's expiry, with
      // a later attempt having already reclaimed and possibly completed the
      // row -- would let this stale attempt's failure incorrectly overwrite
      // that later attempt's state. Either guard failing to match means
      // this specific attempt's failure is stale and must not be recorded.
      const failureWrite = await prisma.domainEvent.updateMany({
        where: { id: ev.id, status: 'PROCESSING' as DomainEventStatus, attempts: nextAttempts },
        data: {
          status: terminalStatus,
          lastError: msg.slice(0, 2000),
          availableAt,
          processingStartedAt: null,
          leaseExpiresAt: null,
        },
      });
      if (failureWrite.count === 1) {
        if (terminalStatus === 'DEAD_LETTER') deadLettered += 1;
        else failed += 1;
      }
    } finally {
      clearInterval(leaseHeartbeat);
    }
  }

  return { processed, failed, deadLettered };
}
