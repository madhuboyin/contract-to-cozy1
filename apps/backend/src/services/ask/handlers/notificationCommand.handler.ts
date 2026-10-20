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
import { NOTIFICATIONS_OVERVIEW_MESSAGE, NOTIFICATION_COMMAND_ENTITY_TYPE, notificationCommandKindFromMessage, type NotificationCommandKind } from '../support/notificationConversation';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const backToInbox = { id: 'notification-back', label: 'Back to my notifications', interactionType: 'START_WORKFLOW' as const, message: NOTIFICATIONS_OVERVIEW_MESSAGE, operationId: 'NOTIFICATIONS_OVERVIEW' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'notification-unavailable', title, body, tone: 'DEFAULT', actions: [backToInbox] }], suggestions: [],
});

interface Row { id: string; title: string; isRead: boolean; dismissedAt: Date | null }
const load = (userId: string, id: string): Promise<Row | null> => prisma.notification.findFirst({ where: { id, userId }, select: { id: true, title: true, isRead: true, dismissedAt: true } });
const versionOf = (kind: NotificationCommandKind, row: Row) => sha(`notification:${kind}:${row.id}:${row.isRead}:${row.dismissedAt?.toISOString() ?? ''}`);
const alreadyThatWay = (kind: NotificationCommandKind, row: Row) =>
  (kind === 'READ' && row.isRead) || (kind === 'UNREAD' && !row.isRead) || (kind === 'DISMISS' && row.dismissedAt !== null) || (kind === 'RESTORE' && row.dismissedAt === null);
const COPY: Record<NotificationCommandKind, { title: string; confirm: string; done: string; description: string }> = {
  READ: { title: 'Mark this notification read?', confirm: 'Mark read', done: 'Marked read', description: 'It stays in your inbox, no longer counted as unread.' },
  UNREAD: { title: 'Mark this notification unread?', confirm: 'Mark unread', done: 'Marked unread', description: 'It stays in your inbox and counts as unread again.' },
  DISMISS: { title: 'Dismiss this notification?', confirm: 'Dismiss it', done: 'Dismissed', description: 'It leaves your inbox and can be brought back from the dismissed list. Nothing else changes.' },
  RESTORE: { title: 'Bring this notification back?', confirm: 'Bring it back', done: 'Brought back', description: 'It returns to your inbox. Nothing else changes.' },
};

export async function notificationProposal(userId: string, propertyId: string, launch: { kind: NotificationCommandKind; notificationId: string; sourceExecutionId: string | null }): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const row = await load(userId, launch.notificationId);
  if (!row) return unavailable('NOTIFICATION_NOT_AVAILABLE', 'That notification is no longer available', 'Nothing has changed.');
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
  const kind = command?.kind;
  if ((kind !== 'READ' && kind !== 'UNREAD' && kind !== 'DISMISS' && kind !== 'RESTORE') || typeof command?.notificationId !== 'string') throw stale('The change to make is invalid.');
  const row = await load(userId, command.notificationId);
  if (!row) throw stale('That notification is no longer available.');
  if (parameters.notificationContextVersion !== versionOf(kind, row)) throw stale('This notification changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  if (kind === 'READ' || kind === 'UNREAD') await setAskNotificationRead(userId, row.id, kind === 'READ');
  else await setAskNotificationDismissed(userId, row.id, kind === 'DISMISS');
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
