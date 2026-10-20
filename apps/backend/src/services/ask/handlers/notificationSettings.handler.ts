// Notification settings as a conversation (FRD v1.7): what is muted, snoozed or on, the quiet hours, and the email consent the two financial
// categories need, all read from the settings service; and the changes ("mute maintenance notifications", "snooze coverage notifications
// for a week", "set quiet hours from 10pm to 7am", "turn on refinance email notifications"), each shown for review and applied only after
// the homeowner confirms. The writes are the settings service's own, scoped to the caller's own preferences, so the floor is the caller's
// own account. Safety and active-damage notices are never muted; the answer says so.
import { createHash } from 'node:crypto';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import {
  AskNotificationSettingsError, CONSENT_REQUIRED_NOTIFICATION_CATEGORIES, MAX_SNOOZE_DAYS, getAskNotificationSettings, setAskNotificationConsent, updateAskNotificationCategory, updateAskNotificationQuietHours,
  type AskNotificationCategorySetting, type AskNotificationSettings,
} from '../askNotificationSettings.service';
import { humanDate } from '../askFormatting';
import {
  NOTIFICATION_SETTINGS_ACTION_IDS, NOTIFICATION_SETTINGS_ENTITY_TYPE, NOTIFICATION_SETTINGS_OVERVIEW_MESSAGE, notificationSettingsMessage, parseNotificationSettingsRequest,
  type NotificationSettingsRequest,
} from '../support/notificationConversation';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const backToSettings = { id: 'notification-settings-back', label: 'Back to my notification settings', interactionType: 'START_WORKFLOW' as const, message: NOTIFICATION_SETTINGS_OVERVIEW_MESSAGE, operationId: 'NOTIFICATION_SETTINGS_OVERVIEW' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'notification-settings-unavailable', title, body, tone: 'DEFAULT', actions: [backToSettings] }], suggestions: [],
});

const hhmm = (value: string) => { const [h, m] = value.split(':').map(Number); const meridiem = h >= 12 ? 'pm' : 'am'; return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${meridiem}`; };
const quietLine = (quiet: AskNotificationSettings['quietHours']) => (quiet.start && quiet.end ? `Quiet hours ${hhmm(quiet.start)} to ${hhmm(quiet.end)} (${quiet.timezone})` : 'No quiet hours set');

function categoryRow(setting: AskNotificationCategorySetting) {
  const needsConsent = CONSENT_REQUIRED_NOTIFICATION_CATEGORIES.includes(setting.category);
  const status = !setting.canPause ? 'Always sent' : needsConsent && !setting.consent.granted ? 'Email off' : setting.email.mode === 'MUTED' ? 'Email muted'
    : setting.email.mode === 'SNOOZED' ? `Email snoozed until ${humanDate(new Date(setting.email.snoozedUntil as string)) ?? 'later'}` : 'Email on';
  const action = (id: string, label: string, message: string, style: 'PRIMARY' | 'QUIET' = 'QUIET') => ({
    id, label, message, interactionType: 'MUTATE_RECORD' as const, operationId: 'NOTIFICATION_SETTINGS_COMMAND' as const, entityType: NOTIFICATION_SETTINGS_ENTITY_TYPE, entityId: setting.category, style,
  });
  const actions = !setting.canPause ? []
    : needsConsent
      ? [setting.consent.granted && setting.email.mode === 'ON'
        ? action(NOTIFICATION_SETTINGS_ACTION_IDS.CONSENT_REVOKE, 'Turn off email', notificationSettingsMessage('CONSENT_REVOKE', setting.label))
        : action(NOTIFICATION_SETTINGS_ACTION_IDS.CONSENT_GRANT, 'Turn on email', notificationSettingsMessage('CONSENT_GRANT', setting.label), 'PRIMARY')]
      : setting.email.mode === 'ON'
        ? [action(NOTIFICATION_SETTINGS_ACTION_IDS.MUTE, 'Mute email', notificationSettingsMessage('MUTE', setting.label)), action(NOTIFICATION_SETTINGS_ACTION_IDS.SNOOZE, 'Snooze a week', notificationSettingsMessage('SNOOZE', setting.label, 7))]
        : [action(NOTIFICATION_SETTINGS_ACTION_IDS.UNMUTE, 'Turn on email', notificationSettingsMessage('UNMUTE', setting.label), 'PRIMARY')];
  return { id: setting.category, title: setting.label, description: setting.description, status, entityType: null, href: null, meta: [status], actions };
}

export function notificationSettingsFromSettings(settings: AskNotificationSettings): AskOperationResult {
  const categories = settings.categories.filter((entry) => entry.category !== 'ALL');
  const paused = categories.filter((entry) => entry.email.mode !== 'ON').length;
  const headline = paused ? `${paused} ${paused === 1 ? 'category has' : 'categories have'} email paused. ${quietLine(settings.quietHours)}.` : `Email is on for every category. ${quietLine(settings.quietHours)}.`;
  const summary: AskPresentationBlock = {
    type: 'SUMMARY', id: 'notification-settings-summary', title: 'Your notification settings', body: `${headline} Everything is always kept in your inbox; these settings change email only.`, headline,
    supportLine: 'Tell me what to change, for example “mute maintenance notifications”, “snooze coverage notifications for a week” or “set quiet hours from 10pm to 7am”.', tone: 'DEFAULT',
    actions: [],
  };
  const quietRow = {
    id: 'quiet-hours', title: 'Quiet hours', description: 'Email, other than safety and active-damage notices, waits until quiet hours end.', status: settings.quietHours.start ? 'On' : 'Off', entityType: null, href: null, meta: [quietLine(settings.quietHours)],
    actions: settings.quietHours.start ? [{ id: NOTIFICATION_SETTINGS_ACTION_IDS.QUIET_CLEAR, label: 'Turn off', message: notificationSettingsMessage('QUIET_CLEAR', ''), interactionType: 'MUTATE_RECORD' as const, operationId: 'NOTIFICATION_SETTINGS_COMMAND' as const, entityType: NOTIFICATION_SETTINGS_ENTITY_TYPE, entityId: 'QUIET_HOURS', style: 'QUIET' as const }] : [],
  };
  const list: AskPresentationBlock = {
    type: 'GROUPED_LIST', id: 'notification-settings-list', title: 'Settings', filters: [],
    sections: [{ id: 'quiet', title: 'Quiet hours', count: 1, items: [quietRow] }, { id: 'categories', title: 'Email by category', count: categories.length, items: categories.map(categoryRow) }], actions: [],
  };
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'notification-settings-boundary', title: 'What these settings never change',
    body: 'Safety and active-damage notices are always sent and cannot be muted. Refinance and savings email needs its own consent. Nothing is ever removed from your inbox.', severity: 'INFO', suggestions: [],
  };
  return { status: 'ANSWERED', blocks: [summary, list, boundary], suggestions: [] };
}

registerCapabilityHandler('notification.settings.overview', async (envelope) => notificationSettingsFromSettings(await getAskNotificationSettings(envelope.userId)));

// ── Changes ───────────────────────────────────────────────────────────────────────────────────────
type Change = { kind: NotificationSettingsRequest['kind']; category: string | null; days: number | null; quiet: { start: string; end: string } | null; timezone: string | null };
const versionOf = (change: Change, settings: AskNotificationSettings) => sha(`notification-settings:${JSON.stringify(change)}:${JSON.stringify(settings.quietHours)}:${JSON.stringify(settings.categories.map((c) => [c.category, c.email.mode, c.email.snoozedUntil, c.consent.granted]))}`);

function describe(change: Change, settings: AskNotificationSettings): { title: string; description: string; confirm: string; fields: Array<{ label: string; value: string }> } | { refusal: string } {
  const setting = settings.categories.find((entry) => entry.category === change.category);
  const label = setting?.label ?? '';
  if (change.kind === 'QUIET_SET') {
    return { title: 'Set quiet hours?', description: 'Email, other than safety and active-damage notices, waits until quiet hours end. Your inbox is unaffected.', confirm: 'Set quiet hours', fields: [{ label: 'Quiet hours', value: `${hhmm(change.quiet!.start)} to ${hhmm(change.quiet!.end)}` }, { label: 'Time zone', value: change.timezone ?? 'UTC' }] };
  }
  if (change.kind === 'QUIET_CLEAR') {
    if (!settings.quietHours.start) return { refusal: 'No quiet hours are set.' };
    return { title: 'Turn off quiet hours?', description: 'Email is no longer held back at any hour.', confirm: 'Turn off', fields: [{ label: 'Current quiet hours', value: quietLine(settings.quietHours) }] };
  }
  if (!setting) return { refusal: 'That notification category is not available.' };
  if (!setting.canPause && change.kind !== 'UNMUTE') return { refusal: `${label} notices are always sent so you never miss something urgent. They cannot be muted or snoozed.` };
  const needsConsent = CONSENT_REQUIRED_NOTIFICATION_CATEGORIES.includes(setting.category);
  if (change.kind === 'MUTE' || change.kind === 'SNOOZE' || change.kind === 'UNMUTE') {
    if (needsConsent && change.kind === 'UNMUTE') return { refusal: `Email for ${label.toLowerCase()} needs your consent first. Ask me to “turn on ${label.toLowerCase()} email notifications”.` };
    if (change.kind === 'MUTE' && setting.email.mode === 'MUTED') return { refusal: `${label} email is already muted.` };
    if (change.kind === 'UNMUTE' && setting.email.mode === 'ON') return { refusal: `${label} email is already on.` };
  }
  switch (change.kind) {
    case 'MUTE': return { title: `Mute ${label.toLowerCase()} email?`, description: 'These notifications keep arriving in your inbox; only email stops. You can turn it back on any time.', confirm: 'Mute email', fields: [{ label: 'Category', value: label }] };
    case 'UNMUTE': return { title: `Turn on ${label.toLowerCase()} email?`, description: 'Email resumes at this category’s usual schedule.', confirm: 'Turn on', fields: [{ label: 'Category', value: label }] };
    case 'SNOOZE': return { title: `Snooze ${label.toLowerCase()} email?`, description: 'Email pauses, then resumes by itself. Your inbox keeps receiving them.', confirm: 'Snooze email', fields: [{ label: 'Category', value: label }, { label: 'Snooze for', value: `${change.days} days (at most ${MAX_SNOOZE_DAYS})` }] };
    case 'CONSENT_GRANT': return { title: `Allow ${label.toLowerCase()} email?`, description: setting.consent.disclosure ?? 'You can turn this off any time.', confirm: 'Allow email', fields: [{ label: 'Category', value: label }] };
    default: return { title: `Stop ${label.toLowerCase()} email?`, description: 'Your consent is withdrawn and email for this category stops. In-app notices stay.', confirm: 'Stop email', fields: [{ label: 'Category', value: label }] };
  }
}

export async function notificationSettingsProposal(userId: string, propertyId: string, request: NotificationSettingsRequest, sourceExecutionId: string | null): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const settings = await getAskNotificationSettings(userId);
  const change: Change = { kind: request.kind, category: request.category, days: request.days, quiet: request.quiet, timezone: request.kind === 'QUIET_SET' ? settings.quietHours.timezone : null };
  const described = describe(change, settings);
  if ('refusal' in described) return unavailable('NOTIFICATION_SETTINGS_NOT_ALLOWED', 'That setting cannot be changed', `${described.refusal} Nothing has changed.`);
  const contextVersion = versionOf(change, settings);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `NOTIFICATION_SETTINGS_${change.kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { notificationSettingsChange: change, notificationSettingsContextVersion: contextVersion, sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'notification-settings-review', title: described.title, body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `notification-settings-${change.kind.toLowerCase()}-${sha(contextVersion).slice(0, 12)}-1`, version: 1, title: described.title, description: described.description,
      fields: described.fields, editableFields: [], confirmLabel: described.confirm, consentText: 'I authorize this change to my own notification settings.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('notification.settings.command', async (envelope) => {
  const request = parseNotificationSettingsRequest(envelope.message);
  if (!request || envelope.launchContext?.surface === 'ASK_REFRESH') {
    return unavailable('ASK_NOTIFICATION_SETTINGS_UNCLEAR', 'Tell me which notifications to change', 'For example “mute maintenance notifications”, “snooze coverage notifications for a week” or “set quiet hours from 10pm to 7am”. Nothing has changed.');
  }
  return notificationSettingsProposal(envelope.userId, envelope.propertyId!, request, envelope.launchContext?.sourceExecutionId ?? null);
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const DONE: Record<NotificationSettingsRequest['kind'], string> = {
  MUTE: 'Email muted', UNMUTE: 'Email turned on', SNOOZE: 'Email snoozed', QUIET_SET: 'Quiet hours set', QUIET_CLEAR: 'Quiet hours turned off', CONSENT_GRANT: 'Email allowed', CONSENT_REVOKE: 'Email stopped',
};

async function confirmNotificationSettings(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const change = parameters.notificationSettingsChange as Change | undefined;
  if (!change || typeof change.kind !== 'string' || !(change.kind in DONE)) throw stale('The change to make is invalid.');
  const settings = await getAskNotificationSettings(userId);
  if (parameters.notificationSettingsContextVersion !== versionOf(change, settings)) throw stale('Your notification settings changed while the confirmation was open. Review them again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  try {
    switch (change.kind) {
      case 'MUTE': await updateAskNotificationCategory(userId, change.category as string, { mode: 'MUTED' }); break;
      case 'UNMUTE': await updateAskNotificationCategory(userId, change.category as string, { mode: 'ON' }); break;
      case 'SNOOZE': await updateAskNotificationCategory(userId, change.category as string, { mode: 'SNOOZED', snoozedUntil: new Date(Date.now() + (change.days ?? 7) * 86_400_000).toISOString() }); break;
      case 'QUIET_SET': await updateAskNotificationQuietHours(userId, { start: change.quiet!.start, end: change.quiet!.end, timezone: change.timezone ?? 'UTC' }); break;
      case 'QUIET_CLEAR': await updateAskNotificationQuietHours(userId, { start: null, end: null, timezone: settings.quietHours.timezone }); break;
      case 'CONSENT_GRANT': await setAskNotificationConsent(userId, change.category as string, true); await updateAskNotificationCategory(userId, change.category as string, { mode: 'ON' }); break;
      case 'CONSENT_REVOKE': await setAskNotificationConsent(userId, change.category as string, false); break;
    }
  } catch (caught) {
    if (caught instanceof AskNotificationSettingsError) throw stale(caught.message);
    throw caught;
  }
  const label = settings.categories.find((entry) => entry.category === change.category)?.label;
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `NOTIFICATION_SETTINGS_${change.kind}_COMPLETED`,
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `notification-settings-${change.kind.toLowerCase()}`, title: DONE[change.kind], status: 'COMPLETED', description: 'Your inbox is unchanged; this affects email only.',
      details: [label ? { label: 'Category', value: label } : { label: 'Quiet hours', value: change.quiet ? `${hhmm(change.quiet.start)} to ${hhmm(change.quiet.end)}` : 'Off' }], actions: [backToSettings],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: 'notification-settings-refresh-failed', severity: 'CAUTION', title: 'Done; view could not refresh', body: 'The change was made. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'NOTIFICATION_PREFERENCE', artifactId: change.category ?? 'QUIET_HOURS', refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('notification.settings.command', confirmNotificationSettings);
