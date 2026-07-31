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

type DomainEventStatus = 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'DEAD_LETTER';
type DomainEventType =
  | 'CLAIM_SUBMITTED'
  | 'CLAIM_CLOSED'
  | 'FOLLOW_UP_DUE'
  | 'REFINANCE_OPPORTUNITY_OPENED'
  | 'REFINANCE_OPPORTUNITY_UPDATED'
  | 'REFINANCE_OPPORTUNITY_CLOSED'
  | 'REFINANCE_DATA_REQUIRED'
  | 'REFINANCE_DECISION_RECORDED'
  | 'REFINANCE_DECISION_CHANGED'
  | 'REFINANCE_NEXT_STEP_STARTED'
  | 'REFINANCE_OUTCOME_COMPLETED'
  | 'RADAR_PROPERTY_RECONCILIATION_REQUESTED';

export const MAX_DOMAIN_EVENT_ATTEMPTS = 8;

// W4 item 1: small, job-scoped dependency interface (see
// reserveFundBalanceReminder.job.ts for the pattern).
export interface ProcessDomainEventsDeps {
  prisma: Pick<typeof prisma, 'notification' | 'domainEvent'>;
  notificationService: Pick<typeof NotificationService, 'create'>;
  refinanceTransitionAlert?: typeof processRefinanceTransitionAlert;
  radarPropertyReconciliation?: typeof processRadarPropertyReconciliationEvent;
}

const defaultDeps: ProcessDomainEventsDeps = {
  prisma,
  notificationService: NotificationService,
  refinanceTransitionAlert: processRefinanceTransitionAlert,
  radarPropertyReconciliation: processRadarPropertyReconciliationEvent,
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

function nowMinusMinutes(mins: number) {
  return new Date(Date.now() - mins * 60 * 1000);
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

  const pending = await prisma.domainEvent.findMany({
    where: {
      OR: [{ status: 'PENDING' as DomainEventStatus }, { status: 'FAILED' as DomainEventStatus }],
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });

  if (pending.length === 0) return { processed: 0 };

  let processed = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const ev of pending) {
    if (ev.status === 'FAILED') {
      const waitMins = computeBackoffMinutes(ev.attempts ?? 0);
      const eligibleAfter = nowMinusMinutes(waitMins);
      if (ev.updatedAt > eligibleAfter) continue;
    }

    // Acquire lock
    const locked = await prisma.domainEvent.updateMany({
      where: { id: ev.id, status: ev.status as DomainEventStatus },
      data: {
        status: 'PROCESSING' as DomainEventStatus,
        attempts: { increment: 1 },
        lastError: null,
      },
    });
    if (locked.count !== 1) continue;

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
        default:
          throw new Error(`Unhandled DomainEvent type: ${type}`);
      }

      await prisma.domainEvent.update({
        where: { id: ev.id },
        data: {
          status: 'PROCESSED' as DomainEventStatus,
          processedAt: new Date(),
          lastError: null,
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
      await prisma.domainEvent.update({
        where: { id: ev.id },
        data: {
          status: terminalStatus,
          lastError: msg.slice(0, 2000),
        },
      });
      if (terminalStatus === 'DEAD_LETTER') deadLettered += 1;
      else failed += 1;
    }
  }

  return { processed, failed, deadLettered };
}
