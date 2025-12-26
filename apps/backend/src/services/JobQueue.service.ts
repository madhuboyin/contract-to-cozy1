// apps/backend/src/services/JobQueue.service.ts

import { Queue, Worker, Job } from 'bullmq';
import * as dotenv from 'dotenv';
dotenv.config();

// Imports for Property Intelligence System
import {
  PropertyIntelligenceJobType,
  PropertyIntelligenceJobPayload,
} from '../config/risk-job-types';
import RiskAssessmentService from './RiskAssessment.service';
import { FinancialReportService } from './FinancialReport.service';

// -----------------------------------------------------------------------------
// Shared Redis Connection Configuration
// -----------------------------------------------------------------------------
export const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: 6379,
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0', 10),
};

// -----------------------------------------------------------------------------
// Queues
// -----------------------------------------------------------------------------

// Property Intelligence Queue
export const propertyIntelligenceQueue =
  new Queue<PropertyIntelligenceJobPayload>(
    'property-intelligence-queue',
    { connection }
  );

// Email Notification Queue
export interface EmailNotificationJobPayload {
  notificationDeliveryId: string;
}

export const emailNotificationQueue =
  new Queue<EmailNotificationJobPayload>(
    'email-notification-queue',
    { connection }
  );

// Push notification queue
interface PushNotificationJobPayload {
  notificationDeliveryId: string;
}

export const pushNotificationQueue = new Queue<PushNotificationJobPayload>(
  'push-notification-queue',
  { connection }
);

// SMS notification queue
interface SmsNotificationJobPayload {
  notificationDeliveryId: string;
}

export const smsNotificationQueue = new Queue<SmsNotificationJobPayload>(
  'sms-notification-queue',
  { connection }
);


// -----------------------------------------------------------------------------
// Services
// -----------------------------------------------------------------------------
const riskAssessmentService = RiskAssessmentService;
const financialReportService = new FinancialReportService();

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
    console.log(
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

    console.log(
      `[QUEUE-MANAGER] Risk + FES jobs enqueued for property ${propertyId}`
    );
  }

  /**
   * Worker processor for Property Intelligence jobs
   */
  private async processPropertyJob(
    job: Job<PropertyIntelligenceJobPayload>
  ): Promise<void> {
    const { propertyId, jobType } = job.data;

    try {
      switch (jobType) {
        case PropertyIntelligenceJobType.CALCULATE_RISK_REPORT:
          await riskAssessmentService.calculateAndSaveReport(propertyId);
          break;

        case PropertyIntelligenceJobType.CALCULATE_FES:
          await financialReportService.calculateAndSaveFES(propertyId);
          break;

        default:
          console.warn(`[WORKER] Unknown job type: ${jobType}`);
      }
    } catch (err: any) {
      console.error(
        `[WORKER] Job failed [${jobType}] for property ${propertyId}`,
        err.message
      );
      throw err;
    }
  }

  /**
   * Start Property Intelligence Worker
   */
  public startWorker() {
    const worker = new Worker<PropertyIntelligenceJobPayload>(
      propertyIntelligenceQueue.name,
      (job) => this.processPropertyJob(job),
      { connection, concurrency: 5 }
    );

    worker.on('completed', (job) => {
      console.log(
        `[WORKER] Job completed: ${job.id} (${job.data.jobType})`
      );
    });

    worker.on('failed', (job, err) => {
      console.error(
        `[WORKER] Job failed: ${job?.id} (${job?.data.jobType})`,
        err.message
      );
    });

    console.log(
      `[WORKER] Property Intelligence Worker started`
    );

    return worker;
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
