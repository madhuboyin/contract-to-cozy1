// The notification inbox as a conversation (Sole Homeowner Interface FRD v1.7). A deterministic read of the canonical inbox
// (`listAskNotifications`): newest first, with how many, how many are unread, and what each is about. The homeowner narrows it in words
// ("only show unread", "only show maintenance notifications", "show dismissed"); each declared chip is such a sentence, so the constraints
// live in the view state. A row that continues in Work or Saved offers Open, which asks the owning operation in this same conversation.
import { randomUUID } from 'node:crypto';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '../../../productFramework/notificationPolicy.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { containsFilterContinuation } from '../askFollowUpContext';
import { collectionDescriptor } from '../support/collectionDescriptor';
import { loadAskViewState } from './maintenance.handler';
import { prisma } from '../../../lib/prisma';
import type { AskViewState } from '../support/executionState';
import { listAskNotifications } from '../askNotificationInbox.service';
import { ASK_NOTIFICATION_MAX_LIMIT, NOTIFICATION_CATEGORY_LABELS, type AskNotificationItem, type AskNotificationPage } from '../askNotification.contract';
import { humanDate } from '../askFormatting';
import {
  NOTIFICATION_COMMAND_ACTION_IDS, NOTIFICATION_COMMAND_ENTITY_TYPE, notificationCategoryFromWords, notificationCommandMessage,
} from '../support/notificationConversation';

export const NOTIFICATIONS_PAGE_SIZE = 10;
export interface NotificationsState { dismissed: boolean; unreadOnly: boolean; category: NotificationCategory | null; limit: number }

const CLEAR_MESSAGE = 'Now show all notifications with no filters';
const CLEAR_PATTERN = /^\s*now show all notifications with no filters\b/i;
const MORE_MESSAGE = 'Now show more notifications';
const MORE_PATTERN = /\b(?:more|next|rest of the|remaining)\b.{0,12}\bnotifications?\b/i;
const UNREAD_MESSAGE = 'Only show unread notifications';
const DISMISSED_MESSAGE = 'Only show dismissed notifications';
const INBOX_MESSAGE = 'Now show notifications that are not dismissed';
const categoryChipMessage = (label: string) => `Only show ${label.toLowerCase()} notifications`;

const isCategory = (value: string | null | undefined): value is NotificationCategory => Boolean(value) && value !== 'ALL' && (NOTIFICATION_CATEGORIES as readonly string[]).includes(value as string);

/** The stored view state back as the constraints it carries (inbox/dismissed + unread in statusFilter, category in domainScopePhrase, size in dateScopePhrase). */
export function notificationsStateFromViewState(prior: AskViewState | null | undefined): NotificationsState | null {
  if (!prior || !/^(INBOX|DISMISSED)(:UNREAD)?$/.test(prior.statusFilter)) return null;
  const limit = Number(prior.dateScopePhrase);
  return {
    dismissed: prior.statusFilter.startsWith('DISMISSED'), unreadOnly: prior.statusFilter.endsWith(':UNREAD'), category: isCategory(prior.domainScopePhrase) ? prior.domainScopePhrase : null,
    limit: Number.isInteger(limit) && limit >= NOTIFICATIONS_PAGE_SIZE ? Math.min(limit, ASK_NOTIFICATION_MAX_LIMIT) : NOTIFICATIONS_PAGE_SIZE,
  };
}

/** A declared chip or a typed "only/now show" sentence continues the prior result and changes only the dimension it names; any other question is read on its own words. */
export function resolveNotificationsState(message: string, prior: AskViewState | null | undefined): { state: NotificationsState; refinement: boolean } {
  const base = notificationsStateFromViewState(prior);
  const dismissedWords = /\bdismissed\b/i.test(message) && !/\bnot dismissed\b/i.test(message);
  const fresh: NotificationsState = { dismissed: dismissedWords, unreadOnly: /\bunread\b|\bnew\b/i.test(message), category: notificationCategoryFromWords(message), limit: NOTIFICATIONS_PAGE_SIZE };
  if (base && containsFilterContinuation(message)) {
    if (CLEAR_PATTERN.test(message)) return { state: { dismissed: false, unreadOnly: false, category: null, limit: NOTIFICATIONS_PAGE_SIZE }, refinement: true };
    if (MORE_PATTERN.test(message)) return { state: { ...base, limit: Math.min(base.limit + NOTIFICATIONS_PAGE_SIZE, ASK_NOTIFICATION_MAX_LIMIT) }, refinement: true };
    const category = notificationCategoryFromWords(message);
    const unread = /\bunread\b/i.test(message);
    const view = /\bnot dismissed\b/i.test(message) ? false : /\bdismissed\b/i.test(message) ? true : null;
    if (category || unread || view !== null) {
      return { state: { dismissed: view ?? base.dismissed, unreadOnly: unread || base.unreadOnly, category: category ?? base.category, limit: NOTIFICATIONS_PAGE_SIZE }, refinement: true };
    }
  }
  return { state: fresh, refinement: false };
}

export function buildNotificationsViewState(prior: AskViewState | null | undefined, state: NotificationsState): AskViewState {
  return {
    resultId: prior?.resultId ?? randomUUID(), domainScopePhrase: state.category, dateScopePhrase: String(state.limit), roomScopePhrase: null,
    statusFilter: `${state.dismissed ? 'DISMISSED' : 'INBOX'}${state.unreadOnly ? ':UNREAD' : ''}`, selectedTaskId: null, revision: (prior?.revision ?? 0) + 1,
  };
}

/** The declared chips: unread, the categories this inbox has, the dismissed list, a way to see more, and a way back. */
export function notificationsChips(page: AskNotificationPage, state: NotificationsState) {
  const categories = page.filterOptions.categories.filter((option) => isCategory(option.value)).slice(0, 8)
    .map((option) => ({ id: `category-${option.value.toLowerCase()}`, label: option.label, message: categoryChipMessage(option.label), active: state.category === option.value }));
  return [
    { id: 'unread', label: `Unread${page.unreadCount ? ` · ${page.unreadCount}` : ''}`, message: UNREAD_MESSAGE, active: state.unreadOnly },
    ...categories,
    { id: state.dismissed ? 'show-inbox' : 'show-dismissed', label: state.dismissed ? 'Not dismissed' : `Dismissed${page.dismissedCount ? ` · ${page.dismissedCount}` : ''}`, message: state.dismissed ? INBOX_MESSAGE : DISMISSED_MESSAGE, active: false },
    ...(page.nextCursor && state.limit < ASK_NOTIFICATION_MAX_LIMIT ? [{ id: 'show-more', label: 'Show more', message: MORE_MESSAGE, active: false }] : []),
    ...(state.unreadOnly || state.category ? [{ id: 'clear-all', label: 'Clear filters', message: CLEAR_MESSAGE, active: false }] : []),
  ].slice(0, 16);
}

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function notificationRow(item: AskNotificationItem) {
  const when = humanDate(new Date(item.createdAt));
  const meta = [
    item.categoryLabel, item.propertyLabel, when, item.isRead ? null : 'Unread', item.expired ? 'Expired' : null, item.deliveryPaused ? (item.deliveryPaused === 'SNOOZED' ? 'Email snoozed' : 'Email muted') : null,
    item.propertyAccess === 'LOST' ? 'You no longer have access to this home' : null,
  ].filter((value): value is string => Boolean(value)).slice(0, 6);
  const open = item.propertyAccess === 'LOST' ? null
    : item.continuationKind === 'WORK' ? { id: 'notification-open', label: 'Open', message: 'What needs me?', interactionType: 'CONVERSATION_CONTINUE' as const, operationId: 'WORK_OVERVIEW' as const, style: 'PRIMARY' as const }
    : item.continuationKind === 'SAVED' ? { id: 'notification-open', label: 'Open', message: 'Show my saved results', interactionType: 'CONVERSATION_CONTINUE' as const, operationId: 'SAVED_RESULTS' as const, style: 'PRIMARY' as const }
    : null;
  const command = (kind: 'READ' | 'UNREAD' | 'DISMISS' | 'RESTORE', label: string) => ({
    id: NOTIFICATION_COMMAND_ACTION_IDS[kind], label, message: notificationCommandMessage(kind, item.title), interactionType: 'MUTATE_RECORD' as const, operationId: 'NOTIFICATION_COMMAND' as const,
    entityType: NOTIFICATION_COMMAND_ENTITY_TYPE, entityId: item.id, style: 'QUIET' as const,
  });
  return {
    id: item.id, title: item.title, description: truncate(item.message, 240), status: item.isRead ? null : 'Unread', entityType: null, href: null, meta,
    actions: [...(open ? [open] : []), item.dismissed ? command('RESTORE', 'Bring back') : command('DISMISS', 'Dismiss'), item.isRead ? command('UNREAD', 'Mark unread') : command('READ', 'Mark read')].slice(0, 3),
  };
}

const BOUNDARY: AskPresentationBlock = {
  type: 'BOUNDARY', id: 'notifications-boundary', title: 'Dismissing only tidies your inbox',
  body: 'Dismissing or marking read changes only what you see here. The notification, its history and its delivery are untouched, and you can bring a dismissed one back.',
  severity: 'INFO', suggestions: [],
};

/** The answer for one page of the inbox. Pure: the handler reads the page, this decides what is said. It states the count and what is being shown. */
export function notificationsFromPage(input: { page: AskNotificationPage; state: NotificationsState; viewState: AskViewState }): AskOperationResult {
  const { page, state, viewState } = input;
  const rows = page.items.slice(0, state.limit);
  const chips = notificationsChips(page, state);
  const total = page.total;
  const scope = [state.dismissed ? 'dismissed' : 'in your inbox', state.unreadOnly ? 'unread' : null, state.category ? NOTIFICATION_CATEGORY_LABELS[state.category].toLowerCase() : null].filter(Boolean).join(' · ');
  const shownLine = `Showing ${scope} · newest first.`;
  const noun = total === 1 ? 'notification' : 'notifications';
  const headline = total === 0
    ? state.dismissed ? 'Nothing is dismissed.' : state.unreadOnly || state.category ? 'No notifications match.' : 'Nothing new. Your inbox is empty.'
    : `${total} ${state.dismissed ? 'dismissed' : ''} ${noun}${!state.dismissed && !state.unreadOnly && page.unreadCount ? `, ${page.unreadCount} unread` : ''}.`.replace(/\s+/g, ' ');
  const summary: AskPresentationBlock = { type: 'SUMMARY', id: 'notifications-summary', title: headline.replace(/\.$/, ''), body: [headline, shownLine].join(' '), headline, supportLine: shownLine, tone: 'DEFAULT', actions: [] };
  if (total === 0) {
    return { status: 'ANSWERED', parameters: { viewState }, blocks: [summary, { type: 'GROUPED_LIST', id: 'notifications-list', title: 'Notifications', filters: chips, sections: [], actions: [] }, BOUNDARY], suggestions: [] };
  }
  const list: AskPresentationBlock = {
    type: 'GROUPED_LIST', id: 'notifications-list', title: state.dismissed ? 'Dismissed' : 'Notifications', filters: chips,
    sections: [{ id: 'notifications', title: state.dismissed ? 'Dismissed notifications' : 'Notifications', count: total, items: rows.map(notificationRow) }],
    collection: collectionDescriptor({ sourceTotal: total, fetchedCount: rows.length, sections: [{ items: rows }], nextPageAvailable: Boolean(page.nextCursor) && state.limit < ASK_NOTIFICATION_MAX_LIMIT }),
    actions: [],
  };
  return { status: 'ANSWERED', parameters: { viewState }, blocks: [summary, list, BOUNDARY], suggestions: [] };
}

/** The prior view only when the source execution really was an inbox lookup (another domain's view state is never continued). */
async function loadNotificationsViewState(sourceExecutionId: string | null | undefined, userId: string): Promise<AskViewState | null> {
  if (!sourceExecutionId) return null;
  const source = await prisma.askExecution.findFirst({ where: { id: sourceExecutionId, userId }, select: { operationId: true } });
  return source?.operationId === 'NOTIFICATIONS_OVERVIEW' ? loadAskViewState(sourceExecutionId, userId) : null;
}

registerCapabilityHandler('notifications.overview', async (envelope) => {
  const prior = await loadNotificationsViewState(envelope.launchContext?.sourceExecutionId, envelope.userId);
  const { state } = resolveNotificationsState(envelope.message, prior);
  const page = await listAskNotifications(envelope.userId, { view: state.dismissed ? 'DISMISSED' : 'INBOX', unreadOnly: state.unreadOnly, category: state.category, limit: state.limit });
  return notificationsFromPage({ page, state, viewState: buildNotificationsViewState(prior, state) });
});
