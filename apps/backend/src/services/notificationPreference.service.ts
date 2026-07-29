import { NotificationChannel, NotificationCadence, NotificationOutcomeType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  NotificationCategorySchema,
  notificationScopeKey,
  type NotificationCadence as Cadence,
  type NotificationCategory,
  type NotificationOutcome,
  type NotificationUrgency,
} from '../productFramework/notificationPolicy.contract';

const IMMEDIATE_CATEGORIES = new Set<NotificationCategory>(['SAFETY', 'ACTIVE_DAMAGE', 'MATERIAL_DEADLINE', 'WORKFLOW']);
function isDeliveryChannelSupported(
  channel: keyof typeof NotificationChannel,
  category: NotificationCategory,
): boolean {
  if (channel === 'IN_APP') return true;
  if (channel === 'EMAIL') {
    return (
      category !== 'REFINANCE' ||
      process.env.REFINANCE_EXTERNAL_ALERTS_ENABLED === 'true'
    );
  }
  if (channel !== 'PUSH') return false;
  return (
    process.env.WEB_PUSH_DELIVERY_ENABLED === 'true' &&
    (
      category !== 'REFINANCE' ||
      process.env.REFINANCE_PUSH_ALERTS_ENABLED === 'true'
    )
  );
}

export function inferNotificationCategory(type: string): NotificationCategory {
  const normalized = type.toUpperCase();
  if (/CRITICAL|EMERGENCY|FIRE|GAS|FREEZE|SEVERE_WEATHER/.test(normalized)) return 'SAFETY';
  if (/INCIDENT|LEAK|DAMAGE/.test(normalized)) return 'ACTIVE_DAMAGE';
  if (/SAVINGS_BENEFIT/.test(normalized)) return 'SAVINGS_BENEFITS';
  if (/DEADLINE|EXPIR|DUE|LAPSE/.test(normalized)) return 'MATERIAL_DEADLINE';
  if (/BOOKING|CLAIM|WORKFLOW|ACTION_CREATED|CANCELLED|CONFIRMED/.test(normalized)) return 'WORKFLOW';
  if (/RECALL/.test(normalized)) return 'RECALL';
  if (/COVERAGE|INSURANCE|WARRANTY/.test(normalized)) return 'COVERAGE';
  if (/REFINANCE|MORTGAGE_RATE/.test(normalized)) return 'REFINANCE';
  if (/PROJECT|QUOTE|PROVIDER/.test(normalized)) return 'PROJECT';
  if (/MAINTENANCE|SEASONAL|HABIT/.test(normalized)) return 'MAINTENANCE';
  if (/ACCOUNT|SECURITY|PASSWORD|EMAIL/.test(normalized)) return 'ACCOUNT';
  return 'GENERAL';
}

export function resolveMuteNotificationCategory(
  type: string,
  metadataCategory: unknown,
): NotificationCategory {
  const parsed = NotificationCategorySchema.safeParse(metadataCategory);
  return parsed.success ? parsed.data : inferNotificationCategory(type);
}

export function inferNotificationUrgency(type: string, metadata?: Record<string, unknown>): NotificationUrgency {
  const priority = String(metadata?.priority ?? '').toUpperCase();
  const severity = String(metadata?.severity ?? '').toUpperCase();
  if (priority === 'HIGH' || severity === 'CRITICAL') return 'CRITICAL';
  const category = inferNotificationCategory(type);
  if (category === 'SAFETY' || category === 'ACTIVE_DAMAGE') return 'URGENT';
  if (category === 'MATERIAL_DEADLINE' || category === 'WORKFLOW') return 'MATERIAL';
  return 'ROUTINE';
}

export function notificationPreferenceCategories(
  category: NotificationCategory,
): NotificationCategory[] {
  // Financial opportunities require category-specific consent. A broad
  // "ALL routine email" preference must never opt someone into refinance or
  // savings-and-benefits reminders (HSB-037) — those need their own,
  // independently mutable toggle so muting one never silences the other.
  return category === 'REFINANCE' || category === 'SAVINGS_BENEFITS' ? [category] : [category, 'ALL'];
}

function isQuietNow(preference: { quietStart: string | null; quietEnd: string | null; timezone: string }, now: Date) {
  if (!preference.quietStart || !preference.quietEnd) return false;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: preference.timezone,
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0) % 24;
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
    const current = hour * 60 + minute;
    const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
    const start = toMinutes(preference.quietStart);
    const end = toMinutes(preference.quietEnd);
    return start <= end ? current >= start && current < end : current >= start || current < end;
  } catch {
    return false;
  }
}

export async function listNotificationPreferences(userId: string) {
  return prisma.notificationPreference.findMany({ where: { userId }, orderBy: [{ scopeKey: 'asc' }, { category: 'asc' }, { channel: 'asc' }] });
}

export async function upsertNotificationPreference(userId: string, input: {
  propertyId?: string | null; memberUserId?: string | null; category: NotificationCategory;
  channel: keyof typeof NotificationChannel; enabled: boolean; cadence: Cadence;
  quietStart?: string | null; quietEnd?: string | null; timezone: string;
  minimumValue?: number | null; deadlineLeadDays?: number | null;
}) {
  const scopeKey = notificationScopeKey(input);
  return prisma.notificationPreference.upsert({
    where: { userId_scopeKey_category_channel: { userId, scopeKey, category: input.category, channel: input.channel } },
    create: {
      userId,
      scopeKey,
      propertyId: input.propertyId,
      memberUserId: input.memberUserId,
      category: input.category,
      channel: input.channel,
      enabled: input.enabled,
      cadence: input.cadence as NotificationCadence,
      quietStart: input.quietStart,
      quietEnd: input.quietEnd,
      timezone: input.timezone,
      minimumValue: input.category === 'SAVINGS_BENEFITS' ? input.minimumValue : null,
      deadlineLeadDays: input.category === 'SAVINGS_BENEFITS' ? input.deadlineLeadDays : null,
    },
    update: {
      propertyId: input.propertyId,
      memberUserId: input.memberUserId,
      enabled: input.enabled,
      cadence: input.cadence as NotificationCadence,
      quietStart: input.quietStart,
      quietEnd: input.quietEnd,
      timezone: input.timezone,
      minimumValue: input.category === 'SAVINGS_BENEFITS' ? input.minimumValue : null,
      deadlineLeadDays: input.category === 'SAVINGS_BENEFITS' ? input.deadlineLeadDays : null,
    },
  });
}

export async function resolveNotificationPolicy(input: {
  userId: string; propertyId?: string; memberUserId?: string; type: string;
  category?: NotificationCategory; urgency?: NotificationUrgency; legacyEmailEnabled: boolean; now?: Date;
}) {
  const category = input.category ?? inferNotificationCategory(input.type);
  const urgency = input.urgency ?? inferNotificationUrgency(input.type);
  const scopeKeys = [notificationScopeKey(input), input.propertyId ? `PROPERTY:${input.propertyId}` : null, input.memberUserId ? `MEMBER:${input.memberUserId}` : null, 'GLOBAL'].filter(Boolean) as string[];
  const preferences = await prisma.notificationPreference.findMany({
    where: {
      userId: input.userId,
      scopeKey: { in: scopeKeys },
      category: { in: notificationPreferenceCategories(category) },
    },
  });
  const specificity = (preference: { scopeKey: string; category: string }) =>
    (scopeKeys.length - scopeKeys.indexOf(preference.scopeKey)) * 10 + (preference.category === category ? 1 : 0);
  preferences.sort((a, b) => specificity(b) - specificity(a));
  const defaultCadence: Cadence = IMMEDIATE_CATEGORIES.has(category) || urgency !== 'ROUTINE' ? 'IMMEDIATE' : 'WEEKLY_BRIEF';
  // Material-financial opportunity email is explicit opt-in only. Never
  // inherit the legacy global email default for refinance or Savings and
  // Benefits; in-app continuity remains available.
  const requiresExplicitFinancialEmail =
    category === 'REFINANCE' || category === 'SAVINGS_BENEFITS';
  const channelDefaults: Array<keyof typeof NotificationChannel> = [
    'IN_APP',
    ...(!requiresExplicitFinancialEmail && input.legacyEmailEnabled ? ['EMAIL' as const] : []),
  ];
  const configuredChannels = preferences.map((preference) => preference.channel as keyof typeof NotificationChannel);
  const channels = [...new Set([...channelDefaults, ...configuredChannels])].map((channel) => {
    const preference = preferences.find((candidate) => candidate.channel === channel);
    const critical = urgency === 'CRITICAL';
    const supported = isDeliveryChannelSupported(channel, category);
    const enabled = supported && (critical && channel === 'IN_APP' ? true : preference?.enabled ?? channelDefaults.includes(channel));
    const cadence = (preference?.cadence ?? defaultCadence) as Cadence;
    const quiet = preference ? isQuietNow(preference, input.now ?? new Date()) : false;
    return { channel, enabled: enabled && cadence !== 'MUTED', cadence, deliverImmediately: supported && cadence === 'IMMEDIATE' && (!quiet || critical), quietHoursApplied: quiet && !critical };
  });
  return { category, urgency, scopeKey: notificationScopeKey(input), channels };
}

export async function recordNotificationOutcome(userId: string, notificationId: string, type: NotificationOutcome) {
  const notification = await prisma.notification.findFirst({ where: { id: notificationId, userId }, select: { id: true, type: true, metadata: true } });
  if (!notification) return null;
  const metadata = (notification.metadata ?? {}) as Record<string, unknown>;
  const category = String((metadata.notificationPolicy as any)?.category ?? inferNotificationCategory(notification.type));
  const propertyId = typeof metadata.propertyId === 'string' ? metadata.propertyId : null;
  const outcome = await prisma.notificationOutcome.upsert({
    where: { notificationId_userId_type: { notificationId, userId, type: type as NotificationOutcomeType } },
    create: { notificationId, userId, type: type as NotificationOutcomeType, category, propertyId }, update: {},
  });
  if (type === 'MUTE_TYPE') {
    // Only email is user-configurable during the pilot. Keep the mandatory
    // in-app continuity channel intact when feedback is submitted from a card.
    // Scope by the notification type's stable category rather than urgency:
    // a maintenance reminder near its due date may use MATERIAL_DEADLINE for
    // delivery timing, but muting it must not suppress every material deadline.
    const muteCategory = resolveMuteNotificationCategory(notification.type, category);
    await upsertNotificationPreference(userId, {
      propertyId,
      category: muteCategory,
      channel: 'EMAIL',
      enabled: false,
      cadence: 'MUTED',
      timezone: 'UTC',
    });
  }
  if (type === 'NOT_RELEVANT' || type === 'ALREADY_HANDLED') {
    await prisma.notification.update({ where: { id: notificationId }, data: { isRead: true, readAt: new Date() } });
  }
  return outcome;
}

export async function revokeNotificationOutcome(
  userId: string,
  notificationId: string,
  type: NotificationOutcome,
  restoreIsRead?: boolean,
) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
    select: { id: true },
  });
  if (!notification) return null;

  const removed = await prisma.notificationOutcome.deleteMany({
    where: { notificationId, userId, type: type as NotificationOutcomeType },
  });

  if (
    (type === 'NOT_RELEVANT' || type === 'ALREADY_HANDLED') &&
    typeof restoreIsRead === 'boolean'
  ) {
    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: restoreIsRead,
        readAt: restoreIsRead ? new Date() : null,
      },
    });
  }

  return { removed: removed.count };
}

export async function getNotificationQuality(userId: string, since = new Date(Date.now() - 30 * 86_400_000)) {
  const rows = await prisma.notificationOutcome.groupBy({ by: ['type'], where: { userId, createdAt: { gte: since } }, _count: { _all: true } });
  return { since: since.toISOString(), outcomes: rows.map((row) => ({ type: row.type, count: row._count._all })) };
}
