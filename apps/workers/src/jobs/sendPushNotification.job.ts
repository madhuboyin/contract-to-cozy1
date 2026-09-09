import { DeliveryStatus } from '@prisma/client';
import webPush from 'web-push';
import { prisma } from '../lib/prisma';
import { logger, AppLogger } from '../lib/logger';
import { filterDeliveriesByAggregationPolicy } from '../services/aggregationDeliveryPolicy';
import { areWorkerOutboundNotificationsEnabled } from '@worker-shared/config/workerExecutionPolicy';
import {
  type ApnsAlertPayload,
  type ApnsSendResult,
  isApnsDeliveryEnabled,
  readApnsConfig,
  sendApnsNotification,
} from '../lib/apnsClient';
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

type StoredPushDevice = { id: string; token: string };

export interface SendPushNotificationDeps {
  prisma: Pick<typeof prisma, 'notificationDelivery' | 'pushSubscription' | 'pushDevice'>;
  logger: AppLogger;
  filterDeliveriesByAggregationPolicy: typeof filterDeliveriesByAggregationPolicy;
  // Web Push (browser / installed PWA) enablement — VAPID config present.
  deliveryEnabled(): boolean;
  // APNs (native iOS) enablement — APNS_* config present. Defaults off.
  apnsEnabled(): boolean;
  send(
    subscription: webPush.PushSubscription,
    payload: string,
  ): Promise<webPush.SendResult>;
  sendApns(token: string, payload: ApnsAlertPayload): Promise<ApnsSendResult>;
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

async function sendApns(
  token: string,
  payload: ApnsAlertPayload,
): Promise<ApnsSendResult> {
  const config = readApnsConfig();
  if (!config) {
    return { ok: false, status: 0, reason: 'apns_not_configured', unregister: false };
  }
  return sendApnsNotification(token, payload, config);
}

const defaultDeps: SendPushNotificationDeps = {
  prisma,
  logger,
  filterDeliveriesByAggregationPolicy,
  deliveryEnabled: isWebPushDeliveryEnabled,
  apnsEnabled: isApnsDeliveryEnabled,
  send,
  sendApns,
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
  const webPushOn = deps.deliveryEnabled();
  const apnsOn = deps.apnsEnabled();
  if (!webPushOn && !apnsOn) {
    const reason =
      'Push delivery is disabled: neither Web Push (VAPID) nor APNs is configured.';
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

  const [subscriptions, devices] = await Promise.all([
    webPushOn
      ? deps.prisma.pushSubscription.findMany({
          where: { userId: delivery.notification.userId, revokedAt: null },
          select: { id: true, endpoint: true, p256dh: true, auth: true },
        })
      : Promise.resolve([]),
    apnsOn
      ? deps.prisma.pushDevice.findMany({
          where: {
            userId: delivery.notification.userId,
            platform: 'IOS',
            disabledAt: null,
          },
          select: { id: true, token: true },
        })
      : Promise.resolve([]),
  ]);

  if (subscriptions.length === 0 && devices.length === 0) {
    const reason = 'No active browser push subscription or registered device for this user.';
    await deps.prisma.notificationDelivery.update({
      where: { id: notificationDeliveryId },
      data: { status: DeliveryStatus.SKIPPED, failureReason: reason },
    });
    deps.logger.info(`[PUSH] Skipped delivery ${notificationDeliveryId}: ${reason}`);
    return;
  }

  const payloadObject = {
    title: delivery.notification.title,
    body: delivery.notification.message,
    url: delivery.notification.actionUrl ?? '/',
  };
  const payload = JSON.stringify(payloadObject);
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

  for (const device of devices as StoredPushDevice[]) {
    const result = await deps.sendApns(device.token, payloadObject);
    if (result.ok) {
      sentCount += 1;
      continue;
    }
    if (result.unregister) {
      await deps.prisma.pushDevice.update({
        where: { id: device.id },
        data: { disabledAt: new Date(), disabledReason: `apns_${result.reason}` },
      });
    }
    failures.push(
      result.status > 0
        ? `apns status ${result.status} (${result.reason})`
        : `apns ${result.reason}`,
    );
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

  const reason = failures.join('; ') || 'Push provider rejected delivery.';
  await deps.prisma.notificationDelivery.update({
    where: { id: notificationDeliveryId },
    data: { status: DeliveryStatus.FAILED, failureReason: reason },
  });
  throw new Error(`PUSH_DELIVERY_FAILED: ${reason}`);
}
