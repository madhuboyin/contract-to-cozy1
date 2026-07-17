import { prisma } from '../lib/prisma';
import { DeliveryStatus } from '@prisma/client';
import { logger } from '../lib/logger';
import { filterDeliveriesByAggregationPolicy } from '../services/aggregationDeliveryPolicy';

// No Twilio/WhatsApp integration exists yet. Previously this job silently
// no-op'd and BullMQ reported it as "completed" — the worker-jobs dashboard
// showed a healthy green card for a channel (documented as the high-priority
// alert channel) that never actually delivered anything. Instead we record
// the real outcome on the delivery row and fail the job loudly so it shows up
// as needing attention (and triggers job-failure alerting) until SMS is wired up.
export async function sendSmsNotificationJob(notificationDeliveryId: string) {
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
