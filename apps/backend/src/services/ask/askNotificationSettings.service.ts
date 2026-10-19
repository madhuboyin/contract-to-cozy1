import { prisma } from '../../lib/prisma';
import { NOTIFICATION_CATEGORIES, NotificationCategorySchema, type NotificationCadence, type NotificationCategory } from '../../productFramework/notificationPolicy.contract';
import { IMMEDIATE_CATEGORIES, upsertNotificationPreference } from '../notificationPreference.service';
import { grantNotificationChannelConsent, hasActiveNotificationChannelConsent, revokeNotificationChannelConsent, NOTIFICATION_CHANNEL_CONSENT_VERSION } from '../decisionPlatform/notificationChannelConsent.service';
import type { AskAccountRole } from './askAccountEligibility';
import { ensureAskServiceAccountEligibility } from './support/propertyContext';
import { NOTIFICATION_CATEGORY_LABELS, NOTIFICATION_WHY } from './askNotification.contract';

export class AskNotificationSettingsError extends Error {
  constructor(public readonly code: 'ASK_INVALID_REQUEST' | 'ASK_NOTIFICATION_NOT_ALLOWED' | 'ASK_NOTIFICATION_CONSENT_REQUIRED', message: string) {
    super(message);
  }
}

/** Safety and active damage are never muted or snoozed: they are the notices the product must always be able to deliver. */
export const UNPAUSEABLE_NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = Object.freeze(['SAFETY', 'ACTIVE_DAMAGE']);
/** Financial opportunities never inherit a broad setting: email for them needs its own explicit consent. */
export const CONSENT_REQUIRED_NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = Object.freeze(['REFINANCE', 'SAVINGS_BENEFITS']);
export const MAX_SNOOZE_DAYS = 90;

const CONSENT_DISCLOSURE: Partial<Record<NotificationCategory, string>> = {
  REFINANCE: 'If you allow it, we email you when refinance rates cross a threshold you set. Rates are not advice. You can turn this off any time, and in-app alerts stay either way.',
  SAVINGS_BENEFITS: 'If you allow it, we email you about savings and benefits deadlines and follow-ups you chose to track. You can turn this off any time, and in-app notices stay either way.',
};

export const CAPABILITY_SETTINGS = Object.freeze([
  { id: 'refinance-monitors', label: 'Refinance rate monitors', description: 'Each monitor has its own rate threshold, cadence and quiet hours, and can be paused or stopped.', question: 'Show my refinance rate monitors.' },
  { id: 'savings-reminders', label: 'Savings and benefits reminders', description: 'Choose the minimum value and how many days ahead of a deadline you are reminded.', question: 'Show me my savings opportunities.' },
  { id: 'home-briefing', label: 'Home briefing', description: 'Set when your home briefing is delivered and what it includes.', question: 'Show my home briefing.' },
  { id: 'maintenance-reminders', label: 'Maintenance reminders', description: 'Reminders follow each task’s own schedule; change them on the task.', question: 'What is the status of my home maintenance?' },
]);

type EmailState = { mode: 'ON' | 'MUTED' | 'SNOOZED'; snoozedUntil: string | null; cadence: NotificationCadence | null; defaultCadence: NotificationCadence };

export interface AskNotificationCategorySetting {
  category: NotificationCategory;
  label: string;
  description: string;
  /** False for safety and active damage: they cannot be muted or snoozed. */
  canPause: boolean;
  email: EmailState;
  consent: { required: boolean; granted: boolean; version: string | null; disclosure: string | null };
}

export interface AskNotificationSettings {
  generatedAt: string;
  channels: Array<{ channel: 'IN_APP' | 'EMAIL'; configurable: boolean; disclosure: string }>;
  unavailableChannels: Array<{ channel: 'PUSH' | 'SMS' | 'WHATSAPP'; reason: string }>;
  quietHours: { start: string | null; end: string | null; timezone: string };
  categories: AskNotificationCategorySetting[];
  capabilitySettings: typeof CAPABILITY_SETTINGS;
}

function defaultCadence(category: NotificationCategory): NotificationCadence {
  return IMMEDIATE_CATEGORIES.has(category) ? 'IMMEDIATE' : 'WEEKLY_BRIEF';
}

/**
 * The central preference surface (FR-NOTIF-003): global channel settings and per-category mute and snooze, with the consent disclosures
 * that go with them. It only reads and edits the person's own preference rows; whether, when and how a message is actually delivered
 * (consent, cooldown, quiet hours, legal retention) is decided by the delivery policy on the server, never here.
 */
export async function getAskNotificationSettings(userId: string, accountRole?: AskAccountRole, now: Date = new Date()): Promise<AskNotificationSettings> {
  await ensureAskServiceAccountEligibility(userId, accountRole);
  const [preferences, consents] = await Promise.all([
    prisma.notificationPreference.findMany({ where: { userId, scopeKey: 'GLOBAL', channel: 'EMAIL' } }),
    prisma.notificationChannelConsent.findMany({ where: { userId, channel: 'EMAIL' } }),
  ]);
  const preferenceFor = (category: NotificationCategory) => preferences.find((entry) => entry.category === category) ?? null;
  const all = preferenceFor('ALL');
  const categories = NOTIFICATION_CATEGORIES.map((category): AskNotificationCategorySetting => {
    const preference = preferenceFor(category);
    const snoozed = preference?.snoozedUntil && preference.snoozedUntil > now ? preference.snoozedUntil : null;
    const muted = !snoozed && preference !== null && (preference.cadence === 'MUTED' || !preference.enabled);
    const consent = consents.find((entry) => entry.category === category);
    const required = CONSENT_REQUIRED_NOTIFICATION_CATEGORIES.includes(category);
    return {
      category, label: NOTIFICATION_CATEGORY_LABELS[category], description: NOTIFICATION_WHY[category], canPause: !UNPAUSEABLE_NOTIFICATION_CATEGORIES.includes(category),
      email: { mode: snoozed ? 'SNOOZED' : muted ? 'MUTED' : 'ON', snoozedUntil: snoozed?.toISOString() ?? null, cadence: (preference?.cadence as NotificationCadence | undefined) ?? null, defaultCadence: defaultCadence(category) },
      consent: { required, granted: Boolean(consent?.consentedAt && !consent.revokedAt), version: consent?.consentedAt && !consent.revokedAt ? consent.consentVersion : null, disclosure: CONSENT_DISCLOSURE[category] ?? null },
    };
  });
  return {
    generatedAt: now.toISOString(),
    channels: [
      { channel: 'IN_APP', configurable: false, disclosure: 'Notifications are always kept in your inbox so nothing important is lost. Muting a category pauses email only.' },
      { channel: 'EMAIL', configurable: true, disclosure: 'Email is optional. Safety and active-damage notices are always sent. Quiet hours delay everything else.' },
    ],
    unavailableChannels: [
      { channel: 'PUSH', reason: 'Push notifications are not available yet.' },
      { channel: 'SMS', reason: 'Text messages are not available yet.' },
      { channel: 'WHATSAPP', reason: 'WhatsApp messages are not available yet.' },
    ],
    quietHours: { start: all?.quietStart ?? null, end: all?.quietEnd ?? null, timezone: all?.timezone ?? 'UTC' },
    categories,
    capabilitySettings: CAPABILITY_SETTINGS,
  };
}

export interface AskNotificationCategoryUpdate {
  mode: 'ON' | 'MUTED' | 'SNOOZED';
  snoozedUntil?: string | null;
  cadence?: NotificationCadence | null;
}

/** Turns a category's email on, mutes it, or snoozes it until a date. Safety and active damage are refused; financial categories need consent first. */
export async function updateAskNotificationCategory(userId: string, rawCategory: string, update: AskNotificationCategoryUpdate, accountRole?: AskAccountRole, now: Date = new Date()): Promise<AskNotificationCategorySetting> {
  await ensureAskServiceAccountEligibility(userId, accountRole);
  const parsed = NotificationCategorySchema.safeParse(rawCategory);
  if (!parsed.success) throw new AskNotificationSettingsError('ASK_INVALID_REQUEST', 'category is not valid.');
  const category = parsed.data;
  if (update.mode !== 'ON' && UNPAUSEABLE_NOTIFICATION_CATEGORIES.includes(category)) {
    throw new AskNotificationSettingsError('ASK_NOTIFICATION_NOT_ALLOWED', 'Safety and active-damage notices cannot be muted or snoozed.');
  }
  if (update.mode === 'ON' && CONSENT_REQUIRED_NOTIFICATION_CATEGORIES.includes(category) && !(await hasActiveNotificationChannelConsent({ userId, category, channel: 'EMAIL' }))) {
    throw new AskNotificationSettingsError('ASK_NOTIFICATION_CONSENT_REQUIRED', 'Email for this category needs your consent first.');
  }
  let snoozedUntil: Date | null = null;
  if (update.mode === 'SNOOZED') {
    snoozedUntil = update.snoozedUntil ? new Date(update.snoozedUntil) : null;
    if (!snoozedUntil || Number.isNaN(snoozedUntil.getTime()) || snoozedUntil <= now) throw new AskNotificationSettingsError('ASK_INVALID_REQUEST', 'A snooze needs a time in the future.');
    if (snoozedUntil.getTime() - now.getTime() > MAX_SNOOZE_DAYS * 86_400_000) throw new AskNotificationSettingsError('ASK_INVALID_REQUEST', `A snooze can last at most ${MAX_SNOOZE_DAYS} days.`);
  }
  const existing = await prisma.notificationPreference.findFirst({ where: { userId, scopeKey: 'GLOBAL', category, channel: 'EMAIL' } });
  await upsertNotificationPreference(userId, {
    category, channel: 'EMAIL', timezone: existing?.timezone ?? 'UTC', quietStart: existing?.quietStart ?? null, quietEnd: existing?.quietEnd ?? null,
    enabled: update.mode !== 'MUTED',
    cadence: update.mode === 'MUTED' ? 'MUTED' : (update.cadence && update.cadence !== 'MUTED' ? update.cadence : existing && existing.cadence !== 'MUTED' ? existing.cadence : defaultCadence(category)),
    minimumValue: existing?.minimumValue ? Number(existing.minimumValue) : null, deadlineLeadDays: existing?.deadlineLeadDays ?? null,
    snoozedUntil: update.mode === 'SNOOZED' ? snoozedUntil : null,
  });
  const settings = await getAskNotificationSettings(userId, accountRole, now);
  return settings.categories.find((entry) => entry.category === category) as AskNotificationCategorySetting;
}

/** Quiet hours for email, kept on the person's "everything else" preference. Both times or neither. */
export async function updateAskNotificationQuietHours(userId: string, input: { start: string | null; end: string | null; timezone: string }, accountRole?: AskAccountRole): Promise<AskNotificationSettings['quietHours']> {
  await ensureAskServiceAccountEligibility(userId, accountRole);
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if ((input.start === null) !== (input.end === null) || (input.start !== null && (!time.test(input.start) || !time.test(input.end as string)))) {
    throw new AskNotificationSettingsError('ASK_INVALID_REQUEST', 'Quiet hours need both a start and an end time (HH:MM), or neither.');
  }
  try { new Intl.DateTimeFormat('en-US', { timeZone: input.timezone }); } catch { throw new AskNotificationSettingsError('ASK_INVALID_REQUEST', 'timezone is not valid.'); }
  const existing = await prisma.notificationPreference.findFirst({ where: { userId, scopeKey: 'GLOBAL', category: 'ALL', channel: 'EMAIL' } });
  await upsertNotificationPreference(userId, {
    category: 'ALL', channel: 'EMAIL', enabled: existing?.enabled ?? true, cadence: (existing?.cadence as NotificationCadence | undefined) ?? 'WEEKLY_BRIEF',
    quietStart: input.start, quietEnd: input.end, timezone: input.timezone,
  });
  return { start: input.start, end: input.end, timezone: input.timezone };
}

/** Grants or revokes the explicit email consent a financial category needs. Revoking also turns that category's email off. */
export async function setAskNotificationConsent(userId: string, rawCategory: string, granted: boolean, accountRole?: AskAccountRole): Promise<{ category: NotificationCategory; granted: boolean; version: string | null }> {
  await ensureAskServiceAccountEligibility(userId, accountRole);
  const parsed = NotificationCategorySchema.safeParse(rawCategory);
  if (!parsed.success || !CONSENT_REQUIRED_NOTIFICATION_CATEGORIES.includes(parsed.data)) throw new AskNotificationSettingsError('ASK_INVALID_REQUEST', 'This category does not use a separate consent.');
  const category = parsed.data;
  if (granted) {
    await grantNotificationChannelConsent({ userId, category, channel: 'EMAIL' });
    return { category, granted: true, version: NOTIFICATION_CHANNEL_CONSENT_VERSION };
  }
  await revokeNotificationChannelConsent({ userId, category, channel: 'EMAIL' });
  await upsertNotificationPreference(userId, { category, channel: 'EMAIL', enabled: false, cadence: 'MUTED', timezone: 'UTC', snoozedUntil: null });
  return { category, granted: false, version: null };
}

