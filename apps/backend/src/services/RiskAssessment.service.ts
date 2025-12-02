// apps/backend/src/services/RiskAssessment.service.ts

import { Prisma, Property, RiskAssessmentReport, Warranty, InsurancePolicy } from '@prisma/client'; 
import { prisma } from '../lib/prisma'; 
import { calculateAssetRisk, calculateTotalRiskScore, AssetRiskDetail } from '../utils/riskCalculator.util';
import { RISK_ASSET_CONFIG } from '../config/risk-constants';
// FIX 1: Import the named export propertyIntelligenceQueue for job status checking
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
  /**
   * Private getter to retrieve the JobQueueService instance for compatibility with existing code.
   */
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
      await this.jobQueueService.addJob(PropertyIntelligenceJobType.CALCULATE_RISK_REPORT, { 
        propertyId,
        jobType: PropertyIntelligenceJobType.CALCULATE_RISK_REPORT 
      });
      
      // FIX 3: If stale and no job is active (checked above), return CALCULATED.
      // This displays the old data, avoiding the continuous "Calculating..." message.
      // The background job queued above will eventually update this.
    }

    // 4. Report is fresh or stale but displayable - Return calculated report
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
    
    // Fetch detailed property data if not provided (needed by the worker job handler)
    if (!property) {
      const fetchedProperty = await this.fetchPropertyDetails(propertyId);
      if (!fetchedProperty) {
        throw new Error("Property not found for calculation.");
      }
      property = fetchedProperty;
    }

    const currentYear = new Date().getFullYear();
    const assetRisks: AssetRiskDetail[] = [];
    let reportData: any; 

    try {
        // 1. Calculate Risk for each configured asset
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

        // 2. Calculate Total Risk Score and Financial Exposure
        const calculatedResult = calculateTotalRiskScore(property as PropertyWithRelations, assetRisks);
        
        reportData = {
            ...calculatedResult,
            lastCalculatedAt: new Date(), // Explicitly set success time
        };

    } catch (error) {
        console.error(`RISK CALCULATION FAILED for property ${propertyId}:`, error);
        
        // --- DEFENSIVE FALLBACK ON FAILURE ---
        // Create a failure report to break the QUEUED loop on the frontend.
        reportData = {
            riskScore: 0,
            financialExposureTotal: new Prisma.Decimal(0),
            details: [{ 
                assetName: 'Calculation Failure', 
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
                actionCta: 'CRITICAL: Data issue preventing risk calculation.',
            }],
            lastCalculatedAt: new Date(), // Set time to break the queue loop
        };
        // --- END FALLBACK ---
    }


    // 3. Save or Update the RiskAssessmentReport - This step always runs now
    const updatedReport = await prisma.riskAssessmentReport.upsert({
      where: { propertyId: propertyId },
      update: {
        riskScore: reportData.riskScore,
        financialExposureTotal: reportData.financialExposureTotal, 
        // FIX: Use explicit double cast to satisfy TypeScript's stricter check for Json fields
        details: reportData.details as unknown as Prisma.InputJsonValue,
        lastCalculatedAt: reportData.lastCalculatedAt,
      },
      create: {
        propertyId: propertyId,
        riskScore: reportData.riskScore,
        financialExposureTotal: reportData.financialExposureTotal,
        // FIX: Use explicit double cast to satisfy TypeScript's stricter check for Json fields
        details: reportData.details as unknown as Prisma.InputJsonValue,
        lastCalculatedAt: reportData.lastCalculatedAt, // Ensure create also uses the calculated time
      },
    });

    return updatedReport;
  }
  
  /**
   * [NEW METHOD - PHASE 3.4] Placeholder for generating the PDF report.
   * In a real application, this would use a library like Puppeteer or PDFKit.
   * @returns A Buffer containing the PDF data.
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

    // In production: Use Puppeteer/PDFKit to render HTML template using 'report' data into a real PDF Buffer.
    // return puppeteerService.generatePdf(report); 

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