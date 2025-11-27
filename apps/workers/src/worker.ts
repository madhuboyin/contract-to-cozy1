// apps/workers/src/worker.ts

// -----------------------------------------------------------------------------
// IMPORTS AND CONFIGURATION
// -----------------------------------------------------------------------------
import { PrismaClient, ChecklistItemStatus } from '@prisma/client';
import cron from 'node-cron';

// NOTE ON COMPILATION ERRORS:
// 1. Module 'bullmq' not found: You must run 'npm install bullmq' in your workers app.
// 2. rootDir error: This requires updating apps/workers/tsconfig.json to allow imports 
//    from the backend directory (e.g., adding "rootDir": "../" or configuring "paths").
import { Worker, Job } from 'bullmq'; 
import dotenv from 'dotenv'; 

// Import services and job constants from the backend application within the monorepo
// NOTE: Adjust paths if your specific monorepo setup is different
//import { RISK_JOB_TYPES } from '../../backend/src/config/risk-job-types'; 
import { RISK_JOB_TYPES } from './config/risk-job-types';
import RiskAssessmentService from '../../backend/src/services/RiskAssessment.service'; 

dotenv.config();

const prisma = new PrismaClient();

// Job queue connection details (Assuming Redis is used via environment variables)
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const WORKER_QUEUE_NAME = process.env.WORKER_QUEUE_NAME || 'main-background-queue';

const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
};

// A placeholder for a real email service (EXISTING LOGIC)
const emailService = {
  send: async (to: string, subject: string, body: string) => {
    console.log('---------------------------------');
    console.log(`📧 SIMULATING EMAIL SEND 📧`);
    console.log(`   To: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log('---------------------------------');
    await new Promise(resolve => setTimeout(resolve, 50));
    return { success: true };
  },
};


// -----------------------------------------------------------------------------
// EXISTING CRON JOB LOGIC (Maintenance Reminders)
// -----------------------------------------------------------------------------

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
          lte: sevenDaysFromNow, 
          gte: today, 
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

    await Promise.all(
      tasksDueSoon.map(async (task) => {
        const user = task.checklist.homeownerProfile.user;
        const dueDate = task.nextDueDate?.toLocaleDateString() || 'Unknown Date';

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


// -----------------------------------------------------------------------------
// NEW: ASYNCHRONOUS JOB PROCESSOR (For Risk Assessment and other queue jobs)
// -----------------------------------------------------------------------------

/**
 * Processes incoming jobs from the BullMQ queue.
 */
async function jobProcessor(job: Job) {
    console.log(`[WORKER] Processing queued job: ${job.name} (ID: ${job.id})`);

    switch (job.name) {
        
        // --- RISK ASSESSMENT JOB HANDLER (Phase 1.5) ---
        case RISK_JOB_TYPES.CALCULATE_RISK:
            const { propertyId } = job.data;
            if (!propertyId) {
                throw new Error('CALCULATE_RISK job data missing required propertyId.');
            }
            console.log(`[RISK] Starting calculation for property: ${propertyId}`);
            
            try {
                // Execute the heavy calculation logic and save the report to the DB
                await RiskAssessmentService.calculateAndSaveReport(propertyId);
                console.log(`[RISK] Calculation complete for property: ${propertyId}`);
            } catch (error) {
                console.error(`[RISK] Failed to calculate risk for ${propertyId}:`, error);
                // Throwing the error here tells BullMQ to mark the job as failed and retry
                throw error; 
            }
            break;

        default:
            console.warn(`[WORKER] Unknown job type received: ${job.name}`);
            break;
    }
}


// -----------------------------------------------------------------------------
// WORKER INITIALIZATION AND START
// -----------------------------------------------------------------------------

/**
 * Main worker function to start all cron jobs and begin listening to the job queue.
 */
function startWorker() {
  console.log('🚀 Worker started. Setting up cron schedules and queue listener...');

  // 1. Setup Scheduled Cron Jobs (EXISTING LOGIC)
  // Schedule sendMaintenanceReminders to run once per day at 9:00 AM
  cron.schedule('0 9 * * *', sendMaintenanceReminders, {
    timezone: 'America/New_York', 
  });
  console.log('✅ Cron job scheduled: Daily maintenance reminders at 9:00 AM EST.');

  // Run it once on startup for demo purposes (EXISTING LOGIC)
  console.log('Running maintenance reminder job on startup for demo...');
  sendMaintenanceReminders();

  // 2. Setup Asynchronous Job Queue Listener (NEW LOGIC)
  const worker = new Worker(WORKER_QUEUE_NAME, jobProcessor, {
    connection: connection,
    concurrency: 5, 
  });
  
  worker.on('ready', () => {
    console.log(`✅ Queue Listener connected to Redis and ready for jobs from queue: ${WORKER_QUEUE_NAME}`);
  });

  // FIX: Explicitly type err and job
  worker.on('error', (err: Error) => { 
    console.error('❌ Queue Listener error:', err);
  });
  
  // FIX: Explicitly type job and err
  worker.on('failed', (job: Job, err: Error) => { 
    console.warn(`Job ${job?.id} (${job?.name}) failed: ${err.message}. Retries: ${job?.attemptsMade}/${job?.opts.attempts}`);
  });

  // FIX: Explicitly type job
  worker.on('completed', (job: Job) => { 
    console.log(`Job ${job.id} (${job.name}) completed successfully.`);
  });
  
  // Cleanly shut down the worker on process exit
  process.on('SIGINT', async () => {
    console.log('Worker shutting down...');
    await worker.close(); 
    process.exit(0);
  });
}

// Start the worker
startWorker();