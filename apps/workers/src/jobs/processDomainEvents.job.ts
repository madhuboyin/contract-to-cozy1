import { prisma } from '../lib/prisma';

type DomainEventStatus = 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED';
type DomainEventType = 'CLAIM_SUBMITTED' | 'CLAIM_CLOSED' | 'FOLLOW_UP_DUE';

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

function buildClaimActionUrl(propertyId?: string | null, claimId?: string | null) {
  if (!propertyId || !claimId) return undefined;
  // Adjust to your frontend route if different
  return `/dashboard/properties/${propertyId}/claims/${claimId}`;
}

async function ensureNotificationForDomainEvent(args: {
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
}) {
  const {
    domainEventId,
    domainEventType,
    userId,
    propertyId,
    claimId,
    title,
    message,
    actionUrl,
    deliveries,
    metadata,
  } = args;

  // Idempotency at notification creation level:
  // If the domain event is retried and we already created the notification, do nothing.
  // Postgres JSON path filter is supported by Prisma with path/equals.
  const existing = await prisma.notification.findFirst({
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

  const notification = await prisma.notification.create({
    data: {
      userId,
      type: domainEventType,
      title,
      message,
      actionUrl: actionUrl ?? null,
      entityType: 'CLAIM',
      entityId: claimId,
      metadata: {
        ...(metadata ?? {}),
        domainEventId,
        propertyId: propertyId ?? undefined,
        claimId,
      },
      deliveries: {
        create: deliveries.map((ch) => ({
          channel: ch as any, // NotificationChannel enum
          status: 'PENDING',
        })),
      },
    },
    select: { id: true },
  });

  return notification;
}

async function handleClaimSubmitted(ev: any) {
  const userId = ev.userId ?? ev.payload?.userId;
  const claimId = ev.payload?.claimId;
  const propertyId = ev.propertyId ?? ev.payload?.propertyId;

  mustHave(userId, 'DomainEvent missing userId');
  mustHave(claimId, 'DomainEvent payload missing claimId');

  const providerName = safeString(ev.payload?.providerName);
  const claimNumber = safeString(ev.payload?.claimNumber);

  const actionUrl = buildClaimActionUrl(propertyId, claimId);

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
  });
}

async function handleClaimClosed(ev: any) {
  const userId = ev.userId ?? ev.payload?.userId;
  const claimId = ev.payload?.claimId;
  const propertyId = ev.propertyId ?? ev.payload?.propertyId;

  mustHave(userId, 'DomainEvent missing userId');
  mustHave(claimId, 'DomainEvent payload missing claimId');

  const actionUrl = buildClaimActionUrl(propertyId, claimId);

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
  });
}

/**
 * Poll + process a batch of DomainEvent rows.
 * Safe for multiple replicas via PROCESSING "lock".
 */
export async function processDomainEventsJob(opts?: { batchSize?: number }) {
  const batchSize = opts?.batchSize ?? 25;

  // @ts-ignore - Model exists in schema but may not be in generated client
  const pending = await (prisma as any).domainEvent.findMany({
    where: {
      OR: [{ status: 'PENDING' as DomainEventStatus }, { status: 'FAILED' as DomainEventStatus }],
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });

  if (pending.length === 0) return { processed: 0 };

  let processed = 0;

  for (const ev of pending) {
    if (ev.status === 'FAILED') {
      const waitMins = computeBackoffMinutes(ev.attempts ?? 0);
      const eligibleAfter = nowMinusMinutes(waitMins);
      if (ev.updatedAt > eligibleAfter) continue;
    }

    // Acquire lock
    // @ts-ignore - Model exists in schema but may not be in generated client
    const locked = await (prisma as any).domainEvent.updateMany({
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

      switch (type) {
        case 'CLAIM_SUBMITTED':
          await handleClaimSubmitted(ev);
          break;
        case 'CLAIM_CLOSED':
          await handleClaimClosed(ev);
          break;
        default:
          throw new Error(`Unhandled DomainEvent type: ${type}`);
      }

      // @ts-ignore - Model exists in schema but may not be in generated client
      await (prisma as any).domainEvent.update({
        where: { id: ev.id },
        data: {
          status: 'PROCESSED' as DomainEventStatus,
          processedAt: new Date(),
          lastError: null,
        },
      });

      processed += 1;
    } catch (err: any) {
      const msg = err?.message ? String(err.message) : 'Unknown error';
      // @ts-ignore - Model exists in schema but may not be in generated client
      await (prisma as any).domainEvent.update({
        where: { id: ev.id },
        data: {
          status: 'FAILED' as DomainEventStatus,
          lastError: msg.slice(0, 2000),
        },
      });
    }
  }

  return { processed };
}

async function getEmailEnabled(userId: string): Promise<boolean> {
  const homeownerProfile = await prisma.homeownerProfile.findFirst({
    where: { userId },
    select: { notificationPreferences: true },
  });

  const preferences = homeownerProfile?.notificationPreferences as { emailEnabled?: boolean } | null;
  return preferences?.emailEnabled !== false;
}