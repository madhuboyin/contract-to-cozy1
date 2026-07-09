import { prisma } from '../lib/prisma';
import { DeliveryStatus } from '@prisma/client';
import { logger } from '../lib/logger';

// No Firebase/APNs integration exists yet, and no device-token field exists on
// User either. Previously this job silently no-op'd and BullMQ reported it as
// "completed" — the worker-jobs dashboard showed a healthy green card for a
// channel that never actually delivered anything. Instead we record the real
// outcome on the delivery row and fail the job loudly so it shows up as
// needing attention (and triggers job-failure alerting) until push is wired up.
export async function sendPushNotificationJob(notificationDeliveryId: string) {
  const delivery = await prisma.notificationDelivery.findUnique({
    where: { id: notificationDeliveryId },
  });

  if (!delivery) return;
  if (delivery.status !== DeliveryStatus.PENDING) return;

  const reason = 'No push provider configured (Firebase/APNs) — push delivery is not implemented yet.';

  await prisma.notificationDelivery.update({
    where: { id: notificationDeliveryId },
    data: { status: DeliveryStatus.SKIPPED, failureReason: reason },
  });

  logger.warn(`[PUSH] Skipped delivery ${notificationDeliveryId}: ${reason}`);
  throw new Error(`PUSH_NOT_IMPLEMENTED: ${reason}`);
}
