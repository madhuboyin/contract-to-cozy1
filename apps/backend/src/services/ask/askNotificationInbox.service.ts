import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { resolvePropertyAccess } from '../propertyAccess.service';
import { NotificationCategorySchema, type NotificationCategory, type NotificationUrgency, NOTIFICATION_CATEGORIES } from '../../productFramework/notificationPolicy.contract';
import { inferNotificationCategory, inferNotificationUrgency, notificationPreferenceCategories, recordNotificationOutcome } from '../notificationPreference.service';
import type { AskAccountRole } from './askAccountEligibility';
import { ensureAskServiceAccountEligibility } from './support/propertyContext';
import { NOTIFICATION_HIDING_OUTCOMES } from './support/notificationConversation';
import { askHistoryAccessiblePropertyWhere } from './askSessionHistoryPagination';
import { continuationRuleFor, type NotificationForContinuation } from './governance/askNotificationContinuationRegistry';
import {
  ASK_NOTIFICATION_CONTRACT_VERSION, ASK_NOTIFICATION_DEFAULT_LIMIT, ASK_NOTIFICATION_MAX_LIMIT, NOTIFICATION_CATEGORY_LABELS, NOTIFICATION_WHY,
  type AskNotificationItem, type AskNotificationOpenResult, type AskNotificationPage,
} from './askNotification.contract';

export class AskNotificationInvalidRequestError extends Error {
  code = 'ASK_INVALID_REQUEST';
}
export class AskNotificationNotFoundError extends Error {
  code = 'ASK_NOTIFICATION_NOT_FOUND';
}

export interface AskNotificationQuery {
  view?: string | null;
  cursor?: string | null;
  limit?: number | null;
  unreadOnly?: boolean | null;
  category?: string | null;
  propertyId?: string | null;
}

const CursorSchema = z.object({ v: z.enum(['INBOX', 'DISMISSED']), t: z.string().min(1).max(40), i: z.string().min(1).max(80) });
const asRecord = (value: unknown): Record<string, unknown> | null => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null);

export function notificationCategoryOf(type: string, metadata: Record<string, unknown> | null): NotificationCategory {
  const stored = NotificationCategorySchema.safeParse(asRecord(metadata?.notificationPolicy)?.category);
  return stored.success ? stored.data : inferNotificationCategory(type);
}

function notificationUrgencyOf(type: string, metadata: Record<string, unknown> | null): NotificationUrgency {
  const stored = asRecord(metadata?.notificationPolicy)?.urgency;
  return stored === 'ROUTINE' || stored === 'MATERIAL' || stored === 'URGENT' || stored === 'CRITICAL' ? stored : inferNotificationUrgency(type, metadata ?? undefined);
}

function expiryOf(metadata: Record<string, unknown> | null): Date | null {
  const raw = metadata?.expiresAt;
  if (typeof raw !== 'string') return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const propertyLabelOf = (property: { name: string | null; address: string | null; city: string | null }): string => property.name?.trim() || [property.address, property.city].filter(Boolean).join(', ') || 'Home';

/**
 * The unified homeowner inbox (FR-NOTIF-001): the person's own notifications, newest first and keyset-paged, each naming its home,
 * category, why it appeared, when, any expiry the producer stated, and where opening it leads. Reads only; the continuation itself is
 * resolved against live records when an item is opened.
 */
export async function listAskNotifications(userId: string, query: AskNotificationQuery, accountRole?: AskAccountRole, now: Date = new Date()): Promise<AskNotificationPage> {
  await ensureAskServiceAccountEligibility(userId, accountRole);
  const view = query.view === 'DISMISSED' ? 'DISMISSED' : 'INBOX';
  if (query.view && query.view !== 'INBOX' && query.view !== 'DISMISSED') throw new AskNotificationInvalidRequestError('view is not valid.');
  const limit = Math.min(query.limit == null ? ASK_NOTIFICATION_DEFAULT_LIMIT : query.limit, ASK_NOTIFICATION_MAX_LIMIT);
  if (!Number.isInteger(limit) || limit < 1) throw new AskNotificationInvalidRequestError('limit must be a positive integer.');
  const category = query.category ? NotificationCategorySchema.safeParse(query.category) : null;
  if (category && !category.success) throw new AskNotificationInvalidRequestError('category is not valid.');
  let after: { t: Date; i: string } | null = null;
  if (query.cursor) {
    try {
      const parsed = CursorSchema.parse(JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')));
      if (parsed.v !== view) throw new Error('cursor view mismatch');
      after = { t: new Date(parsed.t), i: parsed.i };
    } catch {
      throw new AskNotificationInvalidRequestError('cursor is not valid.');
    }
  }
  // As on the Notifications page, a notification the person marked not relevant or already handled is set aside from the inbox; the "dismissed" view is where
  // everything the person put away lives (dismissed, or set aside by feedback), so each can be brought back.
  const hidingOutcome = { type: { in: [...NOTIFICATION_HIDING_OUTCOMES] as Array<'NOT_RELEVANT' | 'ALREADY_HANDLED'> } };
  const putAway: Prisma.NotificationWhereInput = { OR: [{ dismissedAt: { not: null } }, { outcomes: { some: { userId, ...hidingOutcome } } }] };
  const filters: Prisma.NotificationWhereInput[] = [{ userId }, view === 'DISMISSED' ? putAway : { dismissedAt: null, outcomes: { none: { userId, ...hidingOutcome } } }];
  if (query.unreadOnly) filters.push({ isRead: false });
  if (category?.success) filters.push({ metadata: { path: ['notificationPolicy', 'category'], equals: category.data } });
  if (query.propertyId) filters.push({ metadata: { path: ['propertyId'], equals: query.propertyId } });
  const inView: Prisma.NotificationWhereInput = { AND: filters };
  const paged: Prisma.NotificationWhereInput = after ? { AND: [inView, { OR: [{ createdAt: { lt: after.t } }, { createdAt: after.t, id: { gt: after.i } }] }] } : inView;

  const [rows, total, unreadCount, dismissedCount, accessible, preferences] = await Promise.all([
    prisma.notification.findMany({
      where: paged, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: limit + 1,
      select: { id: true, type: true, title: true, message: true, entityType: true, entityId: true, actionUrl: true, isRead: true, dismissedAt: true, metadata: true, createdAt: true, outcomes: { where: { userId, type: { in: ['USEFUL', 'NOT_RELEVANT', 'ALREADY_HANDLED'] } }, select: { type: true } } },
    }),
    prisma.notification.count({ where: inView }),
    prisma.notification.count({ where: { userId, isRead: false, dismissedAt: null, outcomes: { none: { userId, ...hidingOutcome } } } }),
    prisma.notification.count({ where: { userId, ...putAway } }),
    prisma.property.findMany({ where: askHistoryAccessiblePropertyWhere(userId), select: { id: true, name: true, address: true, city: true } }),
    prisma.notificationPreference.findMany({ where: { userId, channel: 'EMAIL' }, select: { category: true, cadence: true, enabled: true, snoozedUntil: true } }),
  ]);
  const properties = new Map(accessible.map((property) => [property.id, propertyLabelOf(property)]));
  const paused = new Map<string, 'MUTED' | 'SNOOZED'>();
  for (const preference of preferences) {
    if (preference.snoozedUntil && preference.snoozedUntil > now) paused.set(preference.category, 'SNOOZED');
    else if (preference.cadence === 'MUTED' || !preference.enabled) paused.set(preference.category, 'MUTED');
  }
  const pauseFor = (cat: NotificationCategory) => notificationPreferenceCategories(cat).map((candidate) => paused.get(candidate)).find(Boolean) ?? null;

  const page = rows.slice(0, limit);
  const items = page.map((row): AskNotificationItem => {
    const metadata = asRecord(row.metadata);
    const cat = notificationCategoryOf(row.type, metadata);
    const propertyId = typeof metadata?.propertyId === 'string' && metadata.propertyId ? metadata.propertyId : null;
    const expires = expiryOf(metadata);
    const rule = continuationRuleFor({ id: row.id, userId, type: row.type, entityType: row.entityType, entityId: row.entityId, actionUrl: row.actionUrl, metadata });
    return {
      id: row.id, type: row.type, category: cat, categoryLabel: NOTIFICATION_CATEGORY_LABELS[cat], urgency: notificationUrgencyOf(row.type, metadata), title: row.title, message: row.message,
      whyItAppeared: NOTIFICATION_WHY[cat], propertyId, propertyLabel: propertyId ? properties.get(propertyId) ?? null : null,
      propertyAccess: !propertyId ? 'NONE' : properties.has(propertyId) ? 'ACCESSIBLE' : 'LOST',
      createdAt: row.createdAt.toISOString(), expiresAt: expires?.toISOString() ?? null, expired: expires !== null && expires <= now, isRead: row.isRead, dismissed: row.dismissedAt !== null, markedUseful: row.outcomes.some((outcome) => outcome.type === 'USEFUL'), hiddenBy: (row.outcomes.find((outcome) => outcome.type === 'NOT_RELEVANT' || outcome.type === 'ALREADY_HANDLED')?.type as 'NOT_RELEVANT' | 'ALREADY_HANDLED' | undefined) ?? null,
      continuationKind: rule.kind, deliveryPaused: pauseFor(cat),
    };
  });
  const last = page[page.length - 1];
  const hasMore = rows.length > limit;
  return {
    contractVersion: ASK_NOTIFICATION_CONTRACT_VERSION, generatedAt: now.toISOString(), view, total, unreadCount, dismissedCount,
    nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ v: view, t: last.createdAt.toISOString(), i: last.id }), 'utf8').toString('base64url') : null,
    truncated: hasMore,
    query: { unreadOnly: Boolean(query.unreadOnly), category: category?.success ? category.data : null, propertyId: query.propertyId ?? null },
    filterOptions: {
      categories: NOTIFICATION_CATEGORIES.filter((value) => value !== 'ALL').map((value) => ({ value, label: NOTIFICATION_CATEGORY_LABELS[value] })),
      properties: accessible.map((property) => ({ value: property.id, label: propertyLabelOf(property) })),
    },
    items,
  };
}

/**
 * Opens a notification (FR-NOTIF-002): rereads the live record it is about and reauthorizes the home first. A home the person no longer
 * has access to is ACCESS_LOST, a removed target is DELETED, and a notification with nothing to open says so. Opening marks it read and
 * records that it was opened; it never replays the notification's own text.
 */
export async function openAskNotification(userId: string, notificationId: string, accountRole?: AskAccountRole): Promise<AskNotificationOpenResult> {
  await ensureAskServiceAccountEligibility(userId, accountRole);
  const row = await prisma.notification.findFirst({ where: { id: notificationId, userId }, select: { id: true, type: true, entityType: true, entityId: true, actionUrl: true, metadata: true } });
  if (!row) throw new AskNotificationNotFoundError('Notification not found.');
  const notification: NotificationForContinuation = { id: row.id, userId, type: row.type, entityType: row.entityType, entityId: row.entityId, actionUrl: row.actionUrl, metadata: asRecord(row.metadata) };
  const base = { contractVersion: ASK_NOTIFICATION_CONTRACT_VERSION, notificationId, destination: null, legacy: false } as const;
  const resolution = await continuationRuleFor(notification).resolve(notification);
  const propertyId = resolution.propertyId;
  if (propertyId && !(await resolvePropertyAccess(userId, propertyId))) {
    return { ...base, outcome: 'ACCESS_LOST', propertyId: null, message: 'You no longer have access to the home this is about.' };
  }
  if (resolution.state === 'MISSING') return { ...base, outcome: 'DELETED', propertyId, message: 'What this was about has been removed, so there is nothing to open.' };
  if (resolution.state === 'NO_TARGET') return { ...base, outcome: 'UNAVAILABLE', propertyId, message: resolution.reason };
  await prisma.notification.updateMany({ where: { id: notificationId, userId, isRead: false }, data: { isRead: true, readAt: new Date() } });
  await recordNotificationOutcome(userId, notificationId, 'OPENED');
  return { ...base, outcome: 'AVAILABLE', destination: resolution.destination, propertyId, legacy: resolution.destination.kind === 'LEGACY_LINK', message: 'Ready to open.' };
}

/** Hides a notification from the inbox (or brings it back). Presentation only: the notification, its deliveries and its audit trail are untouched. */
export async function setAskNotificationDismissed(userId: string, notificationId: string, dismissed: boolean, accountRole?: AskAccountRole): Promise<{ id: string; dismissed: boolean }> {
  await ensureAskServiceAccountEligibility(userId, accountRole);
  const updated = await prisma.notification.updateMany({ where: { id: notificationId, userId }, data: { dismissedAt: dismissed ? new Date() : null } });
  if (updated.count !== 1) throw new AskNotificationNotFoundError('Notification not found.');
  return { id: notificationId, dismissed };
}

export async function setAskNotificationRead(userId: string, notificationId: string, isRead: boolean, accountRole?: AskAccountRole): Promise<{ id: string; isRead: boolean }> {
  await ensureAskServiceAccountEligibility(userId, accountRole);
  const updated = await prisma.notification.updateMany({ where: { id: notificationId, userId }, data: { isRead, readAt: isRead ? new Date() : null } });
  if (updated.count !== 1) throw new AskNotificationNotFoundError('Notification not found.');
  return { id: notificationId, isRead };
}
