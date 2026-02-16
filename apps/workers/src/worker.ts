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

// Import shared utilities from backend - ADDED filterRelevantAssets
import { calculateAssetRisk, calculateTotalRiskScore, filterRelevantAssets, AssetRiskDetail } from '../../backend/src/utils/riskCalculator.util';
import { RISK_ASSET_CONFIG } from '../../backend/src/config/risk-constants';
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
import { prisma } from './lib/prisma';

// =============================================================================
// FIX: Update queue configuration to match backend
// =============================================================================
const QUEUE_NAME = 'property-intelligence-queue'; // FIXED: Was 'main-background-queue'

// Job types enum matching backend
enum PropertyIntelligenceJobType {
  CALCULATE_RISK_REPORT = 'CALCULATE_RISK_REPORT',
  CALCULATE_FES = 'CALCULATE_FES',
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

const redisConnection = {
  host: redisHost,
  port: workerPort, 
  db: parseInt(process.env.REDIS_DB || '0', 10),
  password: process.env.REDIS_PASSWORD,
};

// Type definitions
interface Warranty {
  id: string;
  homeownerProfileId: string;
  propertyId: string | null;
  providerName: string;
  policyNumber: string | null;
  coverageDetails: string | null;
  cost: number | null;
  startDate: Date;
  expiryDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface InsurancePolicy {
  id: string;
  homeownerProfileId: string;
  propertyId: string | null;
  carrierName: string;
  policyNumber: string;
  coverageType: string | null;
  premiumAmount: number;
  startDate: Date;
  expiryDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface RiskAssessmentReport {
  id: string;
  propertyId: string;
  riskScore: number;
  financialExposureTotal: number;
  details: Prisma.InputJsonValue;
  lastCalculatedAt: Date;
  createdAt: Date;
}

interface PropertyWithRelations extends Property {
  warranties: Warranty[];
  insurancePolicies: InsurancePolicy[];
  riskReport: RiskAssessmentReport | null;
  // Note: All property fields (heatingType, waterHeaterType, roofType, yearBuilt, etc.)
  // are already included from the base Property type from Prisma
}

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
    console.warn('[SCORE-SNAPSHOT] Prisma client missing propertyScoreSnapshot delegate. Run prisma generate.');
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
          homeownerProfileId: true,
          scheduledDate: true,
          notes: true,
          price: true,
          createdAt: true,
          updatedAt: true,
          title: true,
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
          ['Needs Attention', 'Needs Review', 'Needs Inspection', 'Missing Data'].includes(insight.status)
        ).length,
        insights: health.insights.slice(0, 8),
      },
    });
  }
}

async function captureWeeklyScoreSnapshotsJob() {
  console.log(`[${new Date().toISOString()}] Running weekly property score snapshot job...`);
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
        console.error(`[SCORE-SNAPSHOT] Failed for property ${property.id}:`, error);
      }
    }

    console.log(
      `[SCORE-SNAPSHOT] Weekly snapshot completed. Success: ${successCount}, Failed: ${failureCount}, Total: ${properties.length}`
    );
  } catch (error) {
    console.error('[SCORE-SNAPSHOT] Weekly snapshot job failed:', error);
  }
}

/**
 * Fetch property details with all required relations
 */
async function fetchPropertyDetails(propertyId: string): Promise<PropertyWithRelations | null> {
  try {
    // @ts-ignore - These models exist in backend schema
    const property = await (prisma as any).property.findUnique({
      where: { id: propertyId },
      include: {
        warranties: true,
        insurancePolicies: true,
        riskReport: true,
      },
    });
    
    return property as PropertyWithRelations | null;
  } catch (error) {
    console.error(`Failed to fetch property ${propertyId}:`, error);
    return null;
  }
}

/**
 * Send maintenance reminders (existing cron job)
 */
async function sendMaintenanceReminders() {
  console.log(`[${new Date().toISOString()}] Running maintenance reminder job...`);
  
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

    console.log(`   Found ${upcomingTasks.length} upcoming tasks to remind about.`);

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
          console.log(`   -> Sent reminder for "${task.title}" to ${user.email}`);
        } catch (emailError) {
          console.error(`Failed to send email for task ${task.id}:`, emailError);
        }
      })
    );

    console.log('✅ All maintenance reminders sent. Job complete.');
  } catch (error) {
    console.error('❌ Error running maintenance reminder job:', error);
  }
}

/**
 * Process risk assessment calculation - UPDATED WITH ASSET FILTERING
 */
async function processRiskCalculation(jobData: PropertyIntelligenceJobPayload) {
  console.log(`[${new Date().toISOString()}] Processing risk calculation for property ${jobData.propertyId}...`);

  const propertyId = jobData.propertyId;

  try {
    const property = await fetchPropertyDetails(propertyId);
    
    if (!property) {
      console.error(`Property ${propertyId} not found. Job failed.`);
      throw new Error("Property not found for calculation.");
    }

    const currentYear = new Date().getFullYear();
    const assetRisks: AssetRiskDetail[] = [];
    
    // === FIX: Filter assets to only those that exist on the property ===
    console.log(`[RISK-CALC] Filtering assets for property ${propertyId}...`);
    console.log(`[RISK-CALC] Property config: heatingType=${property.heatingType}, waterHeaterType=${property.waterHeaterType}, roofType=${property.roofType}`);
    
    const relevantConfigs = filterRelevantAssets(property as any, RISK_ASSET_CONFIG);
    console.log(`[RISK-CALC] Filtered from ${RISK_ASSET_CONFIG.length} to ${relevantConfigs.length} relevant assets`);
    
    // Calculate risk ONLY for relevant assets
    for (const config of relevantConfigs) {
      const assetRisk = calculateAssetRisk(
        config.systemType,
        config,
        property as any, 
        currentYear
      );

      if (assetRisk) {
        assetRisks.push(assetRisk);
        console.log(`[RISK-CALC-WORKER] Asset ${config.systemType} - P: ${assetRisk.probability}, OOP: ${assetRisk.outOfPocketCost}, Risk: ${assetRisk.riskDollar}`);
        console.log(`[RISK-CALC] Calculated risk for ${config.systemType}: $${assetRisk.riskDollar}`);
      } else {
        console.warn(`[RISK-CALC] Skipped ${config.systemType} (no install year)`);
      }
    }

    console.log(`[RISK-CALC] Total assets with calculated risk: ${assetRisks.length}`);

    // Calculate total risk score
    const reportData = calculateTotalRiskScore(property as any, assetRisks);
    console.log(`[RISK-CALC-WORKER] Final Score: ${reportData.riskScore}, Total Exposure: $${reportData.financialExposureTotal}`);

    // Save or update the report
    await (prisma as any).riskAssessmentReport.upsert({
      where: { propertyId: propertyId },
      update: {
        riskScore: reportData.riskScore,
        financialExposureTotal: reportData.financialExposureTotal, 
        details: reportData.details as Prisma.InputJsonValue,
        lastCalculatedAt: reportData.lastCalculatedAt,
      },
      create: {
        propertyId: propertyId,
        riskScore: reportData.riskScore,
        financialExposureTotal: reportData.financialExposureTotal,
        details: reportData.details as Prisma.InputJsonValue,
      },
    });

    console.log(`✅ Risk assessment calculated and saved for property ${propertyId}.`);
    console.log(`   Score: ${reportData.riskScore}, Exposure: $${reportData.financialExposureTotal}, Assets: ${assetRisks.length}`);

    if (property.homeownerProfileId) {
      await capturePropertyScoreSnapshots(propertyId, property.homeownerProfileId);
      console.log(`[SCORE-SNAPSHOT] Updated weekly snapshots from risk calculation for property ${propertyId}.`);
    }
    
  } catch (error) {
    console.error('❌ Error calculating risk assessment:', error);
    throw error;
  }
}

 /**
 * Process FES calculation
 */
/**
 * Process FES calculation
 */
async function processFESCalculation(jobData: PropertyIntelligenceJobPayload) {
  console.log(`[${new Date().toISOString()}] Processing FES calculation for property ${jobData.propertyId}...`);
  
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
      console.error(`Property ${propertyId} not found. Job failed.`);
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

    console.log(`✅ FES calculation completed for property ${propertyId}.`);
    console.log(`   Score: ${result.score}, Exposure: $${totalExposure.toFixed(2)}`);

    if (property.homeownerProfileId) {
      await capturePropertyScoreSnapshots(propertyId, property.homeownerProfileId);
      console.log(`[SCORE-SNAPSHOT] Updated weekly snapshots from FES calculation for property ${propertyId}.`);
    }
    
  } catch (error) {
    console.error('❌ Error calculating FES:', error);
    throw error;
  }
}

/**
 * Main worker startup function
 */
function startWorker() {
  console.log('🚀 Worker started. Waiting for jobs...');

  // Schedule maintenance reminders cron job
  cron.schedule('0 9 * * *', sendMaintenanceReminders, {
    timezone: 'America/New_York',
  });
  
  cron.schedule(
    '0 8 * * *',
    async () => {
      console.log('[DIGEST] Running daily email digest...');
      await runDailyEmailDigest();
    },
    { timezone: 'America/New_York' }
  );

  // Clean up expired checklists first (1 AM)
  cron.schedule(
    '0 1 * * *',
    //'*/5 * * * *',
    async () => {
      console.log('[SEASONAL-EXPIRE] Running checklist expiration job...');
      try {
        await expireSeasonalChecklists();
        console.log('[SEASONAL-EXPIRE] ✅ Job completed successfully');
      } catch (error) {
        console.error('[SEASONAL-EXPIRE] ❌ Job failed:', error);
      }
    },
    { timezone: 'America/New_York' }
  );

  // Generate new seasonal checklists (2 AM)
  cron.schedule(
     '0 2 * * *',
    //'*/5 * * * *',
    async () => {
      console.log('[SEASONAL-GEN] Running checklist generation job...');
      try {
        await generateSeasonalChecklists();
        console.log('[SEASONAL-GEN] ✅ Job completed successfully');
      } catch (error) {
        console.error('[SEASONAL-GEN] ❌ Job failed:', error);
      }
    },
    { timezone: 'America/New_York' }
  );

  // Send notifications during morning hours (9 AM)
  cron.schedule(
     '0 9 * * *',
    //'*/5 * * * *',
    async () => {
      console.log('[SEASONAL-NOTIFY] Running notification job...');
      try {
        await sendSeasonalNotifications();
        console.log('[SEASONAL-NOTIFY] ✅ Job completed successfully');
      } catch (error) {
        console.error('[SEASONAL-NOTIFY] ❌ Job failed:', error);
      }
    },
    { timezone: 'America/New_York' }
  );

  console.log('✅ Seasonal maintenance jobs scheduled:');
  console.log('   - Expiration: Daily at 1:00 AM EST (clean up old checklists)');
  console.log('   - Generation: Daily at 2:00 AM EST (create new checklists)');
  console.log('   - Notifications: Daily at 9:00 AM EST (send emails)');

  cron.schedule(
    '0 4 * * 1',
    async () => {
      await captureWeeklyScoreSnapshotsJob();
    },
    { timezone: 'America/New_York' }
  );
  console.log('   - Weekly score snapshots: Monday at 4:00 AM EST');
  // =============================================================================
  // FIX: Initialize BullMQ Worker with correct queue name and job handlers
  // =============================================================================
  const propertyIntelligenceWorker = new Worker<PropertyIntelligenceJobPayload>(
    QUEUE_NAME, // FIXED: Now matches backend queue name
    async (job) => {
      const { jobType, propertyId } = job.data;
      
      console.log(`[WORKER] Processing Job [${jobType}] for Property [${propertyId}] (Job ID: ${job.id})`);

      try {
        // Handle different job types
        switch (jobType) {
          case PropertyIntelligenceJobType.CALCULATE_RISK_REPORT:
            await processRiskCalculation(job.data);
            break;
            
          case PropertyIntelligenceJobType.CALCULATE_FES:
            await processFESCalculation(job.data);
            break;

          default:
            console.error(`[WORKER] Unknown job type: ${jobType}`);
            throw new Error(`Unknown job type: ${jobType}`);
        }
        
        console.log(`[WORKER] Successfully completed Job [${jobType}] for Property [${propertyId}]`);
      } catch (error) {
        console.error(`[WORKER] Job [${jobType}] failed for ${propertyId}:`, error);
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
    console.log(`[QUEUE] Worker connected to Redis and ready to process queue: ${QUEUE_NAME}`);
  });

  propertyIntelligenceWorker.on('completed', (job) => {
    console.log(`[QUEUE] Job ${job.id} (${job.data.jobType}) completed successfully.`);
  });

  propertyIntelligenceWorker.on('failed', (job, err) => {
    console.error(`[QUEUE] Job ${job?.id} (${job?.data.jobType}) failed with error:`, err.message);
  });

  propertyIntelligenceWorker.on('error', (err) => {
    console.error('[QUEUE] Worker experienced an error:', err);
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
  console.log(`[WORKER] Email Notification Worker started for queue: email-notification-queue`);

  emailNotificationWorker.on('ready', () => {
    console.log('[QUEUE] Email Notification Worker ready');
  });

  emailNotificationWorker.on('completed', (job) => {
    console.log(`[QUEUE] Email notification job ${job.id} completed`);
  });

  emailNotificationWorker.on('failed', (job, err) => {
    console.error(
      `[QUEUE] Email notification job ${job?.id} failed:`,
      err.message
    );
  });

  emailNotificationWorker.on('error', (err) => {
    console.error('[QUEUE] Email notification worker error:', err);
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
  console.log(`[WORKER] Push Notification Worker started for queue: push-notification-queue`);
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
  console.log(`[WORKER] Property Intelligence Worker started for queue: ${QUEUE_NAME}`);

}

function restartAfterDelay(name: string, fn: () => Promise<void>, delayMs = 30_000) {
  fn().catch((e) => {
    console.error(`${name} crashed, restarting in ${delayMs / 1000}s...`, e);
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
  console.log(`[RECALL-WORKER] Worker connected and ready for queue: ${RECALL_QUEUE_NAME}`);
});

recallWorker.on('completed', (job) => {
  console.log(`[RECALL-WORKER] Job ${job.id} (${job.name}) completed successfully.`);
});

recallWorker.on('failed', (job, err) => {
  console.error(`[RECALL-WORKER] Job ${job?.id} (${job?.name}) failed:`, err);
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

setupScheduledJobs().catch(console.error);

console.log(`[RECALL-WORKER] Recall Worker started for queue: ${RECALL_QUEUE_NAME}`);

// =============================================================================
// COVERAGE LAPSE INCIDENTS
// =============================================================================
cron.schedule('0 8 * * *', coverageLapseIncidentsJob, { timezone: 'America/New_York' });
console.log('[COVERAGE-LAPSE] Coverage Lapse Incidents job scheduled for 8:00 AM EST');
// =============================================================================
// FREEZE RISK INCIDENTS
// =============================================================================
cron.schedule('0 9 * * *', freezeRiskIncidentsJob, { timezone: 'America/New_York' });
console.log('[FREEZE-RISK] Freeze Risk Incidents job scheduled for 9:00 AM EST');

// =============================================================================
// INVENTORY DRAFT CLEANUP (Phase 3 hardening)
// =============================================================================
const draftCleanupCron = process.env.INVENTORY_DRAFT_CLEANUP_CRON || '15 3 * * *'; // default: 3:15am daily
cron.schedule(draftCleanupCron, async () => {
  try {
    console.log('[WORKER] Running cleanupInventoryDraftsJob...');
    await cleanupInventoryDraftsJob();
  } catch (err) {
    console.error('[WORKER] cleanupInventoryDraftsJob failed:', err);
  }
});

console.log(`[WORKER] Inventory Draft Cleanup scheduled for: ${draftCleanupCron} America/New_York`);

// Start the worker
startWorker();
