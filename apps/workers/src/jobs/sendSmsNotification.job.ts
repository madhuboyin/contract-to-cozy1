import { prisma } from '../lib/prisma';
import { DeliveryStatus } from '@prisma/client';
import { logger, AppLogger } from '../lib/logger';
import { filterDeliveriesByAggregationPolicy } from '../services/aggregationDeliveryPolicy';

// W4 item 1: small, job-scoped dependency interface (see
// reserveFundBalanceReminder.job.ts for the pattern).
export interface SendSmsNotificationDeps {
  prisma: Pick<typeof prisma, 'notificationDelivery'>;
  logger: AppLogger;
  filterDeliveriesByAggregationPolicy: typeof filterDeliveriesByAggregationPolicy;
}

const defaultDeps: SendSmsNotificationDeps = { prisma, logger, filterDeliveriesByAggregationPolicy };

// No Twilio/WhatsApp integration exists yet. Previously this job silently
// no-op'd and BullMQ reported it as "completed" — the worker-jobs dashboard
// showed a healthy green card for a channel (documented as the high-priority
// alert channel) that never actually delivered anything. Instead we record
// the real outcome on the delivery row and fail the job loudly so it shows up
// as needing attention (and triggers job-failure alerting) until SMS is wired up.
export async function sendSmsNotificationJob(
  notificationDeliveryId: string,
  deps: SendSmsNotificationDeps = defaultDeps,
) {
  const { prisma, logger, filterDeliveriesByAggregationPolicy } = deps;
  const delivery = await prisma.notificationDelivery.findUnique({
    where: { id: notificationDeliveryId },
    include: { notification: true },
  });

  if (!delivery) return;
  if (delivery.status !== DeliveryStatus.PENDING) return;
  if (!(await filterDeliveriesByAggregationPolicy([delivery])).length) return;

  const reason = 'No SMS provider configured (Twilio) — SMS delivery is not implemented yet.';

  await prisma.notificationDelivery.update({
    where: { id: notificationDeliveryId },
    data: { status: DeliveryStatus.SKIPPED, failureReason: reason },
  });

  logger.warn(`[SMS] Skipped delivery ${notificationDeliveryId}: ${reason}`);
  throw new Error(`SMS_NOT_IMPLEMENTED: ${reason}`);
}
