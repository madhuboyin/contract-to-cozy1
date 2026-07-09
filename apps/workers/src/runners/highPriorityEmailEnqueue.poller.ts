import { Queue } from 'bullmq';
import { prisma } from '../lib/prisma';
import { DeliveryStatus, NotificationChannel } from '@prisma/client';
import { logger } from '../lib/logger';
import { DEFAULT_JOB_RETENTION } from '../../../backend/src/config/queueDefaults';

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

  const queue = new Queue(QUEUE_NAME, {
    connection: opts?.redisConnection,
    defaultJobOptions: DEFAULT_JOB_RETENTION,
  });

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

    // Enqueue jobs individually (not a single all-or-nothing Promise.all) so one
    // failure doesn't affect the rest, and so a failed enqueue can be rolled back
    // instead of permanently orphaning the delivery. Without this, a delivery
    // whose queue.add() fails after enqueuedAt is already set in Postgres would
    // never be reconsidered by this poller again (the WHERE clause above only
    // picks up enqueuedAt: null) — confirmed live: deliveries stuck PENDING
    // forever with enqueuedAt set but no corresponding job ever in Redis.
    let succeeded = 0;
    let failed = 0;
    await Promise.all(
      ids.map(async (deliveryId: string) => {
        try {
          await queue.add(
            JOB_NAME,
            { notificationDeliveryId: deliveryId },
            // BullMQ rejects ":" in custom job IDs ("Custom Id cannot contain :") —
            // confirmed live this was silently failing every single enqueue attempt.
            { jobId: `email-${deliveryId}`, removeOnComplete: true, removeOnFail: false }
          );
          succeeded++;
        } catch (err) {
          failed++;
          logger.error(
            { err, deliveryId },
            '[EMAIL-HIGH] queue.add failed — rolling back enqueuedAt so this delivery is retried next tick'
          );
          try {
            // @ts-ignore - enqueuedAt exists in schema but may not be in generated client types
            await (prisma as any).notificationDelivery.updateMany({
              where: { id: deliveryId, enqueuedAt: { not: null } },
              data: { enqueuedAt: null },
            });
          } catch (rollbackErr) {
            logger.error(
              { err: rollbackErr, deliveryId },
              '[EMAIL-HIGH] failed to roll back enqueuedAt after a failed queue.add — this delivery may be stuck until manually reset'
            );
          }
        }
      })
    );

    logger.info(`[EMAIL-HIGH] enqueued ${succeeded} high-priority deliveries (${failed} failed, will retry)`);
  };

  const loop = async () => {
    while (!stopped) {
      try {
        await tick();
      } catch (e: any) {
        logger.error({ err: e }, '[EMAIL-HIGH] poller error');
      }
      await sleep(intervalMs);
    }
  };

  void loop();

  logger.info(`[EMAIL-HIGH] enqueue poller started intervalMs=${intervalMs} batchSize=${batchSize}`);

  return async () => {
    stopped = true;
    await queue.close();
  };
}
