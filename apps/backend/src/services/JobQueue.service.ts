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
export const propertyIntelligenceQueue =
  new Queue<PropertyIntelligenceJobPayload>(
    'property-intelligence-queue',
    { connection, defaultJobOptions: DEFAULT_JOB_RETENTION }
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

export const emailNotificationQueue =
  new Queue<EmailNotificationJobPayload>(
    'email-notification-queue',
    { connection, defaultJobOptions: DEFAULT_JOB_RETENTION }
  );

// Push notification queue
interface PushNotificationJobPayload {
  notificationDeliveryId: string;
}

export const pushNotificationQueue = new Queue<PushNotificationJobPayload>(
  'push-notification-queue',
  { connection, defaultJobOptions: DEFAULT_JOB_RETENTION }
);

// SMS notification queue
interface SmsNotificationJobPayload {
  notificationDeliveryId: string;
}

export const smsNotificationQueue = new Queue<SmsNotificationJobPayload>(
  'sms-notification-queue',
  { connection, defaultJobOptions: DEFAULT_JOB_RETENTION }
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

export const permitFetchQueue = new Queue<PermitFetchJobPayload>(
  'permit-fetch-queue',
  { connection, defaultJobOptions: DEFAULT_JOB_RETENTION }
);

export const detectUnpermittedWorkQueue = new Queue<DetectUnpermittedWorkJobPayload>(
  'detect-unpermitted-work-queue',
  { connection, defaultJobOptions: DEFAULT_JOB_RETENTION }
);

export const generatePermitDisclosureQueue = new Queue<GeneratePermitDisclosureJobPayload>(
  'generate-permit-disclosure-queue',
  { connection, defaultJobOptions: DEFAULT_JOB_RETENTION }
);

// -----------------------------------------------------------------------------
// Job Queue Service
// -----------------------------------------------------------------------------
export class JobQueueService {

  /**
   * Enqueue all Property Intelligence jobs for a property
   */
  public async enqueuePropertyIntelligenceJobs(
    propertyId: string
  ): Promise<void> {
    logger.info(
      `[QUEUE-MANAGER] Enqueueing intelligence jobs for property ${propertyId}`
    );

    const defaultOptions = {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    };

    await propertyIntelligenceQueue.add(
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

    await propertyIntelligenceQueue.add(
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

    await propertyIntelligenceQueue.add(
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
    await propertyIntelligenceQueue.add(
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
