// apps/workers/src/worker.ts
import {
  ChecklistItemStatus,
  Property,
  Prisma
} from '@prisma/client';
import cron from 'node-cron';
import * as dotenv from 'dotenv';
dotenv.config();
import { Worker, Queue } from 'bullmq';

import { calculateFinancialEfficiency } from '../../backend/src/utils/FinancialCalculator.util';
import { calculateHealthScore } from './utils/propertyScore.util';
import { sendEmailNotificationJob, runDailyEmailDigest } from './jobs/sendEmailNotification.job';
import { sendPushNotificationJob } from './jobs/sendPushNotification.job';
import { sendSmsNotificationJob } from './jobs/sendSmsNotification.job';
import { generateSeasonalChecklists } from './jobs/seasonalChecklistGeneration.job';
import { sendSeasonalNotifications } from './jobs/seasonalNotification.job';
import { expireSeasonalChecklists } from './jobs/seasonalChecklistExpiration.job';
import { runHomeReportExportPoller } from './runners/homeReportExport.poller';
import { runReportExportCleanup } from './runners/reportExport.cleanup';
import { startDomainEventsPoller } from './runners/domainEvents.poller';
import { startHighPriorityEmailEnqueuePoller } from './runners/highPriorityEmailEnqueue.poller';
import { startClaimFollowUpDuePoller } from './runners/claimFollowUpDue.poller';
import { recallIngestJob, RECALL_INGEST_JOB } from './jobs/recallIngest.job';
import { recallMatchJob, RECALL_MATCH_JOB } from './jobs/recallMatch.job';
import { coverageLapseIncidentsJob } from './jobs/coverageLapseIncidents.job';
import { freezeRiskIncidentsJob } from './jobs/freezeRiskIncidents.job';
import { cleanupInventoryDraftsJob } from './jobs/cleanupInventoryDrafts.job';
import { ingestRadarSignalsJob } from './jobs/ingestRadarSignals.job';
import { ingestHomeRiskEventsJob } from './jobs/ingestHomeRiskEvents.job';
import { runHiddenAssetRefreshJob } from './jobs/hiddenAssetRefresh.job';
import { refreshNeighborhoodEventsJob } from './jobs/refreshNeighborhoodEvents.job';
import { neighborhoodChangeNotificationJob } from './jobs/neighborhoodChangeNotification.job';
import { ingestNeighborhoodDummyEventsJob } from './jobs/ingestNeighborhoodDummyEvents.job';
import { runHabitGenerationJob } from './jobs/habitGeneration.job';
import { ingestMortgageRatesJob } from './jobs/ingestMortgageRates.job';
import { runGazetteGenerationJob } from './jobs/gazetteGeneration.job';
import { expireGuidanceSignalsJob } from './jobs/expireGuidanceSignals.job';
import { runSharedDataBackfillJob } from './jobs/sharedDataBackfill.job';
import { runSharedDataConsistencyAuditJob } from './jobs/sharedDataConsistencyAudit.job';
import { runSharedSignalRefreshJob } from './jobs/sharedSignalRefresh.job';
import { runSharedSignalHealthAuditJob } from './jobs/sharedSignalHealthAudit.job';
import { JOB_REGISTRY } from '../../backend/src/config/workerJobRegistry';
import { prisma } from './lib/prisma';
import { HiddenAssetService } from '../../backend/src/services/hiddenAssets.service';
import RiskAssessmentService from '../../backend/src/services/RiskAssessment.service';
import { logger } from './lib/logger';
import { startMetricsServer, jobsProcessedTotal, jobDurationSeconds, jobsActiveGauge } from './lib/metrics';

const hiddenAssetService = new HiddenAssetService();

// =============================================================================
// FIX: Update queue configuration to match backend
// =============================================================================
const QUEUE_NAME = 'property-intelligence-queue'; // FIXED: Was 'main-background-queue'

// Job types enum matching backend
enum PropertyIntelligenceJobType {
  CALCULATE_RISK_REPORT = 'CALCULATE_RISK_REPORT',
  CALCULATE_FES = 'CALCULATE_FES',
  CALCULATE_HIDDEN_ASSETS = 'CALCULATE_HIDDEN_ASSETS',
}

interface PropertyIntelligenceJobPayload {
  propertyId: string;
  jobType: PropertyIntelligenceJobType;
}

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

type ScoreType = 'HEALTH' | 'RISK' | 'FINANCIAL';

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'toNumber' in (value as Record<string, unknown>)) {
    const maybe = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(maybe) ? maybe : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getWeekStartUtc(reference = new Date()): Date {
  const weekStart = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate(), 0, 0, 0, 0)
  );
  const day = (weekStart.getUTCDay() + 6) % 7; // Monday=0
  weekStart.setUTCDate(weekStart.getUTCDate() - day);
  return weekStart;
}

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

function getBandForScore(scoreType: ScoreType, score: number): string {
  if (scoreType === 'RISK') {
    if (score >= 80) return 'Low Risk';
    if (score >= 60) return 'Moderate Risk';
    if (score >= 40) return 'Elevated Risk';
    return 'High Risk';
  }

  if (scoreType === 'FINANCIAL') {
    if (score >= 90) return 'Excellent';
    if (score >= 70) return 'Average';
    return 'Below Average';
  }

  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Needs Attention';
}

async function upsertPropertyScoreSnapshot(input: {
  propertyId: string;
  homeownerProfileId: string;
  scoreType: ScoreType;
  score: number;
  scoreMax?: number | null;
  scoreBand?: string | null;
  snapshotJson?: Record<string, unknown>;
  computedAt?: Date;
  weekStart?: Date;
}) {
  const snapshotModel = (prisma as any).propertyScoreSnapshot;
  if (!snapshotModel) {
    logger.warn('[SCORE-SNAPSHOT] Prisma client missing propertyScoreSnapshot delegate. Run prisma generate.');
    return;
  }

  const {
    propertyId,
    homeownerProfileId,
    scoreType,
    score,
    scoreMax = null,
    scoreBand = null,
    snapshotJson = {},
    computedAt = new Date(),
    weekStart = getWeekStartUtc(computedAt),
  } = input;

  const existing = await snapshotModel.findFirst({
    where: {
      propertyId,
      scoreType,
      weekStart,
    },
    select: { id: true },
  });

  if (existing?.id) {
    await snapshotModel.update({
      where: { id: existing.id },
      data: {
        homeownerProfileId,
        score,
        scoreMax,
        scoreBand,
        computedAt,
        snapshotJson: snapshotJson as Prisma.InputJsonValue,
      },
    });
    return;
  }

  await snapshotModel.create({
    data: {
      propertyId,
      homeownerProfileId,
      scoreType,
      score,
      scoreMax,
      scoreBand,
      weekStart,
      computedAt,
      snapshotJson: snapshotJson as Prisma.InputJsonValue,
      sourceVersion: 1,
    },
  });
}

async function capturePropertyScoreSnapshots(
  propertyId: string,
  homeownerProfileId: string
): Promise<void> {
  const [riskReport, financialReport, propertyCore, warranties, documentCount, activeBookings, applianceItems] =
    await Promise.all([
      (prisma as any).riskAssessmentReport.findUnique({
        where: { propertyId },
        select: {
          riskScore: true,
          financialExposureTotal: true,
          details: true,
          lastCalculatedAt: true,
        },
      }),
      (prisma as any).financialEfficiencyReport.findUnique({
        where: { propertyId },
        select: {
          financialEfficiencyScore: true,
          actualInsuranceCost: true,
          actualUtilityCost: true,
          actualWarrantyCost: true,
          marketAverageTotal: true,
          lastCalculatedAt: true,
        },
      }),
      (prisma as any).property.findUnique({
        where: { id: propertyId },
      }),
      (prisma as any).warranty.findMany({
        where: { propertyId },
        select: {
          id: true,
          homeownerProfileId: true,
          propertyId: true,
          providerName: true,
          policyNumber: true,
          coverageDetails: true,
          cost: true,
          startDate: true,
          expiryDate: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      (prisma as any).document.count({
        where: { propertyId },
      }),
      (prisma as any).booking.findMany({
        where: {
          propertyId,
          status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
        },
        select: {
          id: true,
          category: true,
          status: true,
          insightFactor: true,
          insightContext: true,
          propertyId: true,
          providerId: true,
          scheduledDate: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      (prisma as any).inventoryItem.findMany({
        where: {
          propertyId,
          category: 'APPLIANCE',
        },
        select: {
          id: true,
          sourceHash: true,
          tags: true,
          name: true,
          installedOn: true,
        },
      }),
    ]);

  if (riskReport) {
    const details = Array.isArray(riskReport.details) ? (riskReport.details as Array<Record<string, unknown>>) : [];
    const highRiskCount = details.filter((detail) => String(detail.riskLevel || '').toUpperCase() === 'HIGH').length;
    await upsertPropertyScoreSnapshot({
      propertyId,
      homeownerProfileId,
      scoreType: 'RISK',
      score: Math.round(asNumber(riskReport.riskScore) * 10) / 10,
      scoreMax: 100,
      scoreBand: getBandForScore('RISK', asNumber(riskReport.riskScore)),
      computedAt: riskReport.lastCalculatedAt ? new Date(riskReport.lastCalculatedAt) : new Date(),
      snapshotJson: {
        financialExposureTotal: asNumber(riskReport.financialExposureTotal),
        highRiskAssets: highRiskCount,
      },
    });
  }

  if (financialReport) {
    const actualInsuranceCost = asNumber(financialReport.actualInsuranceCost);
    const actualUtilityCost = asNumber(financialReport.actualUtilityCost);
    const actualWarrantyCost = asNumber(financialReport.actualWarrantyCost);
    const annualCost = actualInsuranceCost + actualUtilityCost + actualWarrantyCost;

    await upsertPropertyScoreSnapshot({
      propertyId,
      homeownerProfileId,
      scoreType: 'FINANCIAL',
      score: Math.round(asNumber(financialReport.financialEfficiencyScore) * 10) / 10,
      scoreMax: 100,
      scoreBand: getBandForScore('FINANCIAL', asNumber(financialReport.financialEfficiencyScore)),
      computedAt: financialReport.lastCalculatedAt ? new Date(financialReport.lastCalculatedAt) : new Date(),
      snapshotJson: {
        annualCost,
        marketAverageTotal: asNumber(financialReport.marketAverageTotal),
      },
    });
  }

  if (propertyCore) {
    const homeAssets = (applianceItems || [])
      .map((item: any) => {
        const type = inferApplianceTypeFromItem(item);
        if (!type) return null;
        return {
          id: item.id,
          propertyId,
          assetType: type,
          installationYear: item.installedOn ? new Date(item.installedOn).getUTCFullYear() : null,
        };
      })
      .filter(Boolean);

    const healthInput = {
      ...(propertyCore as Record<string, unknown>),
      homeAssets,
      warranties: warranties || [],
    };

    const health = calculateHealthScore(healthInput as any, documentCount || 0, (activeBookings || []) as any[]);
    await upsertPropertyScoreSnapshot({
      propertyId,
      homeownerProfileId,
      scoreType: 'HEALTH',
      score: Math.round(asNumber(health.totalScore) * 10) / 10,
      scoreMax: asNumber(health.maxPotentialScore),
      scoreBand: getBandForScore('HEALTH', asNumber(health.totalScore)),
      computedAt: new Date(),
      snapshotJson: {
        requiredActions: health.insights.filter((insight: { status: string }) =>
          ['Needs Attention', 'Needs Review', 'Needs Inspection', 'Missing Data', 'Needs Warranty'].includes(insight.status)
        ).length,
        insights: health.insights.slice(0, 8),
      },
    });
  }
}

async function captureWeeklyScoreSnapshotsJob() {
  logger.info(`[${new Date().toISOString()}] Running weekly property score snapshot job...`);
  try {
    const properties = await (prisma as any).property.findMany({
      select: {
        id: true,
        homeownerProfileId: true,
      },
    });

    let successCount = 0;
    let failureCount = 0;

    for (const property of properties as Array<{ id: string; homeownerProfileId: string }>) {
      try {
        await capturePropertyScoreSnapshots(property.id, property.homeownerProfileId);
        successCount += 1;
      } catch (error) {
        failureCount += 1;
        logger.error({ err: error }, `[SCORE-SNAPSHOT] Failed for property ${property.id}`);
      }
    }

    logger.info(
      `[SCORE-SNAPSHOT] Weekly snapshot completed. Success: ${successCount}, Failed: ${failureCount}, Total: ${properties.length}`
    );
  } catch (error) {
    logger.error({ err: error }, '[SCORE-SNAPSHOT] Weekly snapshot job failed');
  }
}

/**
 * Send maintenance reminders (existing cron job)
 */
async function sendMaintenanceReminders() {
  logger.info(`[${new Date().toISOString()}] Running maintenance reminder job...`);
  
  try {
    const today = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(today.getDate() + 7);

    const upcomingTasks = await prisma.checklistItem.findMany({
      where: {
        status: ChecklistItemStatus.PENDING,
        nextDueDate: {
          gte: today,
          lte: sevenDaysFromNow,
        },
      },
      include: {
        checklist: {
          include: {
            homeownerProfile: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    logger.info(`   Found ${upcomingTasks.length} upcoming tasks to remind about.`);

    await Promise.all(
      upcomingTasks.map(async (task) => {
        const user = task.checklist.homeownerProfile.user;
        const dueDate = new Date(task.nextDueDate!).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
        });

        const subject = `Upcoming Maintenance Reminder: ${task.title}`;
        const body = `
          Hi ${user.firstName},

          This is a friendly reminder that your recurring maintenance task "${task.title}" is due soon.
          
          Due Date: ${dueDate}

          Log in to your Contract to Cozy dashboard to manage this task or find a provider.

          Thanks,
          The Contract to Cozy Team
        `;

        try {
          // Email service integration would go here
          logger.info(`   -> Sent reminder for "${task.title}" to ${user.email}`);
        } catch (emailError) {
          logger.error({ err: emailError }, `Failed to send email for task ${task.id}`);
        }
      })
    );

    logger.info('✅ All maintenance reminders sent. Job complete.');
  } catch (error) {
    logger.error({ err: error }, '❌ Error running maintenance reminder job');
  }
}

/**
 * Process risk assessment calculation.
 * Delegates to RiskAssessmentService.calculateAndSaveReport which fetches
 * the full property including homeAssets and inventoryItems.
 */
async function processRiskCalculation(jobData: PropertyIntelligenceJobPayload) {
  const { propertyId } = jobData;
  logger.info(`[${new Date().toISOString()}] Processing risk calculation for property ${propertyId}...`);

  try {
    await RiskAssessmentService.calculateAndSaveReport(propertyId);
    logger.info(`✅ Risk assessment calculated and saved for property ${propertyId}.`);
  } catch (error) {
    logger.error({ err: error }, '❌ Error calculating risk assessment');
    throw error;
  }

  // Score snapshot update is best-effort — failure here must not re-queue the job
  try {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { homeownerProfileId: true },
    });
    if (property?.homeownerProfileId) {
      await capturePropertyScoreSnapshots(propertyId, property.homeownerProfileId);
      logger.info(`[SCORE-SNAPSHOT] Updated weekly snapshots from risk calculation for property ${propertyId}.`);
    }
  } catch (snapshotError) {
    logger.error({ err: snapshotError }, `[SCORE-SNAPSHOT] Failed to update snapshots for property ${propertyId} — risk report was saved successfully`);
  }
}

 /**
 * Process FES calculation
 */
/**
 * Process FES calculation
 */
async function processFESCalculation(jobData: PropertyIntelligenceJobPayload) {
  logger.info(`[${new Date().toISOString()}] Processing FES calculation for property ${jobData.propertyId}...`);
  
  const propertyId = jobData.propertyId;

  try {
    // 1. Fetch property with all financial data (like risk does with fetchPropertyDetails)
    const property = await (prisma as any).property.findUnique({
      where: { id: propertyId },
      include: {
        insurancePolicies: true,
        warranties: true,
        expenses: {
          where: {
            category: 'UTILITY',
            transactionDate: { gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1)) },
          },
        },
      },
    });

    if (!property) {
      logger.error(`Property ${propertyId} not found. Job failed.`);
      throw new Error("Property not found for FES calculation.");
    }

    // 2. Get benchmark (matching the old getBenchmark logic)
    let benchmark = null;
    if (property.propertyType) {
      benchmark = await (prisma as any).financialEfficiencyConfig.findUnique({
        where: { 
          zipCode_propertyType: { 
            zipCode: property.zipCode, 
            propertyType: property.propertyType 
          } 
        },
      });
      
      // Fallback to global benchmark for property type
      if (!benchmark) {
        benchmark = await (prisma as any).financialEfficiencyConfig.findFirst({
          where: { zipCode: null, propertyType: property.propertyType },
        });
      }
    }

    // 3. Calculate FES (pure function, no database access)
    const result = calculateFinancialEfficiency({
      property,
      insurancePolicies: property.insurancePolicies,
      warranties: property.warranties,
      utilityExpenses: property.expenses,
      benchmark,
    });

    // 4. Save result to database
    await (prisma as any).financialEfficiencyReport.upsert({
      where: { propertyId },
      update: {
        financialEfficiencyScore: result.score,
        actualInsuranceCost: result.actualInsuranceCost,
        actualUtilityCost: result.actualUtilityCost,
        actualWarrantyCost: result.actualWarrantyCost,
        marketAverageTotal: result.marketAverageTotal,
        lastCalculatedAt: new Date(),
      },
      create: {
        propertyId: propertyId,
        financialEfficiencyScore: result.score,
        actualInsuranceCost: result.actualInsuranceCost,
        actualUtilityCost: result.actualUtilityCost,
        actualWarrantyCost: result.actualWarrantyCost,
        marketAverageTotal: result.marketAverageTotal,
      }
    });

    const totalExposure = result.actualInsuranceCost
      .plus(result.actualUtilityCost)
      .plus(result.actualWarrantyCost);

    logger.info(`✅ FES calculation completed for property ${propertyId}.`);
    logger.info(`   Score: ${result.score}, Exposure: $${totalExposure.toFixed(2)}`);

    if (property.homeownerProfileId) {
      await capturePropertyScoreSnapshots(propertyId, property.homeownerProfileId);
      logger.info(`[SCORE-SNAPSHOT] Updated weekly snapshots from FES calculation for property ${propertyId}.`);
    }
    
  } catch (error) {
    logger.error({ err: error }, '❌ Error calculating FES');
    throw error;
  }
}

/**
 * Process hidden asset scan for a single property
 */
async function processHiddenAssetScan(jobData: PropertyIntelligenceJobPayload) {
  const { propertyId } = jobData;
  logger.info(`[${new Date().toISOString()}] Processing hidden asset scan for property ${propertyId}...`);

  try {
    const result = await hiddenAssetService.refreshMatchesInternal(propertyId);
    logger.info(
      `✅ Hidden asset scan completed for property ${propertyId}. ` +
      `Evaluated: ${result.programsEvaluated}, Matched: ${result.matchesFound}, ` +
      `Expired: ${result.matchesExpired}, Inactivated: ${result.matchesInactivated}`
    );
  } catch (error) {
    logger.error({ err: error }, `❌ Error running hidden asset scan for property ${propertyId}`);
    throw error;
  }
}

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

const CRON_HANDLERS: Record<string, () => Promise<void>> = {
  'maintenance-reminders':           async () => { await sendMaintenanceReminders(); },
  'daily-email-digest':              async () => { await runDailyEmailDigest(); },
  'seasonal-checklist-expiration':   async () => { await expireSeasonalChecklists(); },
  'seasonal-checklist-generation':   async () => { await generateSeasonalChecklists(); },
  'seasonal-notifications':          async () => { await sendSeasonalNotifications(); },
  'weekly-score-snapshots':          async () => { await captureWeeklyScoreSnapshotsJob(); },
  'hidden-asset-refresh':            async () => { await runHiddenAssetRefreshJob(); },
  'coverage-lapse-incidents':        async () => { await coverageLapseIncidentsJob(); },
  'freeze-risk-incidents':           async () => { await freezeRiskIncidentsJob(); },
  'neighborhood-change-notifications': async () => { await neighborhoodChangeNotificationJob(); },
  'neighborhood-radar-refresh':      async () => { await refreshNeighborhoodEventsJob(); },
  'inventory-draft-cleanup':         async () => { await cleanupInventoryDraftsJob(); },
  'home-habit-generation':           async () => { await runHabitGenerationJob(); },
  'mortgage-rate-ingest':            async () => {
    const result = await ingestMortgageRatesJob();
    if (!result.success) {
      logger.warn({ reason: result.reason }, '[mortgage-rate-ingest] No rates ingested');
    }
  },
  'home-gazette-generation':         async () => { await runGazetteGenerationJob(); },
  'shared-data-backfill':            async () => { await runSharedDataBackfillJob(); },
  'shared-data-consistency-audit':   async () => { await runSharedDataConsistencyAuditJob(); },
  'shared-signal-refresh':           async () => { await runSharedSignalRefreshJob(); },
  'shared-signal-health-audit':      async () => { await runSharedSignalHealthAuditJob(); },
  'expire-guidance-signals':         async () => { await expireGuidanceSignalsJob(); },
};

// Per-job cron expression overrides (env-var-based schedules)
const CRON_ENV_OVERRIDES: Record<string, string | undefined> = {
  'inventory-draft-cleanup':    process.env.INVENTORY_DRAFT_CLEANUP_CRON,
  'home-gazette-generation':    process.env.HOME_GAZETTE_GENERATION_CRON,
  'shared-data-backfill':       process.env.SHARED_DATA_BACKFILL_CRON,
  'shared-data-consistency-audit': process.env.SHARED_DATA_CONSISTENCY_AUDIT_CRON,
  'shared-signal-refresh':      process.env.SHARED_SIGNAL_REFRESH_CRON,
  'shared-signal-health-audit': process.env.SHARED_SIGNAL_HEALTH_AUDIT_CRON,
};

function scheduleCronJobs(): void {
  const cronEntries = JOB_REGISTRY.filter((j) => j.type === 'cron' && j.cronExpression);

  for (const entry of cronEntries) {
    const handler = CRON_HANDLERS[entry.key];
    if (!handler) {
      logger.warn(
        `[REGISTRY] ⚠️  No handler for registry job "${entry.key}" — ` +
        `job will not run. Add it to CRON_HANDLERS in worker.ts`,
      );
      continue;
    }
    const cronExpr = CRON_ENV_OVERRIDES[entry.key] ?? entry.cronExpression;
    cron.schedule(
      cronExpr,
      async () => {
        try {
          logger.info(`[${entry.key}] Starting: ${entry.name}`);
          await handler();
          logger.info(`[${entry.key}] ✅ Completed`);
        } catch (err) {
          logger.error({ err }, `[${entry.key}] ❌ Failed`);
        }
      },
      { timezone: 'America/New_York' },
    );
    logger.info(`[REGISTRY] Scheduled "${entry.name}" — ${cronExpr} (${entry.schedule})`);
  }

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
  });

  propertyIntelligenceWorker.on('error', (err) => {
    logger.error({ err }, '[QUEUE] Worker experienced an error');
  });

  // =============================================================================
  // Email Notification Worker
  // =============================================================================
  const emailNotificationWorker = new Worker(
    'email-notification-queue',
    async (job) => {
      if (job.name === 'SEND_EMAIL_NOTIFICATION') {
        await sendEmailNotificationJob(job.data.notificationDeliveryId);
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
  });

  emailNotificationWorker.on('error', (err) => {
    logger.error({ err }, '[QUEUE] Email notification worker error');
  });

  // ===============================
  // PUSH NOTIFICATIONS
  // ===============================
  const pushWorker = new Worker(
    'push-notification-queue',
    async (job) => {
      if (job.name === 'SEND_PUSH_NOTIFICATION') {
        await sendPushNotificationJob(job.data.notificationDeliveryId);
      }
    },
    { connection: redisConnection }
  );
  logger.info(`[WORKER] Push Notification Worker started for queue: push-notification-queue`);
  // ===============================
  // SMS NOTIFICATIONS
  // ===============================
  const smsWorker = new Worker(
    'sms-notification-queue',
    async (job) => {
      if (job.name === 'SEND_SMS_NOTIFICATION') {
        await sendSmsNotificationJob(job.data.notificationDeliveryId);
      }
    },
    { connection: redisConnection }
  );
  logger.info(`[WORKER] Property Intelligence Worker started for queue: ${QUEUE_NAME}`);

}

function restartAfterDelay(name: string, fn: () => Promise<void>, delayMs = 30_000) {
  fn().catch((e) => {
    logger.error({ err: e }, `${name} crashed, restarting in ${delayMs / 1000}s`);
    setTimeout(() => restartAfterDelay(name, fn, delayMs), delayMs);
  });
}

restartAfterDelay('Report export poller', runHomeReportExportPoller);
restartAfterDelay('Report export cleanup', runReportExportCleanup);

startHighPriorityEmailEnqueuePoller({
  intervalMs: 10_000,
  batchSize: 50,
  redisConnection,
});

startDomainEventsPoller({
  intervalMs: 30_000,
  batchSize: 25,
});

startClaimFollowUpDuePoller({
  intervalMs: 60_000,
  batchSize: 50,
});

// =============================================================================
// RECALL JOBS: Worker and Queue setup
// =============================================================================
const RECALL_QUEUE_NAME = 'recall-jobs-queue';

const recallQueue = new Queue(RECALL_QUEUE_NAME, { 
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: true, // Clean up to save Redis memory
    removeOnFail: 1000
  }
});

const recallWorker = new Worker(
  RECALL_QUEUE_NAME,
  async (job) => {
    // BullMQ workers need a "heartbeat" for long-running jobs.
    // If recallIngestJob or recallMatchJob takes > 30s, the lock expires.
    
    if (job.name === RECALL_INGEST_JOB) {
      await recallIngestJob();
    } else if (job.name === RECALL_MATCH_JOB) {
      await recallMatchJob();
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
});

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
// DUMMY RADAR INGEST (QA / E2E)
// =============================================================================
const radarDummyIngestEnabled = process.env.RADAR_DUMMY_INGEST_ENABLED === 'true';
const radarDummyIngestCron = process.env.RADAR_DUMMY_INGEST_CRON || '*/30 * * * *';

if (radarDummyIngestEnabled) {
  cron.schedule(radarDummyIngestCron, async () => {
    try {
      logger.info('[RADAR-DUMMY-INGEST] Running dummy radar ingest job...');
      await ingestRadarSignalsJob();
    } catch (err) {
      logger.error({ err }, '[RADAR-DUMMY-INGEST] Job failed');
    }
  }, { timezone: 'America/New_York' });

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
  cron.schedule(homeRiskReplayDummyIngestCron, async () => {
    try {
      logger.info('[HOME-RISK-INGEST] Running dummy home risk event ingest job...');
      await ingestHomeRiskEventsJob();
    } catch (err) {
      logger.error({ err }, '[HOME-RISK-INGEST] Job failed');
    }
  }, { timezone: 'America/New_York' });

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
  cron.schedule(neighborhoodDummyIngestCron, async () => {
    try {
      logger.info('[NEIGHBORHOOD-DUMMY-INGEST] Running dummy neighborhood event ingest job...');
      await ingestNeighborhoodDummyEventsJob();
    } catch (err) {
      logger.error({ err }, '[NEIGHBORHOOD-DUMMY-INGEST] Job failed');
    }
  }, { timezone: 'America/New_York' });

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
    logger.info(`[CRON-TRIGGER] Running manually triggered job: ${job.name}`);
    await handler();
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
});

// Start cron jobs from registry, then start BullMQ worker
scheduleCronJobs();
startWorker();
startMetricsServer();
