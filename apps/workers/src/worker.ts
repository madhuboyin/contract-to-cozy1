// apps/workers/src/worker.ts
import { 
  PrismaClient, 
  ChecklistItemStatus, 
  Property, 
  Prisma
} from '@prisma/client';
import cron from 'node-cron';
import * as dotenv from 'dotenv';
dotenv.config();
import { Worker } from 'bullmq';

// Import shared utilities from backend - ADDED filterRelevantAssets
import { calculateAssetRisk, calculateTotalRiskScore, filterRelevantAssets, AssetRiskDetail } from '../../backend/src/utils/riskCalculator.util';
import { RISK_ASSET_CONFIG } from '../../backend/src/config/risk-constants';
import { calculateFinancialEfficiency } from '../../backend/src/utils/FinancialCalculator.util';
import { sendEmailNotificationJob } from './jobs/sendEmailNotification.job';
import { sendPushNotificationJob } from './jobs/sendPushNotification.job';
import { sendSmsNotificationJob } from './jobs/sendSmsNotification.job';


const prisma = new PrismaClient();

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

  // Run maintenance reminders once on startup for demo
  console.log('Running maintenance reminder job on startup for demo...');
  sendMaintenanceReminders();
}

// Start the worker
startWorker();