// apps/backend/src/services/JobQueue.service.ts

import { Queue } from 'bullmq';
import * as dotenv from 'dotenv';
dotenv.config();

// Imports for Property Intelligence System
import {
  PropertyIntelligenceJobType,
  PropertyIntelligenceJobPayload,
} from '../config/risk-job-types';
import { logger } from '../lib/logger';
import { DEFAULT_JOB_RETENTION } from '../config/queueDefaults';
import { createLazyQueue } from '../lib/queuePort';
import { JOB_REGISTRY } from '../config/workerJobRegistry';
import { evaluateWorkerExecution } from '../config/workerExecutionPolicy';
import { prisma } from '../lib/prisma';

// -----------------------------------------------------------------------------
// Shared Redis Connection Configuration
// -----------------------------------------------------------------------------
const rawDb = process.env.REDIS_DB || '0';
const redisDb = /^\d+$/.test(rawDb) ? parseInt(rawDb, 10) : 0;

export const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: 6379,
  password: process.env.REDIS_PASSWORD,
  db: redisDb,
};

// -----------------------------------------------------------------------------
// Queues
// -----------------------------------------------------------------------------

// Property Intelligence Queue
export const getPropertyIntelligenceQueue = createLazyQueue<PropertyIntelligenceJobPayload>(
  () =>
    new Queue<PropertyIntelligenceJobPayload>('property-intelligence-queue', {
      connection,
      defaultJobOptions: DEFAULT_JOB_RETENTION,
    }),
);

// Email Notification Queue
// Union payload: the existing 'SEND_EMAIL_NOTIFICATION' job carries a
// notificationDeliveryId (per-user notification pipeline). The
// 'SEND_FEEDBACK_NOTIFICATION' job (added for the pilot feedback channel)
// carries a direct recipient/subject payload — it isn't tied to a User
// row or the Notification/NotificationDelivery models.
export interface EmailNotificationJobPayload {
  notificationDeliveryId?: string;
  to?: string;
  rating?: string;
  comment?: string | null;
  page?: string;
  userEmail?: string;
  userId?: string;
}

export const getEmailNotificationQueue = createLazyQueue<EmailNotificationJobPayload>(
  () =>
    new Queue<EmailNotificationJobPayload>('email-notification-queue', {
      connection,
      defaultJobOptions: DEFAULT_JOB_RETENTION,
    }),
);

// Push notification queue
interface PushNotificationJobPayload {
  notificationDeliveryId: string;
}

export const getPushNotificationQueue = createLazyQueue<PushNotificationJobPayload>(
  () =>
    new Queue<PushNotificationJobPayload>('push-notification-queue', {
      connection,
      defaultJobOptions: DEFAULT_JOB_RETENTION,
    }),
);

// SMS notification queue
interface SmsNotificationJobPayload {
  notificationDeliveryId: string;
}

export const getSmsNotificationQueue = createLazyQueue<SmsNotificationJobPayload>(
  () =>
    new Queue<SmsNotificationJobPayload>('sms-notification-queue', {
      connection,
      defaultJobOptions: DEFAULT_JOB_RETENTION,
    }),
);

// Permit History & Unpermitted Work Tracker queues
export interface PermitFetchJobPayload {
  fetchJobId: string;
  propertyId: string;
}

export interface DetectUnpermittedWorkJobPayload {
  propertyId: string;
}

export interface GeneratePermitDisclosureJobPayload {
  exportId: string;
  propertyId: string;
}

export const getPermitFetchQueue = createLazyQueue<PermitFetchJobPayload>(
  () =>
    new Queue<PermitFetchJobPayload>('permit-fetch-queue', {
      connection,
      defaultJobOptions: DEFAULT_JOB_RETENTION,
    }),
);

export const getDetectUnpermittedWorkQueue = createLazyQueue<DetectUnpermittedWorkJobPayload>(
  () =>
    new Queue<DetectUnpermittedWorkJobPayload>('detect-unpermitted-work-queue', {
      connection,
      defaultJobOptions: DEFAULT_JOB_RETENTION,
    }),
);

export const getGeneratePermitDisclosureQueue = createLazyQueue<GeneratePermitDisclosureJobPayload>(
  () =>
    new Queue<GeneratePermitDisclosureJobPayload>('generate-permit-disclosure-queue', {
      connection,
      defaultJobOptions: DEFAULT_JOB_RETENTION,
    }),
);

// -----------------------------------------------------------------------------
// Job Queue Service
// -----------------------------------------------------------------------------
export class JobQueueService {
  /**
   * Mark existing outputs stale immediately, then enqueue one deduplicated
   * refresh. Completed jobs are removed so a later canonical edit can reuse
   * the stable property-scoped job id.
   */
  public async enqueueHomeDigitalTwinRefresh(
    propertyId: string,
    reason = 'Canonical home facts changed.',
  ): Promise<void> {
    const twin = await prisma.homeDigitalTwin.findUnique({
      where: { propertyId },
      select: { id: true },
    });
    if (!twin) return;

    const staleAt = new Date();
    await prisma.$transaction([
      prisma.homeDigitalTwin.update({
        where: { id: twin.id },
        data: { status: 'STALE', staleReason: reason },
      }),
      prisma.homeTwinScenario.updateMany({
        where: { digitalTwinId: twin.id, status: 'COMPUTED' },
        data: { staleAt, staleReason: reason },
      }),
    ]);

    await getPropertyIntelligenceQueue().add(
      PropertyIntelligenceJobType.REFRESH_HOME_DIGITAL_TWIN,
      { propertyId, jobType: PropertyIntelligenceJobType.REFRESH_HOME_DIGITAL_TWIN },
      {
        jobId: `${propertyId}-HOME-DIGITAL-TWIN`,
        delay: 10_000,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
      },
    );
  }

  public async enqueueHomeDigitalTwinScenarioCompute(
    propertyId: string,
    digitalTwinId: string,
    scenarioId: string,
  ): Promise<void> {
    await getPropertyIntelligenceQueue().add(
      PropertyIntelligenceJobType.COMPUTE_HOME_DIGITAL_TWIN_SCENARIO,
      {
        propertyId,
        digitalTwinId,
        scenarioId,
        jobType: PropertyIntelligenceJobType.COMPUTE_HOME_DIGITAL_TWIN_SCENARIO,
      },
      {
        jobId: `${scenarioId}-HOME-DIGITAL-TWIN-SCENARIO`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
      },
    );
  }

  /**
   * Enqueue all Property Intelligence jobs for a property
   */
  public async enqueuePropertyIntelligenceJobs(
    propertyId: string
  ): Promise<void> {
    // Cross-cutting W4 fix: this on-demand enqueue (called from property
    // create/update, booking, warranty edits, financial reports) previously
    // bypassed evaluateWorkerExecution entirely, so a
    // WORKER_JOB_PROPERTY_INTELLIGENCE_ENABLED=false override had no effect.
    // A blocked decision is logged and skipped rather than thrown — this is
    // a background side-effect of the caller's primary action, not the
    // action itself, so it must not fail property creation/booking/etc.
    const registryEntry = JOB_REGISTRY.find((j) => j.key === 'property-intelligence');
    const decision = registryEntry
      ? evaluateWorkerExecution('property-intelligence', 'manual', registryEntry)
      : { allowed: false, reason: 'missing registry entry' };
    if (!decision.allowed) {
      logger.info(
        { propertyId, reason: decision.reason },
        '[QUEUE-MANAGER] property-intelligence enqueue skipped by worker execution policy',
      );
      return;
    }

    logger.info(
      `[QUEUE-MANAGER] Enqueueing intelligence jobs for property ${propertyId}`
    );

    const defaultOptions = {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    };

    const queue = getPropertyIntelligenceQueue();

    await queue.add(
      PropertyIntelligenceJobType.CALCULATE_RISK_REPORT,
      {
        propertyId,
        jobType: PropertyIntelligenceJobType.CALCULATE_RISK_REPORT,
      },
      {
        jobId: `${propertyId}-RISK`,
        ...defaultOptions,
      }
    );

    await queue.add(
      PropertyIntelligenceJobType.CALCULATE_FES,
      {
        propertyId,
        jobType: PropertyIntelligenceJobType.CALCULATE_FES,
      },
      {
        jobId: `${propertyId}-FES`,
        ...defaultOptions,
      }
    );

    await queue.add(
      PropertyIntelligenceJobType.CALCULATE_HIDDEN_ASSETS,
      {
        propertyId,
        jobType: PropertyIntelligenceJobType.CALCULATE_HIDDEN_ASSETS,
      },
      {
        jobId: `${propertyId}-HIDDEN-ASSETS`,
        ...defaultOptions,
      }
    );

    // One delayed, property-keyed refresh absorbs bursts of canonical edits
    // and allows the risk/FES jobs above to publish their latest inputs first.
    // BullMQ's stable job id deduplicates concurrent enqueue attempts.
    await this.enqueueHomeDigitalTwinRefresh(propertyId);

    logger.info(
      `[QUEUE-MANAGER] Risk + FES + HiddenAssets jobs enqueued for property ${propertyId}`
    );
  }

  /**
   * Compatibility wrapper
   */
  async addJob(
    jobName: PropertyIntelligenceJobType,
    data: PropertyIntelligenceJobPayload,
    options?: any
  ): Promise<void> {
    const registryEntry = JOB_REGISTRY.find((j) => j.key === 'property-intelligence');
    const decision = registryEntry
      ? evaluateWorkerExecution('property-intelligence', 'manual', registryEntry)
      : { allowed: false, reason: 'missing registry entry' };
    if (!decision.allowed) {
      logger.info(
        { jobName, reason: decision.reason },
        '[QUEUE-MANAGER] property-intelligence enqueue skipped by worker execution policy',
      );
      return;
    }

    await getPropertyIntelligenceQueue().add(
      jobName,
      data,
      {
        ...options,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      }
    );
  }
}

// -----------------------------------------------------------------------------
// Singleton Export
// -----------------------------------------------------------------------------
export default new JobQueueService();
