// apps/backend/src/services/RiskAssessment.service.ts

import { Prisma, Property, RiskAssessmentReport, Warranty, InsurancePolicy } from '@prisma/client'; 
import { prisma } from '../lib/prisma'; 
import { calculateAssetRisk, calculateTotalRiskScore, AssetRiskDetail } from '../utils/riskCalculator.util';
import { RISK_ASSET_CONFIG } from '../config/risk-constants';
import JobQueueService from './JobQueue.service';
import { RISK_JOB_TYPES } from '../config/risk-job-types';

// Extending Prisma types for complex queries
interface PropertyWithRelations extends Property {
  warranties: Warranty[];
  insurancePolicies: InsurancePolicy[];
  riskReport: RiskAssessmentReport | null;
}

class RiskAssessmentService {
  /**
   * Fetches an existing risk report. If it's missing or stale, a calculation job 
   * is queued in the background and 'QUEUED' is returned as a status.
   * * FIX: This is the sole implementation signature for this method.
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
    await JobQueueService.addJob(RISK_JOB_TYPES.CALCULATE_RISK, { propertyId });
    
    // 3. Return the stale report (if available) or the 'QUEUED' status for frontend handling
    return property.riskReport || 'QUEUED'; 
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
    const reportData = calculateTotalRiskScore(property as PropertyWithRelations, assetRisks);

    // 3. Save or Update the RiskAssessmentReport
    const updatedReport = await prisma.riskAssessmentReport.upsert({
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

    return updatedReport;
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