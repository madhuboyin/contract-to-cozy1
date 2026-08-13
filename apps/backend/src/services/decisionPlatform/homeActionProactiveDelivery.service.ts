// Ask Intelligence FRD §18, Phase 9C "external proactive delivery"
// deliverable. This module decides IF and via WHAT category a single
// top-ranked PRIORITY_LIST item (Phase 9B) may go out externally, then
// hands off to the existing NotificationService.create() -- the app's one
// notification/delivery pipeline (preferences, quiet hours, email/push
// workers) -- rather than building a second send path. This module only
// adds the things that pipeline doesn't have yet: an affirmative
// per-category/channel consent gate, a Home-Action-specific budget,
// escalation, and redaction.
//
// Gated behind both HOME_ACTION_PROACTIVE_DELIVERY_ENABLED (env, deploy-time
// default) and the DB-backed kill switch in
// homeActionProactiveDeliveryKillSwitch.service.ts (instant, no-deploy) --
// either one being off stops sends. Both are simple on/off flags, not an
// approval workflow: this product has no real users yet, so there is no
// rollout cohort or governance review to gate against, only a switch an
// admin can flip.

import { randomUUID } from 'node:crypto';
import { NotificationChannel } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { NotificationService } from '../notification.service';
import { resolveNotificationPolicy } from '../notificationPreference.service';
import { hasActiveNotificationChannelConsent } from './notificationChannelConsent.service';
import { isHomeActionProactiveDeliveryPaused } from './homeActionProactiveDeliveryKillSwitch.service';
import {
  categorizeHomeActionForNotification,
  evaluateHomeActionProactiveEligibility,
  isHomeActionProactiveEscalation,
  redactProactiveMessageBody,
  type HomeActionProactiveReasonCode,
} from './homeActionProactiveEligibilityPolicy';
import { buildPriorityListView, type ConsumerPriorityCategory, type PriorityListItemView } from './priorityListPolicy';
import { getHomeActionFeed } from '../homeActions.service';
import { getSuppressedHomeActionIds } from './homeActionUsefulnessFeedback.service';
import { createAskExecution } from '../ask/askOrchestrator.service';
import type { NotificationCategory } from '../../productFramework/notificationPolicy.contract';

export const HOME_ACTION_PROACTIVE_DAILY_BUDGET = 1;
export const HOME_ACTION_PROACTIVE_WEEKLY_BUDGET = 3;
export const HOME_ACTION_PROACTIVE_NOTIFICATION_TYPE = 'HOME_ACTION_PROACTIVE';

export function isHomeActionProactiveDeliveryEnvEnabled(): boolean {
  return process.env.HOME_ACTION_PROACTIVE_DELIVERY_ENABLED === 'true';
}

/** The single point every caller should check: env flag AND kill switch both have to allow it. */
export async function isHomeActionProactiveDeliveryActive(): Promise<boolean> {
  if (!isHomeActionProactiveDeliveryEnvEnabled()) return false;
  return !(await isHomeActionProactiveDeliveryPaused());
}

export interface HomeActionProactiveDeliveryOutcome {
  homeActionId: string;
  eligible: boolean;
  reasonCodes: HomeActionProactiveReasonCode[];
  escalationBudgetBypassed: boolean;
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
 * FRD §18.2 escalation: reads back the consumerPriority of the most recent
 * external send for this Home Action (stored in its notification metadata)
 * so a same-day PLAN_SOON -> DO_NOW jump can bypass the daily budget. No
 * prior send, or a send whose metadata predates this field, is treated as
 * "no escalation" rather than guessed at.
 */
async function getMostRecentProactiveConsumerPriority(userId: string, homeActionId: string): Promise<ConsumerPriorityCategory | null> {
  const notification = await prisma.notification.findFirst({
    where: { userId, type: HOME_ACTION_PROACTIVE_NOTIFICATION_TYPE, entityType: 'HOME_ACTION', entityId: homeActionId },
    orderBy: { createdAt: 'desc' },
    select: { metadata: true },
  });
  const metadata = notification?.metadata as Record<string, unknown> | null | undefined;
  const consumerPriority = metadata?.consumerPriority;
  return consumerPriority === 'DO_NOW' || consumerPriority === 'PLAN_SOON' ? consumerPriority : null;
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
  safetyTier: string;
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
  const rawMessage = params.item.watchState ?? `${params.item.title} is ready for your review.`;
  return NotificationService.create({
    userId: params.userId,
    type: HOME_ACTION_PROACTIVE_NOTIFICATION_TYPE,
    category: params.category,
    urgency: params.category === 'SAFETY' ? 'CRITICAL' : 'MATERIAL',
    title: redactProactiveMessageBody(params.item.title, params.safetyTier),
    message: redactProactiveMessageBody(rawMessage, params.safetyTier),
    actionUrl,
    entityType: 'HOME_ACTION',
    entityId: params.item.homeActionId,
    // Includes consumerPriority so a same-day escalation (a new, higher
    // materiality for the same item) produces a genuinely new notification
    // instead of deduping against the earlier, lower-materiality one.
    deduplicationKey: `home-action-proactive:${params.propertyId}:${params.item.homeActionId}:${isoDay}:${params.item.consumerPriority}`,
    requiredChannels: [NotificationChannel.EMAIL],
    metadata: {
      propertyId: params.propertyId,
      askSessionId: execution.sessionId,
      askExecutionId: execution.executionId,
      homeActionId: params.item.homeActionId,
      consumerPriority: params.item.consumerPriority,
    },
  });
}

/**
 * FRD §18.3 "rollback dashboard" deliverable, scoped to a monitoring log
 * (no approval workflow -- see homeActionProactiveDeliveryKillSwitch
 * .service.ts's header for why). Logs every evaluation outcome, eligible or
 * not, so an admin can see why a send did or didn't happen -- best-effort:
 * a logging failure must never block or fail the actual decision.
 */
async function logHomeActionProactiveDeliveryDecision(params: {
  propertyId: string;
  userId: string;
  category: NotificationCategory;
  outcome: HomeActionProactiveDeliveryOutcome;
}): Promise<void> {
  await prisma.homeActionProactiveDeliveryDecision.create({
    data: {
      propertyId: params.propertyId,
      userId: params.userId,
      homeActionId: params.outcome.homeActionId,
      category: params.category,
      eligible: params.outcome.eligible,
      reasonCodes: params.outcome.reasonCodes,
      escalationBudgetBypassed: params.outcome.escalationBudgetBypassed,
      notificationId: params.outcome.notificationId,
    },
  }).catch(() => undefined);
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
  if (!(await isHomeActionProactiveDeliveryActive())) return [];

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
  const [hasConsent, policy, budget, previousConsumerPriority] = await Promise.all([
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
    getMostRecentProactiveConsumerPriority(userId, item.homeActionId),
  ]);

  const channelPolicy = policy.channels.find((candidate) => candidate.channel === 'EMAIL');
  const evaluation = evaluateHomeActionProactiveEligibility({
    item: { consumerPriority: item.consumerPriority, cta: item.cta, suppressed: item.suppressed, completed: item.completed, unavailable: item.unavailable },
    hasConsent,
    channelEnabled: Boolean(channelPolicy?.enabled),
    budget,
    isEscalation: isHomeActionProactiveEscalation(previousConsumerPriority, item.consumerPriority),
  });

  if (!evaluation.eligible) {
    const outcome: HomeActionProactiveDeliveryOutcome = {
      homeActionId: item.homeActionId, eligible: false, reasonCodes: evaluation.reasonCodes, escalationBudgetBypassed: false, notificationId: null,
    };
    await logHomeActionProactiveDeliveryDecision({ propertyId, userId, category, outcome });
    return [outcome];
  }

  const notification = await createHomeActionProactiveNotification({
    userId, propertyId, item, category, safetyTier: action.governance.safetyTier,
  });
  const outcome: HomeActionProactiveDeliveryOutcome = {
    homeActionId: item.homeActionId, eligible: true, reasonCodes: evaluation.reasonCodes,
    escalationBudgetBypassed: evaluation.escalationBudgetBypassed, notificationId: notification?.id ?? null,
  };
  await logHomeActionProactiveDeliveryDecision({ propertyId, userId, category, outcome });
  return [outcome];
}
