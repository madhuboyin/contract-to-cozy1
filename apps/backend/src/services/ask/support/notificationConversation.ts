// Notifications as a conversation (Sole Homeowner Interface FRD v1.7). Pure: the typed grammar for "what's new" and for the notification
// settings ("mute maintenance alerts", "snooze refinance alerts for a week", "set quiet hours from 10pm to 7am"), the category vocabulary, and the
// declared messages and action ids. The inbox and the settings are the existing services; nothing here reads or writes.
import type { NotificationCategory } from '../../../productFramework/notificationPolicy.contract';

const SETTINGS_WORDS = /\b(?:settings?|preferences?|mute|unmute|snooze|quiet hours?|consent|opt in|opt out|turn (?:on|off)|stop sending|pause)\b/i;

/** "What's new?", "show my notifications", "any alerts?", "my unread notifications". Settings questions are another operation's. */
export const isNotificationsOverviewRequest = (message: string): boolean => {
  if (SETTINGS_WORDS.test(message)) return false;
  return /^\s*(?:what(?:'s| is) new|any (?:news|alerts?|notifications?|updates?)(?: for me)?|anything new)\s*\??\s*$/i.test(message)
    || /\b(?:show|list|see|open|check|read)\b.{0,24}\b(?:my\s+|the\s+)?(?:notifications?|alerts|inbox)\b/i.test(message)
    || /\b(?:unread|new|dismissed)\b.{0,16}\b(?:notifications?|alerts)\b|\b(?:notifications?|alerts)\b.{0,16}\b(?:unread|dismissed)\b/i.test(message);
};

/** The categories a homeowner names, in their words. First match wins, most specific first. */
const CATEGORY_WORDS: ReadonlyArray<{ category: NotificationCategory; test: RegExp }> = [
  { category: 'ACTIVE_DAMAGE', test: /\b(?:active )?damage\b/i },
  { category: 'SAFETY', test: /\bsafety\b/i },
  { category: 'MATERIAL_DEADLINE', test: /\bdeadlines?\b/i },
  { category: 'REFINANCE', test: /\brefinanc\w*\b/i },
  { category: 'SAVINGS_BENEFITS', test: /\bsavings?\b|\bbenefits?\b/i },
  { category: 'MAINTENANCE', test: /\bmaintenance\b|\breminders?\b/i },
  { category: 'COVERAGE', test: /\bcoverage\b|\bwarrant(?:y|ies)\b|\binsurance\b|\bpolic(?:y|ies)\b/i },
  { category: 'PROJECT', test: /\bprojects?\b|\bquotes?\b/i },
  { category: 'RECALL', test: /\brecalls?\b/i },
  { category: 'NEIGHBORHOOD', test: /\bneighbou?rhood\b/i },
  { category: 'ACCOUNT', test: /\baccount\b/i },
  { category: 'WORKFLOW', test: /\b(?:requests?|claims?|bookings?)\b/i },
];
export function notificationCategoryFromWords(message: string): NotificationCategory | null {
  return CATEGORY_WORDS.find((entry) => entry.test.test(message))?.category ?? null;
}

// ── The inbox ─────────────────────────────────────────────────────────────────────────────────────
export const NOTIFICATION_COMMAND_ENTITY_TYPE = 'ASK_NOTIFICATION';
export const NOTIFICATION_COMMAND_MESSAGES = {
  READ: 'Mark this notification read', UNREAD: 'Mark this notification unread', DISMISS: 'Dismiss this notification', RESTORE: 'Bring this notification back',
} as const;
export type NotificationCommandKind = keyof typeof NOTIFICATION_COMMAND_MESSAGES;
export const NOTIFICATION_COMMAND_ACTION_IDS = { READ: 'notification-read', UNREAD: 'notification-unread', DISMISS: 'notification-dismiss', RESTORE: 'notification-restore' } as const;
export const notificationCommandKindFromMessage = (message: string): NotificationCommandKind | null =>
  ((Object.entries(NOTIFICATION_COMMAND_MESSAGES) as Array<[NotificationCommandKind, string]>).find(([, prefix]) => message.startsWith(prefix))?.[0]) ?? null;
export const notificationCommandMessage = (kind: NotificationCommandKind, title: string): string =>
  `${NOTIFICATION_COMMAND_MESSAGES[kind]}: ${title.replace(/\s+/g, ' ').trim()}`.slice(0, 300);
export const NOTIFICATIONS_OVERVIEW_MESSAGE = "What's new?";

// ── The settings ──────────────────────────────────────────────────────────────────────────────────
export const NOTIFICATION_SETTINGS_ENTITY_TYPE = 'NOTIFICATION_SETTING';
export const NOTIFICATION_SETTINGS_OVERVIEW_MESSAGE = 'Show my notification settings';
export type NotificationSettingsKind = 'MUTE' | 'UNMUTE' | 'SNOOZE' | 'QUIET_SET' | 'QUIET_CLEAR' | 'CONSENT_GRANT' | 'CONSENT_REVOKE';
export const NOTIFICATION_SETTINGS_ACTION_IDS = {
  MUTE: 'notification-setting-mute', UNMUTE: 'notification-setting-unmute', SNOOZE: 'notification-setting-snooze', CONSENT_GRANT: 'notification-setting-consent-grant', CONSENT_REVOKE: 'notification-setting-consent-revoke',
  QUIET_CLEAR: 'notification-setting-quiet-clear',
} as const;

/** "Show my notification settings", "which alerts are muted", "what are my quiet hours". */
export const isNotificationSettingsOverviewRequest = (message: string): boolean =>
  /\b(?:show|see|open|check|review|what(?:'s| is| are))\b.{0,30}\b(?:notification|alert)s?\s+(?:settings?|preferences?)\b|\b(?:notification|alert)s?\s+(?:settings?|preferences?)\b|\bwhich (?:alerts|notifications)\b.{0,20}\b(?:muted|snoozed|paused|on)\b|\bquiet hours\b.{0,12}\?|\bwhat(?:'s| are| is)\b.{0,12}\bmy quiet hours\b/i.test(message);

const PLURAL = /\b(?:alerts?|notifications?|notices?|emails?)\b/i;
const to24 = (hour: number, minute: number, meridiem: string | undefined): string | null => {
  let h = hour;
  const m = (meridiem ?? '').toLowerCase();
  if (m === 'pm' && h < 12) h += 12;
  if (m === 'am' && h === 12) h = 0;
  if (h > 23 || minute > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

/** "set quiet hours from 10pm to 7am" → { start: '22:00', end: '07:00' }; null when no two times were named. */
export function quietHoursFromWords(message: string): { start: string; end: string } | null {
  const match = message.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|until|till|through|-|and)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!match) return null;
  // A bare "10 to 7" with no am/pm is read as evening to morning only when it is clearly a night window; otherwise it is refused as unclear.
  const startMeridiem = match[3] ?? (match[6] ? undefined : undefined);
  const start = to24(Number(match[1]), Number(match[2] ?? 0), startMeridiem ?? match[3]);
  const end = to24(Number(match[4]), Number(match[5] ?? 0), match[6]);
  if (!start || !end || (!match[3] && !match[6])) return null;
  return { start, end };
}

/** "for 7 days", "for a week", "for two weeks", "for a month": the days asked for, within the longest a snooze may last (90); null when none were named. */
export function snoozeDaysFromWords(message: string): number | null {
  const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4 };
  const match = message.toLowerCase().match(/\bfor\s+(?:the next\s+)?(\d+|a|one|two|three|four)\s+(day|week|month)s?\b/);
  if (!match) return null;
  const count = /^\d+$/.test(match[1]) ? Number(match[1]) : words[match[1]];
  return Math.max(1, Math.min(90, count * (match[2] === 'week' ? 7 : match[2] === 'month' ? 30 : 1)));
}

export interface NotificationSettingsRequest { kind: NotificationSettingsKind; category: NotificationCategory | null; days: number | null; quiet: { start: string; end: string } | null }

/** What a typed settings message asks for, or null. A change always names its category, or its times, so nothing is guessed. */
export function parseNotificationSettingsRequest(message: string): NotificationSettingsRequest | null {
  if (/\bquiet hours?\b/i.test(message)) {
    if (/\b(?:turn off|clear|remove|stop|disable|cancel|no more)\b/i.test(message)) return { kind: 'QUIET_CLEAR', category: null, days: null, quiet: null };
    const quiet = quietHoursFromWords(message);
    return quiet ? { kind: 'QUIET_SET', category: null, days: null, quiet } : null;
  }
  const category = notificationCategoryFromWords(message);
  if (!category || !PLURAL.test(message)) return null;
  if (/\bsnooze\b/i.test(message)) return { kind: 'SNOOZE', category, days: snoozeDaysFromWords(message) ?? 7, quiet: null };
  if (/\b(?:unmute|resume|turn on|enable|start sending|opt in|allow|consent to)\b/i.test(message)) return { kind: category === 'REFINANCE' || category === 'SAVINGS_BENEFITS' ? 'CONSENT_GRANT' : 'UNMUTE', category, days: null, quiet: null };
  if (/\b(?:revoke|withdraw)\b/i.test(message)) return { kind: category === 'REFINANCE' || category === 'SAVINGS_BENEFITS' ? 'CONSENT_REVOKE' : 'MUTE', category, days: null, quiet: null };
  if (/\b(?:mute|turn off|stop|pause|silence|disable|opt out)\b/i.test(message)) return { kind: category === 'REFINANCE' || category === 'SAVINGS_BENEFITS' ? 'CONSENT_REVOKE' : 'MUTE', category, days: null, quiet: null };
  return null;
}
export const isNotificationSettingsCommandRequest = (message: string): boolean => parseNotificationSettingsRequest(message) !== null;

/** The sentence a declared settings action sends: it parses back to the same change, and it is the message the homeowner sees. */
export function notificationSettingsMessage(kind: Exclude<NotificationSettingsKind, 'QUIET_SET'>, categoryLabel: string, days?: number): string {
  const label = categoryLabel.toLowerCase();
  switch (kind) {
    case 'MUTE': return `Mute ${label} notifications by email`;
    case 'UNMUTE': return `Turn on ${label} notifications by email`;
    case 'SNOOZE': return `Snooze ${label} notifications by email for ${days ?? 7} days`;
    case 'CONSENT_GRANT': return `Turn on ${label} email notifications`;
    case 'CONSENT_REVOKE': return `Turn off ${label} email notifications`;
    case 'QUIET_CLEAR': return 'Turn off quiet hours';
  }
}
