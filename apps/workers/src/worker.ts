// apps/workers/src/worker.ts
import {
  Property,
  PropertyType,
  Prisma
} from '@prisma/client';
import cron from 'node-cron';
import * as dotenv from 'dotenv';
dotenv.config();
import { Worker, Queue } from 'bullmq';

import { calculateFinancialEfficiency } from '@worker-shared/utils/FinancialCalculator.util';
import { calculateHealthScore } from './utils/propertyScore.util';
import { sendEmailNotificationJob, runDailyEmailDigest, runWeeklyHomeBriefDigest } from './jobs/sendEmailNotification.job';
import { sendFeedbackNotificationJob } from './jobs/sendFeedbackNotification.job';
import { sendPushNotificationJob } from './jobs/sendPushNotification.job';
import { sendSmsNotificationJob } from './jobs/sendSmsNotification.job';
import { generateSeasonalChecklists } from './jobs/seasonalChecklistGeneration.job';
import { sendSeasonalNotifications } from './jobs/seasonalNotification.job';
import { expireSeasonalChecklists } from './jobs/seasonalChecklistExpiration.job';
import { runHomeReportExportPoller, stopHomeReportExportPoller } from './runners/homeReportExport.poller';
import { runReportExportCleanup, stopReportExportCleanup } from './runners/reportExport.cleanup';
import { runMaterialSpecExportPoller, stopMaterialSpecExportPoller } from './runners/materialSpecExport.poller';
import { runMaterialSpecExportCleanup, stopMaterialSpecExportCleanup } from './runners/materialSpecExport.cleanup';
import { startDomainEventsPoller } from './runners/domainEvents.poller';
import { startHighPriorityEmailEnqueuePoller } from './runners/highPriorityEmailEnqueue.poller';
import { startClaimFollowUpDuePoller } from './runners/claimFollowUpDue.poller';
import { alertOnJobFailure } from './lib/jobFailureAlert';
import { initCronRunHistory, recordCronRun } from './lib/cronRunHistory';
import { registerShutdownHandler, installGracefulShutdown } from './lib/gracefulShutdown';
import { validateStartupDependencies } from './lib/startupValidation';
import { acquireCronLease, releaseCronLease } from './lib/cronLease';
import { DEFAULT_JOB_RETENTION } from '@worker-shared/config/queueDefaults';
import { recallIngestJob, RECALL_INGEST_JOB } from './jobs/recallIngest.job';
import { recallMatchJob, RECALL_MATCH_JOB } from './jobs/recallMatch.job';
import { coverageLapseIncidentsJob } from './jobs/coverageLapseIncidents.job';
import { freezeRiskIncidentsJob } from './jobs/freezeRiskIncidents.job';
import { severeWeatherAlertsJob } from './jobs/severeWeatherAlerts.job';
import { cleanupInventoryDraftsJob } from './jobs/cleanupInventoryDrafts.job';
import { ingestRadarSignalsJob } from './jobs/ingestRadarSignals.job';
import { ingestTaxAssessmentEventsJob } from './jobs/ingestTaxAssessmentEvents.job';
import { ingestHomeRiskEventsJob } from './jobs/ingestHomeRiskEvents.job';
import { runHiddenAssetRefreshJob } from './jobs/hiddenAssetRefresh.job';
import { refreshNeighborhoodEventsJob } from './jobs/refreshNeighborhoodEvents.job';
import { neighborhoodChangeNotificationJob } from './jobs/neighborhoodChangeNotification.job';
import { ingestNeighborhoodDummyEventsJob } from './jobs/ingestNeighborhoodDummyEvents.job';
import { runHabitGenerationJob } from './jobs/habitGeneration.job';
import { ingestMortgageRatesJob } from './jobs/ingestMortgageRates.job';
import { runGazetteGenerationJob } from './jobs/gazetteGeneration.job';
import { runWeeklyRetentionReportJob } from './jobs/weeklyRetentionReport.job';
import { expireGuidanceSignalsJob } from './jobs/expireGuidanceSignals.job';
import { runSharedDataBackfillJob } from './jobs/sharedDataBackfill.job';
import { runSharedDataConsistencyAuditJob } from './jobs/sharedDataConsistencyAudit.job';
import { runSharedSignalRefreshJob } from './jobs/sharedSignalRefresh.job';
import { runSharedSignalHealthAuditJob } from './jobs/sharedSignalHealthAudit.job';
import { generateDiyAiGuideJob, GENERATE_DIY_AI_GUIDE_JOB } from './jobs/generateDiyAiGuide.job';
import { DIY_AI_GUIDE_QUEUE } from '@worker-shared/services/diyAiGuide.service';
import { fetchPermitHistoryJob, FETCH_PERMIT_HISTORY_JOB } from './jobs/fetchPermitHistory.job';
import { detectUnpermittedWorkJob, DETECT_UNPERMITTED_WORK_JOB } from './jobs/detectUnpermittedWork.job';
import { generatePermitDisclosureJob, GENERATE_PERMIT_DISCLOSURE_JOB } from './jobs/generatePermitDisclosure.job';
import { permitInspectionReminderJob } from './jobs/permitInspectionReminder.job';
import { recalculateReserveFundsJob } from './jobs/recalculateReserveFunds.job';
import { reserveFundReconciliationJob } from './jobs/reserveFundReconciliation.job';
import { reserveFundBalanceReminderJob } from './jobs/reserveFundBalanceReminder.job';
import { providerCredentialExpireJob } from './jobs/providerCredentialExpire.job';
import { providerCredentialLapseJob } from './jobs/providerCredentialLapse.job';
import { providerMissingCredentialSweepJob } from './jobs/providerMissingCredentialSweep.job';
import { runNewHomeWarrantyDeadlineJob } from './jobs/newHomeWarrantyDeadline.job';
import {
  processRiskCalculation,
  processFESCalculation,
  processHiddenAssetScan,
  PropertyIntelligenceJobType,
  PropertyIntelligenceJobPayload,
} from './jobs/propertyIntelligence.job';
import { captureWeeklyScoreSnapshotsJob } from './jobs/propertyScoreSnapshots.job';
import { processMaintenanceReminders } from '@worker-shared/services/maintenanceReminder.service';
import { JOB_REGISTRY, RUNNER_REGISTRY } from '@worker-shared/config/workerJobRegistry';
import {
  evaluateWorkerExecution,
  collectWorkerFlagDiagnostics,
} from '@worker-shared/config/workerExecutionPolicy';
import { areHumanPolicyApprovalsEnforced } from '@worker-shared/config/appConfig';
import { WorkerRunResult, isWorkerRunResult, deriveRunStatus } from './lib/workerRunResult';
import { prisma } from './lib/prisma';
import { HiddenAssetService } from '@worker-shared/services/hiddenAssets.service';
import RiskAssessmentService from '@worker-shared/services/RiskAssessment.service';
import { logger } from './lib/logger';
import {
  startMetricsServer,
  jobsProcessedTotal,
  jobDurationSeconds,
  jobsActiveGauge,
  cronJobRunsTotal,
  cronJobDurationSeconds,
  cronJobLastSuccessTimestamp,
} from './lib/metrics';

// =============================================================================
// FIX: Update queue configuration to match backend
// =============================================================================
const QUEUE_NAME = 'property-intelligence-queue'; // FIXED: Was 'main-background-queue'

// Redis configuration
const workerPort = 6379;
const redisHost = (process.env.REDIS_HOST && process.env.REDIS_HOST.trim() !== '')
    ? process.env.REDIS_HOST
    : 'redis.production.svc.cluster.local';

const rawDb = process.env.REDIS_DB || '0';
const redisDb = /^\d+$/.test(rawDb) ? parseInt(rawDb, 10) : 0;

const redisConnection = {
  host: redisHost,
  port: workerPort,
  db: redisDb,
  password: process.env.REDIS_PASSWORD,
};

// asNumber/getWeekStartUtc/getBandForScore/upsertPropertyScoreSnapshot/
// capturePropertyScoreSnapshots/captureWeeklyScoreSnapshotsJob moved to
// ./jobs/propertyScoreSnapshots.job.ts (W4 item 4 — testability extraction,
// no logic changes).

function inferApplianceTypeFromItem(item: {
  sourceHash?: string | null;
  tags?: string[] | null;
  name?: string | null;
}): string | null {
  const sourceHash = item.sourceHash ?? '';
  if (sourceHash.startsWith('property_appliance::')) {
    return sourceHash.replace('property_appliance::', '') || null;
  }

  const typeTag = (item.tags || []).find((tag) => tag.startsWith('APPLIANCE_TYPE:'));
  if (typeTag) {
    return typeTag.replace('APPLIANCE_TYPE:', '') || null;
  }

  const name = String(item.name || '').toLowerCase();
  if (!name) return null;
  if (name.includes('dishwasher')) return 'DISHWASHER';
  if (name.includes('refrigerator') || name.includes('fridge')) return 'REFRIGERATOR';
  if (name.includes('oven') || name.includes('range') || name.includes('stove') || name.includes('cooktop')) {
    return 'OVEN_RANGE';
  }
  if (name.includes('washer') || name.includes('dryer') || name.includes('laundry')) return 'WASHER_DRYER';
  if (name.includes('microwave') || name.includes('hood') || name.includes('vent')) return 'MICROWAVE_HOOD';
  if (name.includes('water softener') || name.includes('softener')) return 'WATER_SOFTENER';
  return null;
}

// getBandForScore/upsertPropertyScoreSnapshot/capturePropertyScoreSnapshots/
// captureWeeklyScoreSnapshotsJob moved to ./jobs/propertyScoreSnapshots.job.ts
// (W4 item 4 — testability extraction, no logic changes).

/**
 * Send maintenance reminders (WKR-001 fix).
 *
 * The previous implementation read legacy ChecklistItem rows, built email
 * text, and only logged that a reminder was "sent" — it never created a
 * notification, queued a delivery, or called the email transport, and
 * swallowed errors so the scheduler recorded a false-successful run. This
 * now delegates to the canonical PropertyMaintenanceTask-based service,
 * which creates governed NotificationService.create() notifications and
 * rejects on fatal errors instead of swallowing them.
 */
async function sendMaintenanceReminders() {
  const result = await processMaintenanceReminders();
  logger.info(
    { ...result },
    `[maintenance-reminders] examined=${result.examined} notified=${result.notified} skipped=${result.skipped} failed=${result.failed}`,
  );
  return result;
}

// processRiskCalculation/processFESCalculation/processHiddenAssetScan moved
// to ./jobs/propertyIntelligence.job.ts (W4 item 4 — testability
// extraction, no logic changes).

// =============================================================================
// REGISTRY-DRIVEN CRON SCHEDULING
// =============================================================================
// All production cron jobs are defined in:
//   apps/backend/src/config/workerJobRegistry.ts
//
// To add a new cron job:
//   1. Add an entry to JOB_REGISTRY in workerJobRegistry.ts
//   2. Add a handler here in CRON_HANDLERS (key must match registry entry key)
//
// If a registry entry has no handler → warning logged, job won't run.
// If a handler has no registry entry → warning logged, job runs but won't
// appear in the Worker Jobs admin dashboard.
// =============================================================================

const CRON_HANDLERS: Record<string, (opts?: { dryRun?: boolean; propertyId?: string }) => Promise<void | WorkerRunResult>> = {
  'maintenance-reminders':           async () => sendMaintenanceReminders(),
  'daily-email-digest':              async () => { await runDailyEmailDigest(); },
  'weekly-home-brief-digest':        async () => { await runWeeklyHomeBriefDigest(); },
  'new-home-warranty-deadlines':     async (opts) => runNewHomeWarrantyDeadlineJob(opts),
  'seasonal-checklist-expiration':   async () => { await expireSeasonalChecklists(); },
  'seasonal-checklist-generation':   async () => { await generateSeasonalChecklists(); },
  'seasonal-notifications':          async () => sendSeasonalNotifications(),
  'weekly-score-snapshots':          async () => { await captureWeeklyScoreSnapshotsJob(); },
  'hidden-asset-refresh':            async () => { await runHiddenAssetRefreshJob(); },
  'coverage-lapse-incidents':        async () => {
    const result = await coverageLapseIncidentsJob();
    logger.info({ ...result }, `[coverage-lapse-incidents] createdOrUpdated=${result.createdOrUpdated} resolved=${result.resolved}`);
  },
  'freeze-risk-incidents':           async () => { await freezeRiskIncidentsJob(); },
  'severe-weather-alerts':           async () => { await severeWeatherAlertsJob(); },
  'neighborhood-change-notifications': async () => { await neighborhoodChangeNotificationJob(); },
  'neighborhood-radar-refresh':      async () => { await refreshNeighborhoodEventsJob(); },
  'inventory-draft-cleanup':         async () => { await cleanupInventoryDraftsJob(); },
  'home-habit-generation':           async () => { await runHabitGenerationJob(); },
  'mortgage-rate-ingest':            async (opts) => {
    // Forward `opts` only when the caller actually passed one — a defined
    // opts is itself the "this was a manual/admin trigger" signal
    // ingestMortgageRatesJob uses to decide whether to tag a correlation ID.
    const result = await ingestMortgageRatesJob(opts ? { dryRun: opts.dryRun } : undefined);
    if (!result.success) {
      logger.warn({ reason: result.reason }, '[mortgage-rate-ingest] No rates ingested');
    }
    // MortgageRateIngestResult isn't WorkerRunResult-shaped (no `examined`)
    // — map it so the admin smoke checklist can still show what happened,
    // without changing the never-fails-the-run leniency this job already had.
    return {
      examined: 1,
      created: result.created ? 1 : 0,
      skipped: result.skipped ? 1 : 0,
      failed: 0,
      reason: result.reason ?? `${result.source} ${result.date ?? ''} 30yr=${result.rate30yr ?? '—'}% 15yr=${result.rate15yr ?? '—'}%`,
      smokeCorrelationId: result.smokeCorrelationId,
    };
  },
  'tax-assessment-ingest':           async () => { await ingestTaxAssessmentEventsJob(); },
  'home-gazette-generation':         async () => { await runGazetteGenerationJob(); },
  'shared-data-backfill':            async (opts) => { await runSharedDataBackfillJob(opts); },
  'shared-data-consistency-audit':   async () => { await runSharedDataConsistencyAuditJob(); },
  'shared-signal-refresh':           async () => { await runSharedSignalRefreshJob(); },
  'shared-signal-health-audit':      async () => { await runSharedSignalHealthAuditJob(); },
  'expire-guidance-signals':         async () => { await expireGuidanceSignalsJob(); },
  'permit-inspection-reminders':     async (opts) => permitInspectionReminderJob(opts),
  'reserve-fund-recalculation':      async () => { await recalculateReserveFundsJob(); },
  'reserve-fund-reconciliation':     async () => { await reserveFundReconciliationJob(); },
  'reserve-fund-balance-reminder':   async () => { await reserveFundBalanceReminderJob(); },
  'provider-credential-expire':      async () => { await providerCredentialExpireJob(); },
  'provider-credential-lapse':       async () => { await providerCredentialLapseJob(); },
  'provider-missing-credential-sweep': async () => { await providerMissingCredentialSweepJob(); },
  'weekly-retention-report':         async () => { await runWeeklyRetentionReportJob(); },
};

// Per-job cron expression overrides (env-var-based schedules)
const CRON_ENV_OVERRIDES: Record<string, string | undefined> = {
  'tax-assessment-ingest':      process.env.TAX_ASSESSMENT_INGEST_CRON,
  'inventory-draft-cleanup':    process.env.INVENTORY_DRAFT_CLEANUP_CRON,
  'home-gazette-generation':    process.env.HOME_GAZETTE_GENERATION_CRON,
  'shared-data-backfill':       process.env.SHARED_DATA_BACKFILL_CRON,
  'shared-data-consistency-audit': process.env.SHARED_DATA_CONSISTENCY_AUDIT_CRON,
  'shared-signal-refresh':      process.env.SHARED_SIGNAL_REFRESH_CRON,
  'shared-signal-health-audit': process.env.SHARED_SIGNAL_HEALTH_AUDIT_CRON,
  'reserve-fund-recalculation': process.env.RESERVE_FUND_SWEEP_CRON,
  'reserve-fund-reconciliation': process.env.RESERVE_FUND_RECONCILIATION_CRON,
};

// Crash-recovery safety net only — the lease is normally released explicitly
// right after the handler finishes (see scheduleCronJobs). Default is well
// under the tightest registry interval (severe-weather-alerts, every 15 min).
const CRON_LEASE_TTL_MS = Number(process.env.CRON_LEASE_TTL_MS) || 10 * 60 * 1000; // 10 minutes

function scheduleCronJobs(): void {
  const cronEntries = JOB_REGISTRY.filter((j) => j.type === 'cron' && j.cronExpression);
  const missingHandlerKeys: string[] = [];
  // W5 item 7: collect every scheduled task so shutdown can stop them all —
  // node-cron's own timers otherwise keep firing (and keep the event loop
  // alive) after a SIGTERM.
  const scheduledTasks: Array<{ stop: () => void }> = [];

  for (const entry of cronEntries) {
    const handler = CRON_HANDLERS[entry.key];
    if (!handler) {
      missingHandlerKeys.push(entry.key);
      logger.warn(
        `[REGISTRY] ⚠️  No handler for registry job "${entry.key}" — ` +
        `job will not run. Add it to CRON_HANDLERS in worker.ts`,
      );
      continue;
    }
    const cronExpr = CRON_ENV_OVERRIDES[entry.key] ?? entry.cronExpression;
    const task = cron.schedule(
      cronExpr,
      async () => {
        const decision = evaluateWorkerExecution(entry.key, 'scheduled', entry);
        if (!decision.allowed) {
          logger.info(`[${entry.key}] Skipped tick — ${decision.reason}`);
          await recordCronRun(entry.key, {
            status: 'skipped',
            finishedAt: Date.now(),
            durationMs: 0,
            failReason: decision.reason,
          });
          return;
        }
        const gotLease = await acquireCronLease(entry.key, CRON_LEASE_TTL_MS);
        if (!gotLease) {
          logger.debug(`[${entry.key}] Skipped tick — lease held by another replica`);
          return;
        }
        const stopTimer = cronJobDurationSeconds.startTimer({ job_key: entry.key });
        try {
          logger.info(`[${entry.key}] Starting: ${entry.name}`);
          const outcome = await handler();

          // WKR-008: a handler can opt into structured reporting by
          // resolving with a WorkerRunResult. FAILED (resolved, but
          // nothing succeeded) is treated exactly like a thrown error —
          // it must not be recorded as a false SUCCEEDED just because the
          // promise resolved.
          if (isWorkerRunResult(outcome) && deriveRunStatus(outcome) === 'FAILED') {
            throw new Error(
              outcome.reason ??
                `[${entry.key}] resolved with FAILED status (examined=${outcome.examined}, failed=${outcome.failed}, notified=${outcome.notified ?? 0})`,
            );
          }
          const runStatus = isWorkerRunResult(outcome) ? deriveRunStatus(outcome) : 'SUCCEEDED';
          const isPartial = runStatus === 'PARTIAL';

          logger.info(`[${entry.key}] ✅ Completed${isPartial ? ' (partial)' : ''}`);
          cronJobRunsTotal.inc({ job_key: entry.key, status: isPartial ? 'partial' : 'success' });
          cronJobLastSuccessTimestamp.set({ job_key: entry.key }, Date.now() / 1000);
          await recordCronRun(entry.key, {
            status: isPartial ? 'partial' : 'completed',
            finishedAt: Date.now(),
            durationMs: stopTimer() * 1000,
            failReason: isPartial
              ? (outcome as WorkerRunResult).reason ??
                `${(outcome as WorkerRunResult).failed} of ${(outcome as WorkerRunResult).examined} failed`
              : undefined,
          });
        } catch (err) {
          logger.error({ err }, `[${entry.key}] ❌ Failed`);
          cronJobRunsTotal.inc({ job_key: entry.key, status: 'failure' });
          await recordCronRun(entry.key, {
            status: 'failed',
            finishedAt: Date.now(),
            durationMs: stopTimer() * 1000,
            failReason: err instanceof Error ? err.message : String(err),
          });
        } finally {
          await releaseCronLease(entry.key);
        }
      },
      { timezone: 'America/New_York' },
    );
    scheduledTasks.push(task);
    logger.info(`[REGISTRY] Scheduled "${entry.name}" — ${cronExpr} (${entry.schedule})`);
  }

  registerShutdownHandler('registry-cron-tasks', () => {
    for (const task of scheduledTasks) task.stop();
  });

  // Warn about handlers that have no registry entry (invisible in admin UI)
  const registeredKeys = new Set(cronEntries.map((e) => e.key));
  for (const key of Object.keys(CRON_HANDLERS)) {
    if (!registeredKeys.has(key)) {
      logger.warn(
        `[REGISTRY] ⚠️  Handler exists for unregistered job "${key}" — ` +
        `add it to JOB_REGISTRY in workerJobRegistry.ts`,
      );
    }
  }

  // WKR-006: a registry entry with no handler means the admin UI and
  // operators believe a job is scheduled when it silently never runs.
  // That's tolerable in local dev (a handler may be mid-refactor) but must
  // not reach production undetected.
  if (process.env.NODE_ENV === 'production' && missingHandlerKeys.length > 0) {
    throw new Error(
      `Refusing to start in production: ${missingHandlerKeys.length} registry job(s) have no ` +
        `CRON_HANDLERS entry: ${missingHandlerKeys.join(', ')}`,
    );
  }

  logger.info(`[REGISTRY] ${cronEntries.length} cron jobs scheduled from registry`);
}

/**
 * Main worker startup function
 */
function startWorker() {
  logger.info('🚀 Worker started. Waiting for jobs...');
  // =============================================================================
  // FIX: Initialize BullMQ Worker with correct queue name and job handlers
  // =============================================================================
  const propertyIntelligenceWorker = new Worker<PropertyIntelligenceJobPayload>(
    QUEUE_NAME, // FIXED: Now matches backend queue name
    async (job) => {
      const { jobType, propertyId } = job.data;
      
      logger.info(`[WORKER] Processing Job [${jobType}] for Property [${propertyId}] (Job ID: ${job.id})`);

      try {
        // Handle different job types
        switch (jobType) {
          case PropertyIntelligenceJobType.CALCULATE_RISK_REPORT:
            await processRiskCalculation(job.data);
            break;
            
          case PropertyIntelligenceJobType.CALCULATE_FES:
            await processFESCalculation(job.data);
            break;

          case PropertyIntelligenceJobType.CALCULATE_HIDDEN_ASSETS:
            await processHiddenAssetScan(job.data);
            break;

          default:
            logger.error(`[WORKER] Unknown job type: ${jobType}`);
            throw new Error(`Unknown job type: ${jobType}`);
        }
        
        logger.info(`[WORKER] Successfully completed Job [${jobType}] for Property [${propertyId}]`);
      } catch (error) {
        logger.error({ err: error }, `[WORKER] Job [${jobType}] failed for ${propertyId}`);
        throw error;
      }
    },
    { 
      connection: redisConnection,
      concurrency: 5,
    }
  );

  // Event listeners
  propertyIntelligenceWorker.on('ready', () => {
    logger.info(`[QUEUE] Worker connected to Redis and ready to process queue: ${QUEUE_NAME}`);
  });

  propertyIntelligenceWorker.on('active', (job) => {
    jobsActiveGauge.inc({ queue: QUEUE_NAME });
    (job as unknown as Record<string, unknown>).__metricStart = process.hrtime();
  });

  propertyIntelligenceWorker.on('completed', (job) => {
    const start = (job as unknown as Record<string, unknown>).__metricStart as [number, number] | undefined;
    if (start) {
      const [sec, ns] = process.hrtime(start);
      jobDurationSeconds.observe({ queue: QUEUE_NAME, job_name: job.data.jobType }, sec + ns / 1e9);
    }
    jobsActiveGauge.dec({ queue: QUEUE_NAME });
    jobsProcessedTotal.inc({ queue: QUEUE_NAME, job_name: job.data.jobType, status: 'completed' });
    logger.info(`[QUEUE] Job ${job.id} (${job.data.jobType}) completed successfully.`);
  });

  propertyIntelligenceWorker.on('failed', (job, err) => {
    jobsActiveGauge.dec({ queue: QUEUE_NAME });
    jobsProcessedTotal.inc({ queue: QUEUE_NAME, job_name: job?.data?.jobType ?? 'unknown', status: 'failed' });
    logger.error({ err }, `[QUEUE] Job ${job?.id} (${job?.data.jobType}) failed`);
    void alertOnJobFailure(QUEUE_NAME, job, err);
  });

  propertyIntelligenceWorker.on('error', (err) => {
    logger.error({ err }, '[QUEUE] Worker experienced an error');
  });
  registerShutdownHandler('propertyIntelligenceWorker', () => propertyIntelligenceWorker.close());

  // =============================================================================
  // Email Notification Worker
  // =============================================================================
  const emailNotificationWorker = new Worker(
    'email-notification-queue',
    async (job) => {
      if (job.name === 'SEND_EMAIL_NOTIFICATION') {
        await sendEmailNotificationJob(job.data.notificationDeliveryId);
      } else if (job.name === 'SEND_FEEDBACK_NOTIFICATION') {
        await sendFeedbackNotificationJob(job.data);
      } else {
        // WKR-009: a producer/consumer name mismatch silently "completed"
        // instead of surfacing — fail loudly instead.
        throw new Error(`[EMAIL-WORKER] Unknown job name: ${job.name}`);
      }
    },
    {
      connection: redisConnection,
      concurrency: 5,
    }
  );
  logger.info(`[WORKER] Email Notification Worker started for queue: email-notification-queue`);

  emailNotificationWorker.on('ready', () => {
    logger.info('[QUEUE] Email Notification Worker ready');
  });

  emailNotificationWorker.on('completed', (job) => {
    logger.info(`[QUEUE] Email notification job ${job.id} completed`);
  });

  emailNotificationWorker.on('failed', (job, err) => {
    logger.error({ err }, `[QUEUE] Email notification job ${job?.id} failed`);
    void alertOnJobFailure('email-notification-queue', job, err);
  });

  emailNotificationWorker.on('error', (err) => {
    logger.error({ err }, '[QUEUE] Email notification worker error');
  });
  registerShutdownHandler('emailNotificationWorker', () => emailNotificationWorker.close());

  // ===============================
  // PUSH NOTIFICATIONS (WKR-010: no delivery provider is implemented yet —
  // the consumer does not start unless explicitly enabled per-job, so a
  // misdirected delivery sits harmlessly in the queue instead of being
  // claimed and marked failed/skipped for a channel nobody can deliver on.)
  // ===============================
  const pushPolicy = JOB_REGISTRY.find((j) => j.key === 'push-notification');
  if (pushPolicy && evaluateWorkerExecution('push-notification', 'poller', pushPolicy).allowed) {
    const pushWorker = new Worker(
      'push-notification-queue',
      async (job) => {
        if (job.name === 'SEND_PUSH_NOTIFICATION') {
          await sendPushNotificationJob(job.data.notificationDeliveryId);
        } else {
          throw new Error(`[PUSH-WORKER] Unknown job name: ${job.name}`);
        }
      },
      { connection: redisConnection }
    );
    logger.info(`[WORKER] Push Notification Worker started for queue: push-notification-queue`);
    pushWorker.on('failed', (job, err) => {
      logger.error({ err }, `[PUSH-WORKER] delivery ${job?.data?.notificationDeliveryId} failed`);
      void alertOnJobFailure('push-notification-queue', job, err);
    });
    registerShutdownHandler('pushWorker', () => pushWorker.close());
  } else {
    logger.info('[WORKER] Push Notification Worker not started — disabled (no delivery provider implemented; set WORKER_JOB_PUSH_NOTIFICATION_ENABLED=true once one exists)');
  }

  // ===============================
  // SMS NOTIFICATIONS (same rationale as push, above)
  // ===============================
  const smsPolicy = JOB_REGISTRY.find((j) => j.key === 'sms-notification');
  if (smsPolicy && evaluateWorkerExecution('sms-notification', 'poller', smsPolicy).allowed) {
    const smsWorker = new Worker(
      'sms-notification-queue',
      async (job) => {
        if (job.name === 'SEND_SMS_NOTIFICATION') {
          await sendSmsNotificationJob(job.data.notificationDeliveryId);
        } else {
          throw new Error(`[SMS-WORKER] Unknown job name: ${job.name}`);
        }
      },
      { connection: redisConnection }
    );
    smsWorker.on('failed', (job, err) => {
      logger.error({ err }, `[SMS-WORKER] delivery ${job?.data?.notificationDeliveryId} failed`);
      void alertOnJobFailure('sms-notification-queue', job, err);
    });
    registerShutdownHandler('smsWorker', () => smsWorker.close());
  } else {
    logger.info('[WORKER] SMS Notification Worker not started — disabled (no delivery provider implemented; set WORKER_JOB_SMS_NOTIFICATION_ENABLED=true once one exists)');
  }
  logger.info(`[WORKER] Property Intelligence Worker started for queue: ${QUEUE_NAME}`);

}

function restartAfterDelay(name: string, fn: () => Promise<void>, delayMs = 30_000) {
  fn().catch((e) => {
    logger.error({ err: e }, `${name} crashed, restarting in ${delayMs / 1000}s`);
    setTimeout(() => restartAfterDelay(name, fn, delayMs), delayMs);
  });
}

/**
 * Runner/poller startup gate (WKR-004 §4.2 — these loops previously had no
 * enablement check at all). Evaluated once at boot; a runner disabled today
 * requires a worker restart to pick up a later flag flip, same as the cron
 * scheduler's registry-driven jobs.
 */
function runnerAllowed(key: string): boolean {
  const runner = RUNNER_REGISTRY.find((r) => r.key === key);
  if (!runner) {
    logger.warn(`[RUNNER-REGISTRY] ⚠️  No RUNNER_REGISTRY entry for "${key}" — refusing to start (fail closed)`);
    return false;
  }
  const decision = evaluateWorkerExecution(key, 'poller', runner);
  if (!decision.allowed) {
    logger.info(`[${key}] Runner not started — ${decision.reason}`);
  }
  return decision.allowed;
}

if (runnerAllowed('home-report-export-poller')) {
  restartAfterDelay('Report export poller', runHomeReportExportPoller);
  registerShutdownHandler('home-report-export-poller', stopHomeReportExportPoller);
}
if (runnerAllowed('report-export-cleanup')) {
  restartAfterDelay('Report export cleanup', runReportExportCleanup);
  registerShutdownHandler('report-export-cleanup', stopReportExportCleanup);
}
if (runnerAllowed('material-spec-export-poller')) {
  restartAfterDelay('Material spec export poller', runMaterialSpecExportPoller);
  registerShutdownHandler('material-spec-export-poller', stopMaterialSpecExportPoller);
}
if (runnerAllowed('material-spec-export-cleanup')) {
  restartAfterDelay('Material spec export cleanup', runMaterialSpecExportCleanup);
  registerShutdownHandler('material-spec-export-cleanup', stopMaterialSpecExportCleanup);
}

if (runnerAllowed('high-priority-email-enqueue-poller')) {
  const stopHighPriorityEmailEnqueuePoller = startHighPriorityEmailEnqueuePoller({
    intervalMs: 10_000,
    batchSize: 50,
    redisConnection,
  });
  registerShutdownHandler('high-priority-email-enqueue-poller', stopHighPriorityEmailEnqueuePoller);
}

if (runnerAllowed('domain-events-poller')) {
  const stopDomainEventsPoller = startDomainEventsPoller({
    intervalMs: 30_000,
    batchSize: 25,
  });
  registerShutdownHandler('domain-events-poller', stopDomainEventsPoller);
}

if (runnerAllowed('claim-follow-up-due-poller')) {
  const stopClaimFollowUpDuePoller = startClaimFollowUpDuePoller({
    intervalMs: 60_000,
    batchSize: 50,
  });
  registerShutdownHandler('claim-follow-up-due-poller', stopClaimFollowUpDuePoller);
}

// =============================================================================
// RECALL JOBS: Worker and Queue setup
// =============================================================================
const RECALL_QUEUE_NAME = 'recall-jobs-queue';

const recallQueue = new Queue(RECALL_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    ...DEFAULT_JOB_RETENTION,
  }
});

const RECALL_JOB_POLICY: Record<string, string> = {
  [RECALL_INGEST_JOB]: 'recall-ingest',
  [RECALL_MATCH_JOB]: 'recall-match',
};

const recallWorker = new Worker(
  RECALL_QUEUE_NAME,
  async (job) => {
    // BullMQ workers need a "heartbeat" for long-running jobs.
    // If recallIngestJob or recallMatchJob takes > 30s, the lock expires.
    //
    // Both the repeatable schedule set up below and an admin manual trigger
    // land on this same queue/job name with no way to distinguish trigger
    // type from inside the processor, so this is evaluated as 'scheduled'
    // (the primary path) rather than attempting to special-case manual runs.
    const registryKey = RECALL_JOB_POLICY[job.name];
    const policy = registryKey ? JOB_REGISTRY.find((j) => j.key === registryKey) : undefined;
    if (registryKey && policy) {
      const decision = evaluateWorkerExecution(registryKey, 'scheduled', policy);
      if (!decision.allowed) {
        logger.info(`[${registryKey}] Skipped — ${decision.reason}`);
        return;
      }
    }

    if (job.name === RECALL_INGEST_JOB) {
      await recallIngestJob();
    } else if (job.name === RECALL_MATCH_JOB) {
      await recallMatchJob();
    } else {
      throw new Error(`[RECALL-WORKER] Unknown job name: ${job.name}`);
    }
  },
  { 
    connection: redisConnection,
    // FIX: Increase lock duration for heavy processing (default is 30s)
    lockDuration: 60000, // 60 seconds
    lockRenewTime: 20000, // Renew every 20 seconds
    concurrency: 1        // Ensure we don't ingest and match at the exact same time on one worker
  }
);

recallWorker.on('ready', () => {
  logger.info(`[RECALL-WORKER] Worker connected and ready for queue: ${RECALL_QUEUE_NAME}`);
});

recallWorker.on('completed', (job) => {
  logger.info(`[RECALL-WORKER] Job ${job.id} (${job.name}) completed successfully.`);
});

recallWorker.on('failed', (job, err) => {
  logger.error(`[RECALL-WORKER] Job ${job?.id} (${job?.name}) failed:`, err);
  void alertOnJobFailure(RECALL_QUEUE_NAME, job, err);
});

registerShutdownHandler('recallWorker', () => recallWorker.close());
registerShutdownHandler('recallQueue', () => recallQueue.close());

// Enqueue recall jobs on startup (using repeatable logic instead of manual IDs)
// This ensures only ONE instance of this job exists in the queue at a time.
async function setupScheduledJobs() {
  // Ingest: Daily at 3:00 AM
  await recallQueue.add(
    RECALL_INGEST_JOB,
    {},
    {
      repeat: { pattern: '0 3 * * *' }, // 3:00 AM daily
      jobId: 'recall-ingest-singleton'
    }
  );

  // Match: Runs shortly after ingest at 3:10 AM
  await recallQueue.add(
    RECALL_MATCH_JOB,
    {},
    {
      repeat: { pattern: '10 3 * * *' }, // 3:10 AM daily
      jobId: 'recall-match-singleton'
    }
  );
}

setupScheduledJobs().catch(logger.error);

logger.info(`[RECALL-WORKER] Recall Worker started for queue: ${RECALL_QUEUE_NAME}`);

// Coverage lapse + freeze risk incidents are scheduled via scheduleCronJobs() above.

// =============================================================================
// DIY AI GUIDE QUEUE — user-triggered Gemini guide generation
// =============================================================================
const diyAiGuideWorker = new Worker<{ guideId: string }>(
  DIY_AI_GUIDE_QUEUE,
  async (job) => {
    if (job.name === GENERATE_DIY_AI_GUIDE_JOB) {
      await generateDiyAiGuideJob(job.data.guideId);
    }
  },
  { connection: redisConnection, concurrency: 3 },
);

diyAiGuideWorker.on('ready', () => logger.info(`[DIY-GUIDE-WORKER] Ready on queue: ${DIY_AI_GUIDE_QUEUE}`));
diyAiGuideWorker.on('completed', (job) => logger.info(`[DIY-GUIDE-WORKER] Guide ${job.data.guideId} completed`));
diyAiGuideWorker.on('failed', (job, err) => {
  logger.error({ err }, `[DIY-GUIDE-WORKER] Guide ${job?.data?.guideId} failed`);
  void alertOnJobFailure(DIY_AI_GUIDE_QUEUE, job, err);
});

registerShutdownHandler('diyAiGuideWorker', () => diyAiGuideWorker.close());

// =============================================================================
// PERMIT HISTORY & UNPERMITTED WORK TRACKER — BullMQ workers
// =============================================================================

const permitFetchWorker = new Worker<{ fetchJobId: string; propertyId: string }>(
  'permit-fetch-queue',
  async (job) => {
    if (job.name === FETCH_PERMIT_HISTORY_JOB) {
      await fetchPermitHistoryJob(job.data.fetchJobId);
    }
  },
  { connection: redisConnection, concurrency: 3 },
);
permitFetchWorker.on('ready', () => logger.info('[PERMIT-FETCH-WORKER] Ready on queue: permit-fetch-queue'));
permitFetchWorker.on('completed', (job) => logger.info(`[PERMIT-FETCH-WORKER] fetchJob ${job.data.fetchJobId} completed`));
permitFetchWorker.on('failed', (job, err) => {
  logger.error({ err }, `[PERMIT-FETCH-WORKER] fetchJob ${job?.data?.fetchJobId} failed`);
  void alertOnJobFailure('permit-fetch-queue', job, err);
});
registerShutdownHandler('permitFetchWorker', () => permitFetchWorker.close());

const detectUnpermittedWorker = new Worker<{ propertyId: string }>(
  'detect-unpermitted-work-queue',
  async (job) => {
    if (job.name === DETECT_UNPERMITTED_WORK_JOB) {
      await detectUnpermittedWorkJob(job.data.propertyId);
    }
  },
  { connection: redisConnection, concurrency: 5 },
);
detectUnpermittedWorker.on('ready', () => logger.info('[DETECT-UNPERMITTED-WORKER] Ready on queue: detect-unpermitted-work-queue'));
detectUnpermittedWorker.on('completed', (job) => logger.info(`[DETECT-UNPERMITTED-WORKER] property ${job.data.propertyId} completed`));
detectUnpermittedWorker.on('failed', (job, err) => {
  logger.error({ err }, `[DETECT-UNPERMITTED-WORKER] property ${job?.data?.propertyId} failed`);
  void alertOnJobFailure('detect-unpermitted-work-queue', job, err);
});
registerShutdownHandler('detectUnpermittedWorker', () => detectUnpermittedWorker.close());

const permitDisclosureWorker = new Worker<{ exportId: string; propertyId: string }>(
  'generate-permit-disclosure-queue',
  async (job) => {
    if (job.name === GENERATE_PERMIT_DISCLOSURE_JOB) {
      await generatePermitDisclosureJob(job.data.exportId);
    }
  },
  { connection: redisConnection, concurrency: 2 },
);
permitDisclosureWorker.on('ready', () => logger.info('[PERMIT-DISCLOSURE-WORKER] Ready on queue: generate-permit-disclosure-queue'));
permitDisclosureWorker.on('completed', (job) => logger.info(`[PERMIT-DISCLOSURE-WORKER] export ${job.data.exportId} completed`));
permitDisclosureWorker.on('failed', (job, err) => {
  logger.error({ err }, `[PERMIT-DISCLOSURE-WORKER] export ${job?.data?.exportId} failed`);
  void alertOnJobFailure('generate-permit-disclosure-queue', job, err);
});
registerShutdownHandler('permitDisclosureWorker', () => permitDisclosureWorker.close());

// =============================================================================
// GUARDRAIL: QA/E2E dummy-ingest jobs must never run in production. These
// generate synthetic fixture data (RadarEvent, HomeRiskEvent, NeighborhoodEvent)
// that is indistinguishable from real signals to end users once ingested.
// A prior incident shipped RADAR_DUMMY_INGEST_ENABLED=true to the prod
// deployment manifest, seeding fake weather/risk events into production for
// real users — fail fast here instead of relying on manifest review alone.
// =============================================================================
const DUMMY_INGEST_ENV_FLAGS = [
  'RADAR_DUMMY_INGEST_ENABLED',
  'HOME_RISK_REPLAY_DUMMY_INGEST_ENABLED',
  'NEIGHBORHOOD_DUMMY_INGEST_ENABLED',
] as const;

if (process.env.NODE_ENV === 'production') {
  const enabledInProd = DUMMY_INGEST_ENV_FLAGS.filter((key) => process.env[key] === 'true');
  if (enabledInProd.length > 0) {
    logger.error(
      { enabledInProd },
      '[STARTUP-GUARDRAIL] QA/E2E dummy-ingest flags are enabled with NODE_ENV=production. ' +
        'Refusing to start — these jobs seed synthetic fixture data that is visually ' +
        'indistinguishable from real signals once ingested. Set these to "false" in the ' +
        'production deployment manifest.',
    );
    throw new Error(
      `Refusing to start: dummy-ingest flags enabled in production: ${enabledInProd.join(', ')}`,
    );
  }
}

// =============================================================================
// DUMMY RADAR INGEST (QA / E2E)
// =============================================================================
const radarDummyIngestEnabled = process.env.RADAR_DUMMY_INGEST_ENABLED === 'true';
const radarDummyIngestCron = process.env.RADAR_DUMMY_INGEST_CRON || '*/30 * * * *';

if (radarDummyIngestEnabled) {
  const radarDummyIngestTask = cron.schedule(radarDummyIngestCron, async () => {
    try {
      logger.info('[RADAR-DUMMY-INGEST] Running dummy radar ingest job...');
      await ingestRadarSignalsJob();
    } catch (err) {
      logger.error({ err }, '[RADAR-DUMMY-INGEST] Job failed');
    }
  }, { timezone: 'America/New_York' });
  registerShutdownHandler('radar-dummy-ingest-cron', () => radarDummyIngestTask.stop());

  logger.info(`[RADAR-DUMMY-INGEST] Dummy radar ingest scheduled for: ${radarDummyIngestCron} America/New_York`);

  if (process.env.RADAR_DUMMY_INGEST_RUN_ON_STARTUP === 'true') {
    void ingestRadarSignalsJob().catch((err) => {
      logger.error({ err }, '[RADAR-DUMMY-INGEST] Startup run failed');
    });
  }
}

// =============================================================================
// DUMMY HOME RISK REPLAY INGEST (QA / E2E)
// =============================================================================
const homeRiskReplayDummyIngestEnabled = process.env.HOME_RISK_REPLAY_DUMMY_INGEST_ENABLED === 'true';
const homeRiskReplayDummyIngestCron = process.env.HOME_RISK_REPLAY_DUMMY_INGEST_CRON || '15 */6 * * *';

if (homeRiskReplayDummyIngestEnabled) {
  const homeRiskReplayDummyIngestTask = cron.schedule(homeRiskReplayDummyIngestCron, async () => {
    try {
      logger.info('[HOME-RISK-INGEST] Running dummy home risk event ingest job...');
      await ingestHomeRiskEventsJob();
    } catch (err) {
      logger.error({ err }, '[HOME-RISK-INGEST] Job failed');
    }
  }, { timezone: 'America/New_York' });
  registerShutdownHandler('home-risk-replay-dummy-ingest-cron', () => homeRiskReplayDummyIngestTask.stop());

  logger.info(`[HOME-RISK-INGEST] Dummy home risk ingest scheduled for: ${homeRiskReplayDummyIngestCron} America/New_York`);

  if (process.env.HOME_RISK_REPLAY_DUMMY_INGEST_RUN_ON_STARTUP === 'true') {
    void ingestHomeRiskEventsJob().catch((err) => {
      logger.error({ err }, '[HOME-RISK-INGEST] Startup run failed');
    });
  }
}

// =============================================================================
// NEIGHBORHOOD INTELLIGENCE — Scheduled jobs
// =============================================================================

// Neighborhood change notifications + radar refresh are scheduled via scheduleCronJobs() above.

// =============================================================================
// DUMMY NEIGHBORHOOD EVENT INGEST (QA / E2E)
// =============================================================================
const neighborhoodDummyIngestEnabled = process.env.NEIGHBORHOOD_DUMMY_INGEST_ENABLED === 'true';
const neighborhoodDummyIngestCron = process.env.NEIGHBORHOOD_DUMMY_INGEST_CRON || '45 */6 * * *';

if (neighborhoodDummyIngestEnabled) {
  const neighborhoodDummyIngestTask = cron.schedule(neighborhoodDummyIngestCron, async () => {
    try {
      logger.info('[NEIGHBORHOOD-DUMMY-INGEST] Running dummy neighborhood event ingest job...');
      await ingestNeighborhoodDummyEventsJob();
    } catch (err) {
      logger.error({ err }, '[NEIGHBORHOOD-DUMMY-INGEST] Job failed');
    }
  }, { timezone: 'America/New_York' });
  registerShutdownHandler('neighborhood-dummy-ingest-cron', () => neighborhoodDummyIngestTask.stop());

  logger.info(`[NEIGHBORHOOD-DUMMY-INGEST] Dummy neighborhood ingest scheduled for: ${neighborhoodDummyIngestCron} America/New_York`);

  if (process.env.NEIGHBORHOOD_DUMMY_INGEST_RUN_ON_STARTUP === 'true') {
    void ingestNeighborhoodDummyEventsJob().catch((err) => {
      logger.error({ err }, '[NEIGHBORHOOD-DUMMY-INGEST] Startup run failed');
    });
  }
}

// =============================================================================
// INVENTORY DRAFT CLEANUP (Phase 3 hardening)
// =============================================================================
// Inventory draft cleanup + home habit generation are scheduled via scheduleCronJobs() above.

// =============================================================================
// CRON TRIGGER QUEUE — handles manual "Run Job" triggers from the admin UI
// for cron-type jobs (e.g. home-gazette-generation, mortgage-rate-ingest).
// =============================================================================

const cronTriggerWorker = new Worker(
  'cron-trigger-queue',
  async (job) => {
    const handler = CRON_HANDLERS[job.name];
    if (!handler) {
      throw new Error(`[CRON-TRIGGER] No handler registered for job: ${job.name}`);
    }
    // Defense in depth: adminWorkerJobs.service.ts#triggerJob() already
    // rejects a disallowed manual trigger before it's queued, but a job
    // already sitting in the queue when flags change (deploy, restart)
    // must not silently run once picked up.
    const registryEntry = JOB_REGISTRY.find((j) => j.key === job.name);
    if (registryEntry) {
      const decision = evaluateWorkerExecution(job.name, 'manual', registryEntry);
      if (!decision.allowed) {
        throw new Error(`[CRON-TRIGGER] Manual trigger for "${job.name}" blocked — ${decision.reason}`);
      }
    }
    const dryRun = job.data?.dryRun === true;
    // W4 item 8: same defense-in-depth reasoning as the policy check above —
    // adminWorkerJobs.service.ts#triggerJob() already rejects a dryRun
    // request for a job with no dry-run code path before queueing it, but a
    // job already sitting in the queue when the registry changes must not
    // silently run for real (or silently no-op) once picked up.
    if (dryRun && registryEntry && !registryEntry.supportsDryRun) {
      throw new Error(`[CRON-TRIGGER] Dry-run requested for "${job.name}" but it does not support dry-run`);
    }
    const propertyId: string | undefined =
      typeof job.data?.propertyId === 'string' && job.data.propertyId ? job.data.propertyId : undefined;
    // W6 item 2/5: same defense-in-depth reasoning — a scoped smoke run's
    // property allowlist membership is re-checked at the job/service layer
    // too (see permitInspectionReminderJob / processNewHomeWarrantyDeadlines),
    // but a job that doesn't declare supportsPropertyScope at all shouldn't
    // silently ignore a propertyId a caller thought was scoping the run.
    if (propertyId && registryEntry && !registryEntry.supportsPropertyScope) {
      throw new Error(`[CRON-TRIGGER] propertyId requested for "${job.name}" but it does not support property scope`);
    }
    logger.info(`[CRON-TRIGGER] Running manually triggered job: ${job.name}${dryRun ? ' (dry run)' : ''}${propertyId ? ` (property ${propertyId})` : ''}`);
    const outcome = await handler({ dryRun, propertyId });
    if (isWorkerRunResult(outcome) && deriveRunStatus(outcome) === 'FAILED') {
      throw new Error(
        outcome.reason ??
          `[CRON-TRIGGER] "${job.name}" resolved with FAILED status (examined=${outcome.examined}, failed=${outcome.failed})`,
      );
    }
    return outcome;
  },
  {
    connection: redisConnection,
    lockDuration: 300000, // 5 minutes — gazette generation can be slow
    lockRenewTime: 60000,
    concurrency: 1,
  },
);

cronTriggerWorker.on('active', (job) => {
  jobsActiveGauge.inc({ queue: 'cron-trigger-queue' });
  (job as unknown as Record<string, unknown>).__metricStart = process.hrtime();
});

cronTriggerWorker.on('completed', (job) => {
  const start = (job as unknown as Record<string, unknown>).__metricStart as [number, number] | undefined;
  if (start) {
    const [sec, ns] = process.hrtime(start);
    jobDurationSeconds.observe({ queue: 'cron-trigger-queue', job_name: job.name }, sec + ns / 1e9);
  }
  jobsActiveGauge.dec({ queue: 'cron-trigger-queue' });
  jobsProcessedTotal.inc({ queue: 'cron-trigger-queue', job_name: job.name, status: 'completed' });
  logger.info(`[CRON-TRIGGER] Job ${job.id} (${job.name}) completed successfully.`);
});

cronTriggerWorker.on('failed', (job, err) => {
  jobsActiveGauge.dec({ queue: 'cron-trigger-queue' });
  jobsProcessedTotal.inc({ queue: 'cron-trigger-queue', job_name: job?.name ?? 'unknown', status: 'failed' });
  logger.error(`[CRON-TRIGGER] Job ${job?.id} (${job?.name}) failed:`, err);
  void alertOnJobFailure('cron-trigger-queue', job, err);
});
registerShutdownHandler('cronTriggerWorker', () => cronTriggerWorker.close());

// =============================================================================
// STARTUP DIAGNOSTICS — WKR-004/WKR-005: make the effective worker execution
// policy visible in logs at boot, and flag malformed flag values (anything
// other than the exact strings "true"/"false") instead of silently falling
// back to the beta default.
// =============================================================================
(function logWorkerGovernanceDiagnostics() {
  const diagnostics = collectWorkerFlagDiagnostics();
  for (const d of diagnostics) {
    const line = `[GOVERNANCE] ${d.key}=${d.resolved}${d.rawValue === undefined ? ' (default)' : ''}`;
    if (d.malformed) {
      logger.warn(`${line} — malformed raw value "${d.rawValue}" ignored, using default`);
    } else {
      logger.info(line);
    }
  }
  logger.info(`[GOVERNANCE] ENFORCE_HUMAN_POLICY_APPROVALS=${areHumanPolicyApprovalsEnforced()}`);
})();

// W5 item 6: verify required external dependencies (DB, Redis, and —
// gated on which jobs are currently enabled — SMTP/S3/Gemini) before
// scheduling any cron work or starting the metrics server. This does not
// gate the BullMQ Workers/queues constructed earlier in this file (they're
// instantiated synchronously at module load and begin accepting jobs on
// construction — deferring that is out of scope here, see the W5
// items-1-5 shared-package epic); in production, a failed check throws so
// the process exits fast and visibly instead of limping along with a job
// class it can't actually execute.
void (async function startWorkerProcess() {
  await validateStartupDependencies();

  // Start cron jobs from registry, then start BullMQ worker
  initCronRunHistory(redisConnection);
  scheduleCronJobs();
  startWorker();
  const metricsServer = startMetricsServer();
  registerShutdownHandler('metricsServer', () => new Promise<void>((resolve) => metricsServer.close(() => resolve())));

  // W5 item 7: install the SIGTERM/SIGINT handler last, once every resource
  // above has had a chance to register itself — a signal arriving mid-boot
  // (before this line runs) is not caught, same as before this change; the
  // realistic window for that is a few hundred ms of process startup.
  installGracefulShutdown();
})();
