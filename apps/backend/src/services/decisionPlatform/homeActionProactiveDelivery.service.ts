// Ask Intelligence FRD §18, Phase 9C "external proactive delivery"
// deliverable. This module decides IF and via WHAT category a single
// top-ranked PRIORITY_LIST item (Phase 9B) may go out externally, then
// hands off to the existing NotificationService.create() -- the app's one
// notification/delivery pipeline (preferences, quiet hours, email/push
// workers) -- rather than building a second send path. This module only
// adds the two things that pipeline doesn't have yet: an affirmative
// per-category/channel consent gate and a Home-Action-specific budget.
//
// Gated behind HOME_ACTION_PROACTIVE_DELIVERY_ENABLED, default OFF, mirroring
// WEB_PUSH_DELIVERY_ENABLED's env-flag kill switch (sendPushNotification.job
// .ts) -- this "start of Phase 9C" ships the eligibility/consent/continuity
// machinery inert by default; a DB-backed, no-deploy kill switch and a
// release-gate/rollback dashboard entry (see personalizationKillSwitch
// .service.ts and releaseGate.service.ts for the existing patterns) are
// follow-up work before this flag is ever turned on in production.

import { randomUUID } from 'node:crypto';
import { NotificationChannel } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { NotificationService } from '../notification.service';
import { resolveNotificationPolicy } from '../notificationPreference.service';
import { hasActiveNotificationChannelConsent } from './notificationChannelConsent.service';
import {
  categorizeHomeActionForNotification,
  evaluateHomeActionProactiveEligibility,
  type HomeActionProactiveReasonCode,
} from './homeActionProactiveEligibilityPolicy';
import { buildPriorityListView, type PriorityListItemView } from './priorityListPolicy';
import { getHomeActionFeed } from '../homeActions.service';
import { getSuppressedHomeActionIds } from './homeActionUsefulnessFeedback.service';
import { createAskExecution } from '../ask/askOrchestrator.service';
import type { NotificationCategory } from '../../productFramework/notificationPolicy.contract';

export const HOME_ACTION_PROACTIVE_DAILY_BUDGET = 1;
export const HOME_ACTION_PROACTIVE_WEEKLY_BUDGET = 3;
const HOME_ACTION_PROACTIVE_NOTIFICATION_TYPE = 'HOME_ACTION_PROACTIVE';

export function isHomeActionProactiveDeliveryEnabled(): boolean {
  return process.env.HOME_ACTION_PROACTIVE_DELIVERY_ENABLED === 'true';
}

export interface HomeActionProactiveDeliveryOutcome {
  homeActionId: string;
  eligible: boolean;
  reasonCodes: HomeActionProactiveReasonCode[];
  notificationId: string | null;
}

async function getHomeActionProactiveBudgetUsage(userId: string) {
  const now = Date.now();
  const [dailyCount, weeklyCount] = await Promise.all([
    prisma.notification.count({
      where: { userId, type: HOME_ACTION_PROACTIVE_NOTIFICATION_TYPE, createdAt: { gte: new Date(now - 24 * 60 * 60 * 1000) } },
    }),
    prisma.notification.count({
      where: { userId, type: HOME_ACTION_PROACTIVE_NOTIFICATION_TYPE, createdAt: { gte: new Date(now - 7 * 24 * 60 * 60 * 1000) } },
    }),
  ]);
  return { dailyCount, dailyLimit: HOME_ACTION_PROACTIVE_DAILY_BUDGET, weeklyCount, weeklyLimit: HOME_ACTION_PROACTIVE_WEEKLY_BUDGET };
}

/**
 * FRD §18.4/§21.2 "notification-to-Ask exact-execution continuity": rather
 * than inventing a deep-link mechanism, this runs the exact same Ask
 * operation a user would get by asking "What needs my attention?" --
 * creating a real, durable AskSession + AskExecution (see
 * askOrchestrator.service.ts's createAskExecution) -- so the notification's
 * link resumes the literal content it was generated from, the same way
 * apps/frontend/src/lib/notifications/destination.ts already resumes a
 * specific execution for other notification types.
 */
async function createHomeActionProactiveNotification(params: {
  userId: string;
  propertyId: string;
  item: PriorityListItemView;
  category: NotificationCategory;
}) {
  const execution = await createAskExecution(params.userId, {
    clientRequestId: `proactive:${randomUUID()}`,
    sessionId: randomUUID(),
    message: 'What needs my attention?',
    propertyId: params.propertyId,
    launchContext: { surface: 'PROACTIVE_NOTIFICATION' },
  });

  const actionUrl = `/dashboard/ask?${new URLSearchParams({
    propertyId: params.propertyId,
    sessionId: execution.sessionId,
    executionId: execution.executionId,
    from: 'notification',
  }).toString()}`;

  const isoDay = new Date().toISOString().slice(0, 10);
  return NotificationService.create({
    userId: params.userId,
    type: HOME_ACTION_PROACTIVE_NOTIFICATION_TYPE,
    category: params.category,
    urgency: params.category === 'SAFETY' ? 'CRITICAL' : 'MATERIAL',
    title: params.item.title,
    message: params.item.watchState ?? `${params.item.title} is ready for your review.`,
    actionUrl,
    entityType: 'HOME_ACTION',
    entityId: params.item.homeActionId,
    // Bounds this to at most one external send per item per day regardless
    // of how many evaluation passes run that day (FRD §18.2 dedupe).
    deduplicationKey: `home-action-proactive:${params.propertyId}:${params.item.homeActionId}:${isoDay}`,
    requiredChannels: [NotificationChannel.EMAIL],
    metadata: {
      propertyId: params.propertyId,
      askSessionId: execution.sessionId,
      askExecutionId: execution.executionId,
      homeActionId: params.item.homeActionId,
    },
  });
}

/**
 * Evaluates at most the single top-ranked eligible PRIORITY_LIST item for
 * this property/user and, only if every FRD §18.2 gate passes, sends it.
 * Deliberately conservative -- "earn permission for bounded... delivery"
 * (Phase 9C objective) reads as "prove one well-governed send at a time
 * works," not "fan out the whole feed." A future pass can loop with a
 * budget recheck between sends once that's actually needed.
 */
export async function evaluateHomeActionProactiveDeliveryForProperty(
  propertyId: string,
  userId: string,
): Promise<HomeActionProactiveDeliveryOutcome[]> {
  if (!isHomeActionProactiveDeliveryEnabled()) return [];

  const feed = await getHomeActionFeed(propertyId, userId);
  if (!feed.actions.length) return [];

  const suppressedHomeActionIds = await getSuppressedHomeActionIds({
    userId, propertyId, homeActionIds: feed.actions.map((action) => action.id),
  }).catch(() => new Set<string>());
  const view = buildPriorityListView(feed, 'EXTERNAL_PROACTIVE', { suppressedHomeActionIds });
  if (!view.items.length) return [];

  const item = view.items[0];
  const action = feed.actions.find((candidate) => candidate.id === item.homeActionId);
  if (!action) return [];

  const category = categorizeHomeActionForNotification(action);
  const [hasConsent, policy, budget] = await Promise.all([
    hasActiveNotificationChannelConsent({ userId, category, channel: 'EMAIL' }),
    resolveNotificationPolicy({
      userId, propertyId, type: HOME_ACTION_PROACTIVE_NOTIFICATION_TYPE, category,
      urgency: category === 'SAFETY' ? 'CRITICAL' : 'MATERIAL',
      // Never inherit the legacy global "email enabled" default -- like
      // REFINANCE/SAVINGS_BENEFITS, this bounded new channel requires an
      // explicit NotificationPreference row, not a blanket toggle meant for
      // routine account/workflow email.
      legacyEmailEnabled: false,
    }),
    getHomeActionProactiveBudgetUsage(userId),
  ]);

  const channelPolicy = policy.channels.find((candidate) => candidate.channel === 'EMAIL');
  const evaluation = evaluateHomeActionProactiveEligibility({
    item: { consumerPriority: item.consumerPriority, cta: item.cta, suppressed: item.suppressed, completed: item.completed, unavailable: item.unavailable },
    hasConsent,
    channelEnabled: Boolean(channelPolicy?.enabled),
    budget,
  });

  if (!evaluation.eligible) {
    return [{ homeActionId: item.homeActionId, eligible: false, reasonCodes: evaluation.reasonCodes, notificationId: null }];
  }

  const notification = await createHomeActionProactiveNotification({ userId, propertyId, item, category });
  return [{ homeActionId: item.homeActionId, eligible: true, reasonCodes: evaluation.reasonCodes, notificationId: notification?.id ?? null }];
}
