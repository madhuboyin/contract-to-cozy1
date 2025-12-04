// apps/backend/src/services/JobQueue.service.ts

import { Queue, Worker, Job } from 'bullmq'; 
import * as dotenv from 'dotenv'; 
dotenv.config();

// Imports for Property Intelligence System
import { PropertyIntelligenceJobType, PropertyIntelligenceJobPayload } from '../config/risk-job-types'; 
import RiskAssessmentService from './RiskAssessment.service'; // Use default import
import { FinancialReportService } from './FinancialReport.service'; // Use named import

// --- Shared Redis Connection Configuration ---
const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: 6379, // FIX: Hardcoded port from previous file
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
};

// Define the Queue instance shared by the client and worker
export const propertyIntelligenceQueue = new Queue<PropertyIntelligenceJobPayload>('property-intelligence-queue', { connection });

// Initialize services (instantiate the class)
const riskAssessmentService = RiskAssessmentService; // Use the default exported instance
const financialReportService = new FinancialReportService(); 


/**
 * Specialized Job Queue Service for Property Intelligence.
 */
export class JobQueueService {

    /**
     * Enqueues all property intelligence calculations for a given property.
     * This is typically called after a property is created or critical data is updated.
     * @param propertyId The ID of the property.
     */
    public async enqueuePropertyIntelligenceJobs(propertyId: string): Promise<void> {
        console.log(`[QUEUE-MANAGER] Enqueueing all intelligence jobs for property: ${propertyId}`);

        const defaultOptions = {
            attempts: 3, 
            backoff: { type: 'exponential', delay: 5000 },
        };

        const riskJob: PropertyIntelligenceJobPayload = {
            propertyId,
            jobType: PropertyIntelligenceJobType.CALCULATE_RISK_REPORT,
        };
        
        // NEW: Enqueue the Financial Efficiency Score calculation
        const fesJob: PropertyIntelligenceJobPayload = {
            propertyId,
            jobType: PropertyIntelligenceJobType.CALCULATE_FES,
        };

        // 1. Risk Report Job
        await propertyIntelligenceQueue.add(PropertyIntelligenceJobType.CALCULATE_RISK_REPORT, riskJob, { 
            jobId: `${propertyId}-${PropertyIntelligenceJobType.CALCULATE_RISK_REPORT}`,
            ...defaultOptions 
        });
        
        // 2. FES Report Job (NEW)
        await propertyIntelligenceQueue.add(PropertyIntelligenceJobType.CALCULATE_FES, fesJob, { 
            jobId: `${propertyId}-${PropertyIntelligenceJobType.CALCULATE_FES}`,
            ...defaultOptions
        });

        console.log(`[QUEUE-MANAGER] Enqueued Risk and FES jobs for ${propertyId}.`);
    }

    /**
     * The worker function that processes jobs from the queue.
     * @param job The BullMQ job object.
     */
    private async processJob(job: Job<PropertyIntelligenceJobPayload>): Promise<void> {
        const { propertyId, jobType } = job.data;
        console.log(`[WORKER] Processing Job [${jobType}] for Property [${propertyId}] (Job ID: ${job.id})`);
    
        try {
            switch (jobType) {
                case PropertyIntelligenceJobType.CALCULATE_RISK_REPORT:
                    console.log(`[${new Date().toISOString()}] Processing Risk calculation for property ${propertyId}...`);
                    await riskAssessmentService.calculateAndSaveReport(propertyId);
                    break;
    
                case PropertyIntelligenceJobType.CALCULATE_FES:
                    console.log(`[${new Date().toISOString()}] Processing FES calculation for property ${propertyId}...`);
                    // FIX: Actually call the calculation method instead of just logging a warning
                    await financialReportService.calculateAndSaveFES(propertyId);
                    console.log(`✅ FES calculation completed for property ${propertyId}`);
                    break;
    
                default:
                    console.warn(`[WORKER] Unknown job type: ${jobType}`);
            }
    
            console.log(`[WORKER] Successfully completed Job [${jobType}] for Property [${propertyId}]`);
        } catch (error: any) {
            console.error(`[WORKER] Job [${jobType}] failed for property ${propertyId}:`, error.message);
            throw error;
        }
    }
    
    /**
     * Starts the BullMQ Worker to process jobs.
     */
    public startWorker() {
        const worker = new Worker<PropertyIntelligenceJobPayload>(
            propertyIntelligenceQueue.name,
            (job) => this.processJob(job), 
            { connection, concurrency: 5 }
        );

        worker.on('completed', job => {
            console.log(`[WORKER] Job ${job.id} (${job.data.jobType}) completed.`);
        });

        worker.on('failed', (job, err) => {
            console.error(`[WORKER] Job ${job?.id} (${job?.data.jobType}) failed with error: ${err.message}`);
        });

        console.log(`[WORKER] Property Intelligence Worker started for queue: ${propertyIntelligenceQueue.name}`);
        return worker;
    }

    /**
     * Compatibility wrapper for other services (like RiskAssessment.service) that use a generic addJob call.
     */
    async addJob(jobName: PropertyIntelligenceJobType, data: PropertyIntelligenceJobPayload, options?: any): Promise<void> {
        console.log(`[QUEUE] Job added (Compatibility): ${jobName} for Property ID: ${data.propertyId}`);
        
        await propertyIntelligenceQueue.add(
            jobName, 
            data,    
            { 
                ...options, 
                attempts: 3, 
                backoff: {
                    type: 'exponential',
                    delay: 5000,
                },
            }
        );
    }
}

// Export a single instance for use by controllers and other services
export default new JobQueueService();