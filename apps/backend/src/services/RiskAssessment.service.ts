// apps/backend/src/services/RiskAssessment.service.ts

import { Prisma, Property, RiskAssessmentReport, Warranty, InsurancePolicy } from '@prisma/client'; 
import { prisma } from '../lib/prisma'; 
import { calculateAssetRisk, calculateTotalRiskScore, AssetRiskDetail } from '../utils/riskCalculator.util';
import { RISK_ASSET_CONFIG } from '../config/risk-constants';
// Import the singleton instance (the value) AND the named constant
import JobQueueService, { propertyIntelligenceQueue } from './JobQueue.service'; 
import { PropertyIntelligenceJobType, PropertyIntelligenceJobPayload } from '../config/risk-job-types'; // UPDATED IMPORT

// Extending Prisma types for complex queries
interface PropertyWithRelations extends Property {
  warranties: Warranty[];
  insurancePolicies: InsurancePolicy[];
  riskReport: RiskAssessmentReport | null;
}

// [NEW TYPE] Lightweight return type for the dashboard summary
export type RiskSummaryDto = {
  propertyId: string;
  propertyName: string | null;
  riskScore: number;
  financialExposureTotal: Prisma.Decimal;
  lastCalculatedAt: Date;
  status: 'CALCULATED' | 'QUEUED' | 'MISSING_DATA' | 'NO_PROPERTY';
};

class RiskAssessmentService {

  private get jobQueueService(): typeof JobQueueService { 
    return JobQueueService; 
  }

  /**
   * Fetches an existing risk report. If it's missing or stale, a calculation job 
   * is queued in the background and 'QUEUED' is returned as a status.
   */
  async getOrCreateRiskReport(propertyId: string): Promise<RiskAssessmentReport | 'QUEUED'> {
    const property = await this.fetchPropertyDetails(propertyId);
    if (!property) {
      throw new Error("Property not found.");
    }

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    // 1. Check if a recent report exists
    if (property.riskReport && property.riskReport.lastCalculatedAt.getTime() > thirtyMinutesAgo.getTime()) {
      return property.riskReport;
    }

    // 2. Report is stale or missing - Queue calculation job for the worker
    const payload: PropertyIntelligenceJobPayload = {
      propertyId,
      jobType: PropertyIntelligenceJobType.CALCULATE_RISK_REPORT, // UPDATED USAGE
    };
    // Use the explicit jobType for the queue add and cast JobQueueService to any to resolve import/type issues
    await (this.jobQueueService as any).addJob(PropertyIntelligenceJobType.CALCULATE_RISK_REPORT, payload); 
    
    // 3. Return the stale report (if available) or the 'QUEUED' status for frontend handling
    return property.riskReport || 'QUEUED'; 
  }

  // [NEW METHOD] Lightweight summary for the dashboard
  async getPrimaryPropertyRiskSummary(userId: string): Promise<RiskSummaryDto | null> {
    // 1. Find the primary property for the user
    const primaryProperty = await prisma.property.findFirst({
      where: {
        homeownerProfile: {
          userId: userId,
        },
        isPrimary: true,
      },
      select: {
        id: true,
        name: true,
        riskReport: {
          select: {
            riskScore: true,
            financialExposureTotal: true,
            lastCalculatedAt: true,
          }
        }
      }
    });

    if (!primaryProperty) {
      // Return special status for frontend handling
      return {
        propertyId: '',
        propertyName: null,
        riskScore: 0,
        financialExposureTotal: new Prisma.Decimal(0),
        lastCalculatedAt: new Date(0),
        status: 'NO_PROPERTY',
      }; 
    }

    const report = primaryProperty.riskReport;
    const propertyId = primaryProperty.id;
    const propertyName = primaryProperty.name;
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    // Default values if no report exists (and we queue calculation)
    const baseResult: Omit<RiskSummaryDto, 'status'> = {
      riskScore: report?.riskScore || 0,
      financialExposureTotal: report?.financialExposureTotal || new Prisma.Decimal(0),
      lastCalculatedAt: report?.lastCalculatedAt || new Date(0),
      propertyId,
      propertyName,
    };


    // 2. Check for missing report
    if (!report) {
      // Queue calculation job for missing report
      await this.jobQueueService.addJob(PropertyIntelligenceJobType.CALCULATE_RISK_REPORT, { 
        propertyId,
        jobType: PropertyIntelligenceJobType.CALCULATE_RISK_REPORT 
      });
      
      // FIX 1: If report is entirely missing, return QUEUED status.
      return {
        ...baseResult,
        status: 'QUEUED',
      };
    }
    
    const jobName = PropertyIntelligenceJobType.CALCULATE_RISK_REPORT;
    const jobId = `${propertyId}-${jobName}`;
    
    // FIX 2: Check if a job is actively running/queued for this property
    const jobStatus = await propertyIntelligenceQueue.getJob(jobId);
    
    if (jobStatus) {
        const state = await jobStatus.getState();
        if (['waiting', 'active', 'delayed', 'prioritized'].includes(state)) {
            // If job is actively running/queued, ALWAYS show the QUEUED status on the card
            return {
                ...baseResult,
                status: 'QUEUED',
            };
        }
    }


    // 3. Check if report is stale (queue refresh)
    if (report.lastCalculatedAt.getTime() < thirtyMinutesAgo.getTime()) {
      // Queue background refresh for stale report
      this.jobQueueService.addJob(PropertyIntelligenceJobType.CALCULATE_RISK_REPORT, { 
        propertyId,
        jobType: PropertyIntelligenceJobType.CALCULATE_RISK_REPORT 
      });
      
      // FIX 3: If stale and no job is active, return CALCULATED. 
      // This displays the old score, fixing the permanent "Calculating" screen.
      return {
        ...baseResult,
        status: 'CALCULATED',
      };
    }

    // 4. Report is fresh - Return calculated report
    return {
      ...baseResult,
      status: 'CALCULATED',
    };
  }
  
  /**
   * Main logic for calculating the risk score for a property. 
   * This is exclusively called by the background worker.
   */
  async calculateAndSaveReport(
    propertyId: string,
    property?: PropertyWithRelations
  ): Promise<RiskAssessmentReport> {
    
    let fetchedProperty: PropertyWithRelations | null | undefined = property; 
    let reportData: any; 

    try {
        // --- STEP 0: FETCH AND VALIDATE PROPERTY (MUST BE FIRST) ---
        if (!fetchedProperty) {
            fetchedProperty = await this.fetchPropertyDetails(propertyId);
            if (!fetchedProperty) {
                // Throwing this will be caught below to create the failure report
                throw new Error("Property not found or access denied for calculation.");
            }
        }
        property = fetchedProperty;

        // --- STEP 1: CHECK FOR ESSENTIAL DATA (FIX for permanent QUEUED status) ---
        const isBasicDataMissing = !property.propertySize || !property.yearBuilt; 

        if (isBasicDataMissing) {
             console.warn(`[RISK-CALC] Skipping full calculation for ${propertyId}: Basic property data missing (Size/Year Built). Persisting fallback report.`);
             // Skip complex calculation and set fallback report data
             reportData = {
                riskScore: 0,
                financialExposureTotal: new Prisma.Decimal(0),
                details: [{ 
                    assetName: 'Data Missing', 
                    systemType: 'System', 
                    category: 'SAFETY' as any, 
                    age: 0, 
                    expectedLife: 0, 
                    replacementCost: 0, 
                    probability: 1,       
                    coverageFactor: 0,    
                    outOfPocketCost: 0,   
                    riskDollar: 0,        
                    riskLevel: 'HIGH',
                    actionCta: 'CRITICAL: Complete property details to run full assessment.',
                }],
                lastCalculatedAt: new Date(),
            };
        } else {
            // --- STEP 2: Execute Complex Calculation ---
            const currentYear = new Date().getFullYear();
            const assetRisks: AssetRiskDetail[] = [];

            for (const config of RISK_ASSET_CONFIG) {
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

            const calculatedResult = calculateTotalRiskScore(property as PropertyWithRelations, assetRisks);
            
            reportData = {
                ...calculatedResult,
                lastCalculatedAt: new Date(),
            };
        }

    } catch (error: any) { // Final catch for any unexpected errors during fetch/validation
        console.error(`RISK CALCULATION FAILED (Fatal Error during Job) for property ${propertyId}:`, error);
        
        // --- DEFENSIVE FALLBACK ON FATAL FAILURE ---
        reportData = {
            riskScore: 0,
            financialExposureTotal: new Prisma.Decimal(0),
            details: [{ 
                assetName: 'Fatal Error', 
                systemType: 'System', 
                category: 'SAFETY' as any, 
                age: 0, 
                expectedLife: 0, 
                replacementCost: 0, 
                probability: 1,       
                coverageFactor: 0,    
                outOfPocketCost: 0,   
                riskDollar: 0,        
                riskLevel: 'HIGH',
                actionCta: `CRITICAL: Calculation failed. Error: ${error.message || 'Unknown'}.`,
            }],
            lastCalculatedAt: new Date(),
        };
    }
    
    // --- STEP 3: PERSIST REPORT (Guaranteed job completion) ---
    const updatedReport = await prisma.riskAssessmentReport.upsert({
      where: { propertyId: propertyId },
      update: {
        riskScore: reportData.riskScore,
        financialExposureTotal: reportData.financialExposureTotal, 
        details: reportData.details as unknown as Prisma.InputJsonValue,
        lastCalculatedAt: reportData.lastCalculatedAt,
      },
      create: {
        propertyId: propertyId,
        riskScore: reportData.riskScore,
        financialExposureTotal: reportData.financialExposureTotal,
        details: reportData.details as unknown as Prisma.InputJsonValue,
        lastCalculatedAt: reportData.lastCalculatedAt,
      },
    });

    // The persistence step marks the job as complete in the queue.
    return updatedReport;
  }
  
  /**
   * [NEW METHOD - PHASE 3.4] Placeholder for generating the PDF report.
   */
  async generateRiskReportPdf(propertyId: string): Promise<Buffer> {
    // 1. Fetch the data needed for the report
    const report = await this.getOrCreateRiskReport(propertyId);

    if (report === 'QUEUED') {
        // Handle case where report is still calculating
        throw new Error("Risk assessment report is currently calculating. Please try again in a moment.");
    }

    // 2. Mock PDF content (a simple 1x1 pixel GIF/PNG is often used for mock binary data)
    // A simple 1x1 pixel transparent PNG buffer (100 bytes) is used here for safety.
    const mockPdfContent = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );

    console.log(`[PDF] Generated mock PDF buffer for property ${propertyId}.`);

    return mockPdfContent;
  }

  /**
   * Private helper to fetch property details with all required relations.
   */
  private async fetchPropertyDetails(propertyId: string): Promise<PropertyWithRelations | null> {
    return prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        warranties: true,
        insurancePolicies: true,
        riskReport: true, 
      },
    }) as Promise<PropertyWithRelations | null>;
  }
}

export default new RiskAssessmentService();