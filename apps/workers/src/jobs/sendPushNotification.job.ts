import { prisma } from '../lib/prisma';
import { DeliveryStatus } from '@prisma/client';
import { logger, AppLogger } from '../lib/logger';
import { filterDeliveriesByAggregationPolicy } from '../services/aggregationDeliveryPolicy';

// W4 item 1: small, job-scoped dependency interface (see
// reserveFundBalanceReminder.job.ts for the pattern).
export interface SendPushNotificationDeps {
  prisma: Pick<typeof prisma, 'notificationDelivery'>;
  logger: AppLogger;
  filterDeliveriesByAggregationPolicy: typeof filterDeliveriesByAggregationPolicy;
}

const defaultDeps: SendPushNotificationDeps = { prisma, logger, filterDeliveriesByAggregationPolicy };

// No Firebase/APNs integration exists yet, and no device-token field exists on
// User either. Previously this job silently no-op'd and BullMQ reported it as
// "completed" — the worker-jobs dashboard showed a healthy green card for a
// channel that never actually delivered anything. Instead we record the real
// outcome on the delivery row and fail the job loudly so it shows up as
// needing attention (and triggers job-failure alerting) until push is wired up.
export async function sendPushNotificationJob(
  notificationDeliveryId: string,
  deps: SendPushNotificationDeps = defaultDeps,
) {
  const { prisma, logger, filterDeliveriesByAggregationPolicy } = deps;
  const delivery = await prisma.notificationDelivery.findUnique({
    where: { id: notificationDeliveryId },
    include: { notification: true },
  });

  if (!delivery) return;
  if (delivery.status !== DeliveryStatus.PENDING) return;
  if (!(await filterDeliveriesByAggregationPolicy([delivery])).length) return;

  const reason = 'No push provider configured (Firebase/APNs) — push delivery is not implemented yet.';

  await prisma.notificationDelivery.update({
    where: { id: notificationDeliveryId },
    data: { status: DeliveryStatus.SKIPPED, failureReason: reason },
  });

  logger.warn(`[PUSH] Skipped delivery ${notificationDeliveryId}: ${reason}`);
  throw new Error(`PUSH_NOT_IMPLEMENTED: ${reason}`);
}
