import { Queue } from 'bullmq';
import { prisma } from '../lib/prisma';
import { DeliveryStatus, NotificationChannel } from '@prisma/client';

const QUEUE_NAME = 'email-notification-queue';
const JOB_NAME = 'SEND_EMAIL_NOTIFICATION';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function startHighPriorityEmailEnqueuePoller(opts?: {
  intervalMs?: number;
  batchSize?: number;
  redisConnection: any; // same shape you already use
}) {
  const intervalMs = opts?.intervalMs ?? 10_000;
  const batchSize = opts?.batchSize ?? 50;

  const queue = new Queue(QUEUE_NAME, { connection: opts?.redisConnection });

  let stopped = false;

  const tick = async () => {
    // Fetch PENDING email deliveries that are HIGH priority and not enqueued yet
    // @ts-ignore - enqueuedAt exists in schema but may not be in generated client types
    const deliveries = await (prisma as any).notificationDelivery.findMany({
      where: {
        channel: NotificationChannel.EMAIL,
        status: DeliveryStatus.PENDING,
        enqueuedAt: null,
        notification: {
          metadata: {
            path: ['priority'],
            equals: 'HIGH',
          },
        },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });

    if (deliveries.length === 0) return;

    // Optimistically mark as enqueued to prevent duplicates
    const ids = deliveries.map((d: { id: string }) => d.id);

    // @ts-ignore - enqueuedAt exists in schema but may not be in generated client types
    await (prisma as any).notificationDelivery.updateMany({
      where: {
        id: { in: ids },
        enqueuedAt: null,
        status: DeliveryStatus.PENDING,
      },
      data: {
        enqueuedAt: new Date(),
      },
    });

    // Enqueue jobs (idempotent at queue-level using jobId)
    // jobId prevents duplicates if poller runs twice
    await Promise.all(
      ids.map((deliveryId: string) =>
        queue.add(
          JOB_NAME,
          { notificationDeliveryId: deliveryId },
          { jobId: `email:${deliveryId}`, removeOnComplete: true, removeOnFail: false }
        )
      )
    );

    console.log(`[EMAIL-HIGH] enqueued ${ids.length} high-priority deliveries`);
  };

  const loop = async () => {
    while (!stopped) {
      try {
        await tick();
      } catch (e: any) {
        console.error('[EMAIL-HIGH] poller error', e?.message || e);
      }
      await sleep(intervalMs);
    }
  };

  void loop();

  console.log(`[EMAIL-HIGH] enqueue poller started intervalMs=${intervalMs} batchSize=${batchSize}`);

  return async () => {
    stopped = true;
    await queue.close();
  };
}
