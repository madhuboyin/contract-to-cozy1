import { NotificationChannel, NotificationCadence, NotificationOutcomeType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  notificationScopeKey,
  type NotificationCadence as Cadence,
  type NotificationCategory,
  type NotificationOutcome,
  type NotificationUrgency,
} from '../productFramework/notificationPolicy.contract';

const IMMEDIATE_CATEGORIES = new Set<NotificationCategory>(['SAFETY', 'ACTIVE_DAMAGE', 'MATERIAL_DEADLINE', 'WORKFLOW']);

export function inferNotificationCategory(type: string): NotificationCategory {
  const normalized = type.toUpperCase();
  if (/CRITICAL|EMERGENCY|FIRE|GAS|FREEZE|SEVERE_WEATHER/.test(normalized)) return 'SAFETY';
  if (/INCIDENT|LEAK|DAMAGE/.test(normalized)) return 'ACTIVE_DAMAGE';
  if (/DEADLINE|EXPIR|DUE|LAPSE/.test(normalized)) return 'MATERIAL_DEADLINE';
  if (/BOOKING|CLAIM|WORKFLOW|ACTION_CREATED|CANCELLED|CONFIRMED/.test(normalized)) return 'WORKFLOW';
  if (/RECALL/.test(normalized)) return 'RECALL';
  if (/COVERAGE|INSURANCE|WARRANTY/.test(normalized)) return 'COVERAGE';
  if (/PROJECT|QUOTE|PROVIDER/.test(normalized)) return 'PROJECT';
  if (/MAINTENANCE|SEASONAL|HABIT/.test(normalized)) return 'MAINTENANCE';
  if (/ACCOUNT|SECURITY|PASSWORD|EMAIL/.test(normalized)) return 'ACCOUNT';
  return 'GENERAL';
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
}) {
  const scopeKey = notificationScopeKey(input);
  return prisma.notificationPreference.upsert({
    where: { userId_scopeKey_category_channel: { userId, scopeKey, category: input.category, channel: input.channel } },
    create: { userId, scopeKey, propertyId: input.propertyId, memberUserId: input.memberUserId, category: input.category, channel: input.channel, enabled: input.enabled, cadence: input.cadence as NotificationCadence, quietStart: input.quietStart, quietEnd: input.quietEnd, timezone: input.timezone },
    update: { propertyId: input.propertyId, memberUserId: input.memberUserId, enabled: input.enabled, cadence: input.cadence as NotificationCadence, quietStart: input.quietStart, quietEnd: input.quietEnd, timezone: input.timezone },
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
    where: { userId: input.userId, scopeKey: { in: scopeKeys }, category: { in: [category, 'ALL'] } },
  });
  const specificity = (preference: { scopeKey: string; category: string }) =>
    (scopeKeys.length - scopeKeys.indexOf(preference.scopeKey)) * 10 + (preference.category === category ? 1 : 0);
  preferences.sort((a, b) => specificity(b) - specificity(a));
  const defaultCadence: Cadence = IMMEDIATE_CATEGORIES.has(category) || urgency !== 'ROUTINE' ? 'IMMEDIATE' : 'WEEKLY_BRIEF';
  const channelDefaults: Array<keyof typeof NotificationChannel> = ['IN_APP', ...(input.legacyEmailEnabled ? ['EMAIL' as const] : [])];
  const configuredChannels = preferences.map((preference) => preference.channel as keyof typeof NotificationChannel);
  const channels = [...new Set([...channelDefaults, ...configuredChannels])].map((channel) => {
    const preference = preferences.find((candidate) => candidate.channel === channel);
    const critical = urgency === 'CRITICAL';
    const enabled = critical && channel === 'IN_APP' ? true : preference?.enabled ?? channelDefaults.includes(channel);
    const cadence = (preference?.cadence ?? defaultCadence) as Cadence;
    const quiet = preference ? isQuietNow(preference, input.now ?? new Date()) : false;
    return { channel, enabled: enabled && cadence !== 'MUTED', cadence, deliverImmediately: cadence === 'IMMEDIATE' && (!quiet || critical), quietHoursApplied: quiet && !critical };
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
    for (const channel of Object.values(NotificationChannel)) {
      await upsertNotificationPreference(userId, { propertyId, category: category as NotificationCategory, channel, enabled: false, cadence: 'MUTED', timezone: 'UTC' });
    }
  }
  if (type === 'NOT_RELEVANT' || type === 'ALREADY_HANDLED') {
    await prisma.notification.update({ where: { id: notificationId }, data: { isRead: true, readAt: new Date() } });
  }
  return outcome;
}

export async function getNotificationQuality(userId: string, since = new Date(Date.now() - 30 * 86_400_000)) {
  const rows = await prisma.notificationOutcome.groupBy({ by: ['type'], where: { userId, createdAt: { gte: since } }, _count: { _all: true } });
  return { since: since.toISOString(), outcomes: rows.map((row) => ({ type: row.type, count: row._count._all })) };
}
