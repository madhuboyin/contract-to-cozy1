import { Queue } from 'bullmq';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { DEFAULT_JOB_RETENTION } from '@worker-shared/config/queueDefaults';

type DeliveryQueue = {
  add(name: string, data: unknown, opts?: unknown): Promise<unknown>;
};

type DeliveryDatabase = {
  propertyRadarNotificationDecision: {
    findMany(args: unknown): Promise<any[]>;
  };
  notificationDelivery: {
    updateMany(args: unknown): Promise<{ count: number }>;
  };
};

export type RadarNotificationDeliveryTickResult = {
  examined: number;
  enqueued: number;
  skipped: number;
  failed: number;
};

export async function radarNotificationDeliveryTick(input: {
  db?: DeliveryDatabase;
  emailQueue: DeliveryQueue;
  pushQueue: DeliveryQueue;
  now?: Date;
  batchSize: number;
  pushTransportEnabled?: boolean;
}): Promise<RadarNotificationDeliveryTickResult> {
  const db = input.db ?? prisma as any;
  const now = input.now ?? new Date();
  const decisions = await db.propertyRadarNotificationDecision.findMany({
    where: {
      notificationId: { not: null },
      OR: [
        { outcome: 'immediate' },
        { outcome: 'deferred', deferredUntil: { lte: now } },
      ],
      notification: {
        deliveries: {
          some: {
            channel: { in: ['EMAIL', 'PUSH'] },
            status: 'PENDING',
            enqueuedAt: null,
          },
        },
      },
    },
    select: {
      id: true,
      notification: {
        select: {
          deliveries: {
            where: {
              channel: { in: ['EMAIL', 'PUSH'] },
              status: 'PENDING',
              enqueuedAt: null,
            },
            select: { id: true, channel: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
    orderBy: [{ evaluatedAt: 'asc' }, { id: 'asc' }],
    take: input.batchSize,
  });

  const result: RadarNotificationDeliveryTickResult = {
    examined: 0,
    enqueued: 0,
    skipped: 0,
    failed: 0,
  };
  for (const decision of decisions) {
    for (const delivery of decision.notification?.deliveries ?? []) {
      result.examined += 1;
      if (delivery.channel === 'PUSH' && input.pushTransportEnabled !== true) {
        result.skipped += 1;
        continue;
      }
      const claimedAt = new Date();
      const claim = await db.notificationDelivery.updateMany({
        where: {
          id: delivery.id,
          status: 'PENDING',
          enqueuedAt: null,
        },
        data: { enqueuedAt: claimedAt },
      });
      if (claim.count === 0) {
        result.skipped += 1;
        continue;
      }
      const queue = delivery.channel === 'EMAIL' ? input.emailQueue : input.pushQueue;
      const jobName = delivery.channel === 'EMAIL'
        ? 'SEND_EMAIL_NOTIFICATION'
        : 'SEND_PUSH_NOTIFICATION';
      try {
        await queue.add(
          jobName,
          { notificationDeliveryId: delivery.id },
          {
            jobId: `radar-${delivery.channel.toLowerCase()}-${delivery.id}`,
            removeOnComplete: true,
            removeOnFail: false,
          },
        );
        result.enqueued += 1;
      } catch (error) {
        result.failed += 1;
        await db.notificationDelivery.updateMany({
          where: {
            id: delivery.id,
            status: 'PENDING',
            enqueuedAt: claimedAt,
          },
          data: { enqueuedAt: null },
        });
        logger.error(
          { err: error, decisionId: decision.id, deliveryId: delivery.id },
          '[RADAR-NOTIFICATION] Queue add failed; delivery claim released for retry',
        );
      }
    }
  }
  return result;
}

export function startRadarNotificationDeliveryPoller(options: {
  intervalMs?: number;
  batchSize?: number;
  redisConnection: any;
  pushTransportEnabled?: boolean;
}): () => void {
  const intervalMs = options.intervalMs ?? 10_000;
  const batchSize = options.batchSize ?? 50;
  const emailQueue = new Queue('email-notification-queue', {
    connection: options.redisConnection,
    defaultJobOptions: DEFAULT_JOB_RETENTION,
  });
  const pushQueue = new Queue('push-notification-queue', {
    connection: options.redisConnection,
    defaultJobOptions: DEFAULT_JOB_RETENTION,
  });
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const run = async () => {
    if (stopped) return;
    try {
      const result = await radarNotificationDeliveryTick({
        emailQueue,
        pushQueue,
        batchSize,
        pushTransportEnabled: options.pushTransportEnabled,
      });
      if (result.examined > 0) {
        logger.info(
          result,
          '[RADAR-NOTIFICATION] Delivery dispatch tick completed',
        );
      }
    } catch (error) {
      logger.error({ err: error }, '[RADAR-NOTIFICATION] Delivery dispatch tick failed');
    } finally {
      if (!stopped) timer = setTimeout(run, intervalMs);
    }
  };
  void run();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    void emailQueue.close();
    void pushQueue.close();
  };
}
