// apps/backend/src/services/FinancialReport.service.ts

import { prisma } from '../lib/prisma';
import { calculateFinancialEfficiency } from '../utils/FinancialCalculator.util';
import { FinancialEfficiencyReport, PropertyType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
// Import the singleton instance (the value) AND the named constant
import JobQueueService, { propertyIntelligenceQueue } from './JobQueue.service'; 
import { PropertyIntelligenceJobType, PropertyIntelligenceJobPayload } from '../config/risk-job-types'; 
import { FinancialCalculationResult } from '../utils/FinancialCalculator.util';


// Define expected structure for the public-facing report summary
export interface FinancialReportSummary {
    propertyId: string;
    financialEfficiencyScore: number;
    financialExposureTotal: number; // This is the sum of AC for the summary card
    status: 'CALCULATED' | 'QUEUED' | 'MISSING_DATA' | 'NO_PROPERTY';
    lastCalculatedAt: Date | null;
}

// --- Main Service Logic (Phase 2.2) ---
export class FinancialReportService {

    private get jobQueueService(): typeof JobQueueService { 
        // Access the singleton instance of the JobQueueService
        return JobQueueService; 
    }

    /**
     * Executes the FES calculation and persists the result to the database.
     * This method is called by the BullMQ worker.
     * @param propertyId The ID of the property to calculate the score for.
     * @returns The saved FinancialEfficiencyReport object.
     */
    public async calculateAndSaveFES(propertyId: string): Promise<FinancialEfficiencyReport> {
        console.log(`Starting FES calculation for property: ${propertyId}`);
        
        // 1. Fetch property with all financial data
        const property = await prisma.property.findUnique({
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
            throw new Error(`Property with ID ${propertyId} not found.`);
        }
    
        // 2. Get benchmark
        let benchmark: any = null;
        if (property.propertyType) {
            benchmark = await prisma.financialEfficiencyConfig.findUnique({
                where: { 
                    zipCode_propertyType: { 
                        zipCode: property.zipCode, 
                        propertyType: property.propertyType 
                    } 
                },
            });
            
            if (!benchmark) {
                benchmark = await prisma.financialEfficiencyConfig.findFirst({
                    where: { zipCode: null, propertyType: property.propertyType },
                });
            }
        }
    
        // 3. Calculate (using pure function)
        const result = calculateFinancialEfficiency({
            property,
            insurancePolicies: property.insurancePolicies,
            warranties: property.warranties,
            utilityExpenses: property.expenses,
            benchmark,
        });
    
        // Calculate the Financial Exposure Total (Actual Cost, AC_Total) for logging/return value
        const financialExposureTotal = result.actualInsuranceCost
            .plus(result.actualUtilityCost)
            .plus(result.actualWarrantyCost);
    
        // 4. Persist the result to the database (using upsert)
        const report = await prisma.financialEfficiencyReport.upsert({
            where: { propertyId },
            update: {
                financialEfficiencyScore: result.score,
                actualInsuranceCost: result.actualInsuranceCost,
                actualUtilityCost: result.actualUtilityCost,
                actualWarrantyCost: result.actualWarrantyCost,
                marketAverageTotal: result.marketAverageTotal,
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
    
        console.log(`FES report saved for ${propertyId}. Score: ${report.financialEfficiencyScore}, Exposure: ${financialExposureTotal.toFixed(2)}`);
        return report;
    }
    
    /**
     * Retrieves the summary report (used by the dashboard scorecard).
     * This method handles queuing the job if the report is missing or checking its status.
     * @param propertyId The ID of the property (can be undefined during initial load).
     */
    public async getFinancialEfficiencySummary(propertyId: string | undefined): Promise<FinancialReportSummary> {
        
        // FIX: Exit gracefully if propertyId is missing or invalid
        if (!propertyId || typeof propertyId !== 'string') {
            return {
                propertyId: '',
                financialEfficiencyScore: 0,
                financialExposureTotal: 0,
                status: 'NO_PROPERTY', 
                lastCalculatedAt: null,
            };
        }

        const report = await prisma.financialEfficiencyReport.findUnique({
            where: { propertyId },
        });

        const jobName = PropertyIntelligenceJobType.CALCULATE_FES;
        const jobId = `${propertyId}-${jobName}`;
        // Access propertyIntelligenceQueue directly from the import
        const jobStatus = await propertyIntelligenceQueue.getJob(jobId);
        
        // 1. Check if the job is currently queued/running
        if (jobStatus) {
            const status = await jobStatus.getState();
             if (['waiting', 'active', 'delayed', 'prioritized'].includes(status)) {
                return {
                    propertyId,
                    financialEfficiencyScore: 0,
                    financialExposureTotal: 0,
                    status: 'QUEUED', 
                    lastCalculatedAt: report?.lastCalculatedAt || null,
                };
             }
        }
        
        // 2. If no report exists (and not queued/running), queue a job and return QUEUED
        if (!report) {
            const jobData = { propertyId, jobType: jobName };
            // Queue the job via the JobQueueService
            if (!jobStatus) {
                console.log(`[FES-SERVICE] Report missing. Queuing initial job: ${jobId}`);
                await this.jobQueueService.addJob(jobName, jobData, { jobId });
            }
            
             return {
                propertyId,
                financialEfficiencyScore: 0,
                financialExposureTotal: 0,
                status: 'QUEUED', 
                lastCalculatedAt: null,
            };
        }

        // 3. Calculate Actual Total Cost (Exposure)
        const actualTotal = report.actualInsuranceCost.plus(report.actualUtilityCost).plus(report.actualWarrantyCost);
        
        // 4. Check for missing benchmark data or zero input data
        if (report.marketAverageTotal.equals(0) || actualTotal.equals(0)) {
            // This case indicates either no benchmark was found or the user hasn't entered any financial data.
            return {
                propertyId,
                financialEfficiencyScore: 0,
                financialExposureTotal: 0,
                status: 'MISSING_DATA',
                lastCalculatedAt: report.lastCalculatedAt,
            };
        }
        
        // 5. Report exists and is CALCULATED
        return {
            propertyId,
            financialEfficiencyScore: report.financialEfficiencyScore,
            financialExposureTotal: actualTotal.toNumber(),
            status: 'CALCULATED',
            lastCalculatedAt: report.lastCalculatedAt,
        };
    }
    
    /**
     * Retrieves the full detailed FES report.
     */
    public async getFinancialEfficiencyReport(propertyId: string): Promise<FinancialEfficiencyReport | 'QUEUED' | 'MISSING_DATA'> {
        
        // FIX: Exit gracefully if propertyId is missing
        if (!propertyId || typeof propertyId !== 'string') {
             // In the detailed report, this should probably be handled by the controller 
             // ensuring propertyId is present, but for safety:
             return 'MISSING_DATA';
        }

        const report = await prisma.financialEfficiencyReport.findUnique({
            where: { propertyId },
        });

        const jobName = PropertyIntelligenceJobType.CALCULATE_FES;
        const jobId = `${propertyId}-${jobName}`;
        // Access propertyIntelligenceQueue directly from the import
        const jobStatus = await propertyIntelligenceQueue.getJob(jobId);

        // Check for active job first (even if a stale report exists)
        if (jobStatus) {
            const status = await jobStatus.getState();
             if (['waiting', 'active', 'delayed', 'prioritized'].includes(status)) {
                return 'QUEUED';
             }
        }

        // Check if report is missing
        if (!report) {
            // Queue a job if missing and not currently active/waiting (checked above)
            if (!jobStatus) {
                const jobData = { propertyId, jobType: jobName };
                console.log(`[FES-SERVICE] Detailed report missing. Queuing initial job: ${jobId}`);
                await this.jobQueueService.addJob(jobName, jobData, { jobId });
            }
            return 'QUEUED';
        }

        // Check for missing data in an existing report
        const actualTotal = report.actualInsuranceCost.plus(report.actualUtilityCost).plus(report.actualWarrantyCost);
        if (report.marketAverageTotal.equals(0) || actualTotal.equals(0)) {
            return 'MISSING_DATA';
        }

        return report;
    }

    /**
     * Queues a recalculation job for the FES report.
     * @param propertyId The ID of the property.
     */
    public async queueRecalculation(propertyId: string): Promise<void> {
        const jobName = PropertyIntelligenceJobType.CALCULATE_FES;
        // Use a unique ID based on time to ensure a new job is created every time
        const jobId = `${propertyId}-${jobName}-recalc-${Date.now()}`; 
        
        const jobData = { propertyId, jobType: jobName };
        await this.jobQueueService.addJob(jobName, jobData, { jobId });
        console.log(`[FES-SERVICE] Manually queued FES recalculation for ${propertyId} with job ID: ${jobId}`);
    }
}