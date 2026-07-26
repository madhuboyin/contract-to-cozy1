import { DeliveryStatus } from '@prisma/client';
import webPush from 'web-push';
import { prisma } from '../lib/prisma';
import { logger, AppLogger } from '../lib/logger';
import { filterDeliveriesByAggregationPolicy } from '../services/aggregationDeliveryPolicy';
import { areWorkerOutboundNotificationsEnabled } from '@worker-shared/config/workerExecutionPolicy';
import {
  decideRefinanceAlertRollout,
  isRefinanceNotification,
  REFINANCE_ALERT_ROLLOUT_SUPPRESSION_REASON,
} from '../lib/refinanceAlertRollout';

type StoredPushSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export interface SendPushNotificationDeps {
  prisma: Pick<typeof prisma, 'notificationDelivery' | 'pushSubscription'>;
  logger: AppLogger;
  filterDeliveriesByAggregationPolicy: typeof filterDeliveriesByAggregationPolicy;
  deliveryEnabled(): boolean;
  send(
    subscription: webPush.PushSubscription,
    payload: string,
  ): Promise<webPush.SendResult>;
  decideRefinanceAlertRollout: typeof decideRefinanceAlertRollout;
}

function isWebPushDeliveryEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env.WEB_PUSH_DELIVERY_ENABLED === 'true' &&
    areWorkerOutboundNotificationsEnabled(env) &&
    Boolean(
      env.WEB_PUSH_VAPID_SUBJECT &&
      env.WEB_PUSH_VAPID_PUBLIC_KEY &&
      env.WEB_PUSH_VAPID_PRIVATE_KEY,
    )
  );
}

async function send(
  subscription: webPush.PushSubscription,
  payload: string,
): Promise<webPush.SendResult> {
  webPush.setVapidDetails(
    process.env.WEB_PUSH_VAPID_SUBJECT!,
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY!,
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY!,
  );
  return webPush.sendNotification(subscription, payload, {
    TTL: 60 * 60,
    urgency: 'normal',
  });
}

const defaultDeps: SendPushNotificationDeps = {
  prisma,
  logger,
  filterDeliveriesByAggregationPolicy,
  deliveryEnabled: isWebPushDeliveryEnabled,
  send,
  decideRefinanceAlertRollout,
};

export async function sendPushNotificationJob(
  notificationDeliveryId: string,
  deps: SendPushNotificationDeps = defaultDeps,
) {
  const delivery = await deps.prisma.notificationDelivery.findUnique({
    where: { id: notificationDeliveryId },
    include: {
      notification: {
        include: {
          user: { select: { email: true } },
        },
      },
    },
  });

  if (!delivery) return;
  if (delivery.status !== DeliveryStatus.PENDING) return;
  if (!(await deps.filterDeliveriesByAggregationPolicy([delivery])).length) {
    return;
  }
  if (!deps.deliveryEnabled()) {
    const reason = 'Web Push delivery is disabled or VAPID configuration is incomplete.';
    await deps.prisma.notificationDelivery.update({
      where: { id: notificationDeliveryId },
      data: { status: DeliveryStatus.SKIPPED, failureReason: reason },
    });
    deps.logger.warn(`[PUSH] Skipped delivery ${notificationDeliveryId}: ${reason}`);
    throw new Error(`PUSH_NOT_CONFIGURED: ${reason}`);
  }
  if (
    isRefinanceNotification(delivery.notification) &&
    !deps.decideRefinanceAlertRollout(
      delivery.notification.user.email,
    ).allowed
  ) {
    await deps.prisma.notificationDelivery.update({
      where: { id: notificationDeliveryId },
      data: {
        status: DeliveryStatus.SKIPPED,
        failureReason: REFINANCE_ALERT_ROLLOUT_SUPPRESSION_REASON,
      },
    });
    return;
  }

  const subscriptions = await deps.prisma.pushSubscription.findMany({
    where: {
      userId: delivery.notification.userId,
      revokedAt: null,
    },
    select: {
      id: true,
      endpoint: true,
      p256dh: true,
      auth: true,
    },
  });
  if (subscriptions.length === 0) {
    const reason = 'No active browser push subscription exists for this user.';
    await deps.prisma.notificationDelivery.update({
      where: { id: notificationDeliveryId },
      data: { status: DeliveryStatus.SKIPPED, failureReason: reason },
    });
    deps.logger.info(`[PUSH] Skipped delivery ${notificationDeliveryId}: ${reason}`);
    return;
  }

  const payload = JSON.stringify({
    title: delivery.notification.title,
    body: delivery.notification.message,
    url: delivery.notification.actionUrl ?? '/',
  });
  let sentCount = 0;
  const failures: string[] = [];
  for (const subscription of subscriptions as StoredPushSubscription[]) {
    try {
      await deps.send(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        payload,
      );
      sentCount += 1;
    } catch (error) {
      const statusCode = Number(
        (error as { statusCode?: number })?.statusCode,
      );
      if (statusCode === 404 || statusCode === 410) {
        await deps.prisma.pushSubscription.update({
          where: { id: subscription.id },
          data: { revokedAt: new Date() },
        });
      }
      failures.push(
        Number.isFinite(statusCode) && statusCode > 0
          ? `provider status ${statusCode}`
          : 'provider request failed',
      );
    }
  }

  if (sentCount > 0) {
    await deps.prisma.notificationDelivery.update({
      where: { id: notificationDeliveryId },
      data: {
        status: DeliveryStatus.SENT,
        sentAt: new Date(),
        failureReason: failures.length > 0
          ? `${failures.length} device subscription(s) failed`
          : null,
      },
    });
    return;
  }

  const reason = failures.join('; ') || 'Web Push provider rejected delivery.';
  await deps.prisma.notificationDelivery.update({
    where: { id: notificationDeliveryId },
    data: { status: DeliveryStatus.FAILED, failureReason: reason },
  });
  throw new Error(`PUSH_DELIVERY_FAILED: ${reason}`);
}
