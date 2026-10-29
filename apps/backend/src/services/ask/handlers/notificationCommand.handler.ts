// Mark a notification read or unread, dismiss it, or bring it back, from the inbox answer (FRD v1.7). Reached only by the declared row
// actions. The writes are the inbox service's own (setAskNotificationRead / setAskNotificationDismissed), scoped to the caller's own
// notifications; they change only what the caller sees in their inbox, so the floor is the caller's own account.
import { createHash } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { setAskNotificationDismissed, setAskNotificationRead } from '../askNotificationInbox.service';
import { recordNotificationOutcome, revokeNotificationOutcome } from '../../notificationPreference.service';
import { NOTIFICATIONS_OVERVIEW_MESSAGE, NOTIFICATION_COMMAND_ENTITY_TYPE, NOTIFICATION_FEEDBACK_CAPTURE_KEY, notificationCommandKindFromMessage, type NotificationCommandKind } from '../support/notificationConversation';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const backToInbox = { id: 'notification-back', label: 'Back to my notifications', interactionType: 'START_WORKFLOW' as const, message: NOTIFICATIONS_OVERVIEW_MESSAGE, operationId: 'NOTIFICATIONS_OVERVIEW' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'notification-unavailable', title, body, tone: 'DEFAULT', actions: [backToInbox] }], suggestions: [],
});

interface Row { id: string; title: string; isRead: boolean; dismissedAt: Date | null; markedUseful: boolean; hiddenBy: ReadonlySet<string> }
const load = async (userId: string, id: string): Promise<Row | null> => {
  const row = await prisma.notification.findFirst({ where: { id, userId }, select: { id: true, title: true, isRead: true, dismissedAt: true, outcomes: { where: { userId, type: { in: ['USEFUL', 'NOT_RELEVANT', 'ALREADY_HANDLED'] } }, select: { type: true } } } });
  if (!row) return null;
  const types = new Set(row.outcomes.map((outcome) => String(outcome.type)));
  return { id: row.id, title: row.title, isRead: row.isRead, dismissedAt: row.dismissedAt, markedUseful: types.has('USEFUL'), hiddenBy: new Set([...types].filter((type) => type !== 'USEFUL')) };
};
const versionOf = (kind: NotificationCommandKind, row: Row) => sha(`notification:${kind}:${row.id}:${row.isRead}:${row.dismissedAt?.toISOString() ?? ''}:${row.markedUseful}:${[...row.hiddenBy].sort().join(',')}`);
const alreadyThatWay = (kind: NotificationCommandKind, row: Row) =>
  (kind === 'READ' && row.isRead) || (kind === 'UNREAD' && !row.isRead) || (kind === 'DISMISS' && row.dismissedAt !== null) || (kind === 'RESTORE' && row.dismissedAt === null)
  || (kind === 'USEFUL' && row.markedUseful) || (kind === 'USEFUL_REMOVE' && !row.markedUseful)
  || (kind === 'NOT_RELEVANT' && row.hiddenBy.has('NOT_RELEVANT')) || (kind === 'ALREADY_HANDLED' && row.hiddenBy.has('ALREADY_HANDLED')) || (kind === 'FEEDBACK_UNDO' && row.hiddenBy.size === 0);
const COPY: Record<NotificationCommandKind, { title: string; confirm: string; done: string; description: string }> = {
  READ: { title: 'Mark this notification read?', confirm: 'Mark read', done: 'Marked read', description: 'It stays in your inbox, no longer counted as unread.' },
  UNREAD: { title: 'Mark this notification unread?', confirm: 'Mark unread', done: 'Marked unread', description: 'It stays in your inbox and counts as unread again.' },
  DISMISS: { title: 'Dismiss this notification?', confirm: 'Dismiss it', done: 'Dismissed', description: 'It leaves your inbox and can be brought back from the dismissed list. Nothing else changes.' },
  RESTORE: { title: 'Bring this notification back?', confirm: 'Bring it back', done: 'Brought back', description: 'It returns to your inbox. Nothing else changes.' },
  USEFUL: { title: 'Mark this notification useful?', confirm: 'Mark useful', done: 'Marked useful', description: 'This tells Cozy this kind of notification helps you. It stays where it is and nothing else changes.' },
  USEFUL_REMOVE: { title: 'Remove your useful mark?', confirm: 'Remove mark', done: 'Useful mark removed', description: 'Cozy no longer counts this notification as helpful to you. It stays where it is and nothing else changes.' },
  NOT_RELEVANT: { title: 'Mark this notification not relevant?', confirm: 'Not relevant', done: 'Marked not relevant', description: 'It is marked read and set aside from your inbox, and Cozy learns this kind of notification is not for you. You can bring it back from the dismissed and set-aside list.' },
  ALREADY_HANDLED: { title: 'Mark this notification already handled?', confirm: 'Already handled', done: 'Marked already handled', description: 'It is marked read and set aside from your inbox, and Cozy learns you had already dealt with it. You can bring it back from the dismissed and set-aside list.' },
  FEEDBACK_UNDO: { title: 'Undo your feedback on this notification?', confirm: 'Undo feedback', done: 'Feedback undone', description: 'It comes back to your inbox, and the not-relevant or already-handled mark is removed. Whether it counts as read is left as it is.' },
  FEEDBACK: { title: 'Give feedback on this notification', confirm: 'Continue', done: 'Feedback', description: 'Choose what to tell Cozy about this notification.' },
};

/** The one Give feedback row action: what to tell Cozy about this notification, from what is already recorded for it. */
function feedbackChoice(row: Row, sourceExecutionId: string | null): AskOperationResult {
  const contextVersion = versionOf('FEEDBACK', row);
  const options = [
    row.markedUseful ? { label: 'Remove my useful mark', value: 'USEFUL_REMOVE' } : { label: 'This was useful', value: 'USEFUL' },
    ...(row.hiddenBy.has('NOT_RELEVANT') ? [] : [{ label: 'Not relevant to me', value: 'NOT_RELEVANT' }]),
    ...(row.hiddenBy.has('ALREADY_HANDLED') ? [] : [{ label: 'Already handled', value: 'ALREADY_HANDLED' }]),
    ...(row.hiddenBy.size ? [{ label: 'Undo my not-relevant or already-handled feedback', value: 'FEEDBACK_UNDO' }] : []),
  ];
  return {
    status: 'NEEDS_CONTEXT', reasonCode: 'NOTIFICATION_FEEDBACK_CHOICE_REQUIRED', contextVersion,
    parameters: { notificationFeedbackLaunch: { notificationId: row.id, sourceExecutionId } },
    blocks: [{ type: 'SUMMARY', id: 'notification-feedback', title: 'What would you like to tell Cozy about this notification?', body: 'Nothing changes until you choose and confirm.', tone: 'DEFAULT', actions: [] }],
    captureRequests: [{
      requirementId: 'notification-feedback-inputs', captureKey: NOTIFICATION_FEEDBACK_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', presentation: 'FORM', title: 'Feedback', question: row.title.slice(0, 160), helpText: null,
      inputSchema: { type: 'GROUP', fields: [{ key: 'choice', label: 'Your feedback', required: true, inputSchema: { type: 'SINGLE_SELECT', options } }] } as never,
      allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
    } as never],
    suggestions: [],
  };
}

/** The Give feedback choice, once made: the confirmation for the kind it names. */
export async function notificationFeedbackFromChoice(userId: string, propertyId: string, stored: { notificationId: string; sourceExecutionId: string | null }, choice: unknown): Promise<AskOperationResult> {
  const kinds = ['USEFUL', 'USEFUL_REMOVE', 'NOT_RELEVANT', 'ALREADY_HANDLED', 'FEEDBACK_UNDO'] as const;
  const kind = kinds.find((candidate) => candidate === choice);
  if (!kind) return unavailable('NOTIFICATION_FEEDBACK_CHOICE_INVALID', 'Choose one of the listed options', 'Nothing has changed.');
  return notificationProposal(userId, propertyId, { kind, notificationId: stored.notificationId, sourceExecutionId: stored.sourceExecutionId });
}

export async function notificationProposal(userId: string, propertyId: string, launch: { kind: NotificationCommandKind; notificationId: string; sourceExecutionId: string | null }): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const row = await load(userId, launch.notificationId);
  if (!row) return unavailable('NOTIFICATION_NOT_AVAILABLE', 'That notification is no longer available', 'Nothing has changed.');
  if (launch.kind === 'FEEDBACK') return feedbackChoice(row, launch.sourceExecutionId);
  if (alreadyThatWay(launch.kind, row)) return unavailable('NOTIFICATION_ALREADY', 'It is already that way', 'Nothing has changed.');
  const contextVersion = versionOf(launch.kind, row);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const copy = COPY[launch.kind];
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `NOTIFICATION_${launch.kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { notificationCommand: { kind: launch.kind, notificationId: row.id }, notificationContextVersion: contextVersion, sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'notification-review', title: copy.title, body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `notification-${launch.kind.toLowerCase()}-${sha(contextVersion).slice(0, 12)}-1`, version: 1, title: copy.title, description: copy.description,
      fields: [{ label: 'Notification', value: row.title.slice(0, 200) }], editableFields: [], confirmLabel: copy.confirm, consentText: 'I authorize this change to my own inbox.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('notification.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = notificationCommandKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'NOTIFICATION_COMMAND' || launch.surface === 'ASK_REFRESH' || launch.entityType !== NOTIFICATION_COMMAND_ENTITY_TYPE || !launch.entityId) {
    return unavailable('ASK_NOTIFICATION_NOT_DIRECTLY_ROUTABLE', 'Open your notifications first', 'A notification is marked, dismissed or brought back from its row. Nothing has changed.');
  }
  return notificationProposal(envelope.userId, envelope.propertyId!, { kind, notificationId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmNotification(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.notificationCommand as { kind?: unknown; notificationId?: unknown } | undefined;
  if (typeof command?.kind !== 'string' || !(command.kind in COPY) || typeof command?.notificationId !== 'string') throw stale('The change to make is invalid.');
  const kind = command.kind as NotificationCommandKind;
  const row = await load(userId, command.notificationId);
  if (!row) throw stale('That notification is no longer available.');
  if (parameters.notificationContextVersion !== versionOf(kind, row)) throw stale('This notification changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  const commandKind = kind;
  if (commandKind === 'READ' || commandKind === 'UNREAD') await setAskNotificationRead(userId, row.id, commandKind === 'READ');
  else if (commandKind === 'USEFUL') await recordNotificationOutcome(userId, row.id, 'USEFUL');
  else if (commandKind === 'USEFUL_REMOVE') await revokeNotificationOutcome(userId, row.id, 'USEFUL');
  else if (commandKind === 'NOT_RELEVANT' || commandKind === 'ALREADY_HANDLED') await recordNotificationOutcome(userId, row.id, commandKind);
  else if (commandKind === 'FEEDBACK_UNDO') { for (const type of ['NOT_RELEVANT', 'ALREADY_HANDLED'] as const) if (row.hiddenBy.has(type)) await revokeNotificationOutcome(userId, row.id, type); }
  else await setAskNotificationDismissed(userId, row.id, commandKind === 'DISMISS');
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `NOTIFICATION_${kind}_COMPLETED`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `notification-${kind.toLowerCase()}-${row.id}`, title: COPY[kind].done, status: 'COMPLETED', description: COPY[kind].description, details: [{ label: 'Notification', value: row.title.slice(0, 200) }], actions: [backToInbox] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: 'notification-refresh-failed', severity: 'CAUTION', title: 'Done; view could not refresh', body: 'The change was made. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'NOTIFICATION', artifactId: row.id, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('notification.command', confirmNotification);
