// apps/workers/src/worker.ts
import { 
  PrismaClient, 
  ChecklistItemStatus, 
  Property, 
  Prisma // Added for Decimal type
} from '@prisma/client';
import cron from 'node-cron';
import { RISK_JOB_TYPES } from './config/risk-job-types';

// NOTE: In a professional monorepo setup, these should be moved to a shared library 
// to avoid importing directly from the 'backend' application's src.
// This fix uses relative paths based on the inferred project structure.
import { calculateAssetRisk, calculateTotalRiskScore, AssetRiskDetail } from '../../backend/src/utils/riskCalculator.util';
import { RISK_ASSET_CONFIG } from '../../backend/src/config/risk-constants';

const prisma = new PrismaClient();

// Type definitions for models that exist in backend schema but not in workers schema
// These match the backend Prisma schema definitions
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

// Helper interface (replicated from RiskAssessment.service.ts)
interface PropertyWithRelations extends Property {
  warranties: Warranty[];
  insurancePolicies: InsurancePolicy[];
  riskReport: RiskAssessmentReport | null;
}

/**
* Private helper to fetch property details with all required relations.
*/
async function fetchPropertyDetails(propertyId: string): Promise<PropertyWithRelations | null> {
  // @ts-ignore - These relations exist in the database but not in workers Prisma schema
  const result = await ((prisma.property as any).findUnique({
    where: { id: propertyId },
    include: {
      warranties: true,
      insurancePolicies: true,
      riskReport: true,
    },
  }));
  return result as PropertyWithRelations | null;
}

// A placeholder for a real email service
const emailService = {
send: async (to: string, subject: string, body: string) => {
  console.log('---------------------------------');
  console.log(`📧 SIMULATING EMAIL SEND 📧`);
  console.log(`   To: ${to}`);
  console.log(`   Subject: ${subject}`);
  // console.log(`   Body: ${body}`); // (Omitted for brevity in logs)
  console.log('---------------------------------');
  // Simulate a network delay
  await new Promise(resolve => setTimeout(resolve, 50));
  return { success: true };
},
};

/**
* Finds all recurring maintenance tasks that are due within the next 7 days
* and sends an email reminder to the homeowner.
*/
async function sendMaintenanceReminders() {
console.log(`[${new Date().toISOString()}] Running daily maintenance reminder job...`);

// Calculate the date range: from now up to 7 days from now
const today = new Date();
const sevenDaysFromNow = new Date();
sevenDaysFromNow.setDate(today.getDate() + 7);

try {
  const tasksDueSoon = await prisma.checklistItem.findMany({
    where: {
      isRecurring: true,
      status: ChecklistItemStatus.PENDING,
      nextDueDate: {
        gte: today,         // Due between today...
        lte: sevenDaysFromNow, // ...and 7 days from now
      },
    },
    include: {
      checklist: {
        include: {
          homeownerProfile: {
            include: {
              user: {
                select: {
                  email: true,
                  firstName: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (tasksDueSoon.length === 0) {
    console.log('✅ No upcoming maintenance tasks found. Job complete.');
    return;
  }

  console.log(`Found ${tasksDueSoon.length} tasks due soon. Sending notifications...`);

  // Use Promise.all to send emails in parallel
  await Promise.all(
    tasksDueSoon.map(async (task) => {
      const user = task.checklist?.homeownerProfile?.user;
      if (!user || !user.email) {
        console.error(`Skipping task ${task.id}: No user email found.`);
        return;
      }

      const dueDate = new Date(task.nextDueDate!).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
      });

      // Email content
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
        await emailService.send(user.email, subject, body);
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
* Process risk assessment calculation jobs.
* This function now implements the actual calculation logic, fixing the functional gap.
*/
async function processRiskCalculation(jobData: { propertyId: string }) {
console.log(`[${new Date().toISOString()}] Processing risk calculation for property ${jobData.propertyId}...`);

const propertyId = jobData.propertyId;

try {
  // 1. Fetch detailed property data with relations
  const property = await fetchPropertyDetails(propertyId);
  
  if (!property) {
    console.error(`Property ${propertyId} not found for calculation. Job failed.`);
    throw new Error("Property not found for calculation.");
  }

  const currentYear = new Date().getFullYear();
  const assetRisks: AssetRiskDetail[] = [];
  
  // 2. Calculate Risk for each configured asset
  for (const config of RISK_ASSET_CONFIG) {
    // @ts-ignore - The config and property types align with the utility function signature
    const assetRisk = calculateAssetRisk(
      config.systemType,
      config,
      property as PropertyWithRelations, 
      currentYear
    );

    if (assetRisk) {
      assetRisks.push(assetRisk);
    }
  }

  // 3. Calculate Total Risk Score and Financial Exposure
  // @ts-ignore - The property types align with the utility function signature
  const reportData = calculateTotalRiskScore(property as PropertyWithRelations, assetRisks);

  // 4. Save or Update the RiskAssessmentReport (upsert)
  // @ts-ignore - riskAssessmentReport model exists in database but not in workers Prisma schema
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

  console.log(`✅ Risk assessment successfully calculated and saved for property ${propertyId}.`);
  
} catch (error) {
  console.error('❌ Error calculating risk assessment:', error);
  // Rethrow to allow the job queue to handle retries/failures
  throw error;
}
}


/**
* Main worker function to start all cron jobs and handle queued jobs.
* NOTE: The logic for pulling jobs from a queue (e.g., Redis/Bull) is not visible 
* in the provided files, but this structure allows for a handler to be plugged in.
*/
function startWorker() {
console.log('🚀 Worker started. Waiting for jobs...');

// Schedule sendMaintenanceReminders to run once per day at 9:00 AM
// (Cron format: minute hour day-of-month month day-of-week)
cron.schedule('0 9 * * *', sendMaintenanceReminders, {
  timezone: 'America/New_York', // Use a specific timezone
});

// Placeholder for job queue consumption (e.g., a Bull/Redis worker listener)
// When a job comes in, it would match the job type and call the handler:
/*
jobQueue.process(RISK_JOB_TYPES.CALCULATE_RISK, (job) => {
  return processRiskCalculation(job.data);
});
*/


// --- For demonstration purposes, run it once on startup ---
console.log('Running maintenance reminder job on startup for demo...');
sendMaintenanceReminders();
// --- End demonstration ---
}

// Start the worker
startWorker();