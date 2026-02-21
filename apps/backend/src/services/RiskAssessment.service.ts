// apps/backend/src/services/RiskAssessment.service.ts

import {
  Prisma,
  Property,
  RiskAssessmentReport,
  Warranty,
  InsurancePolicy,
  InventoryItem,
  InventoryRoom,
  RiskCategory,
} from '@prisma/client';

import { prisma } from '../lib/prisma'; 
import { calculateAssetRisk, calculateTotalRiskScore, filterRelevantAssets, AssetRiskDetail } from '../utils/riskCalculator.util';
import { RISK_ASSET_CONFIG } from '../config/risk-constants';
import JobQueueService, { propertyIntelligenceQueue } from './JobQueue.service'; 
import { PropertyIntelligenceJobType, PropertyIntelligenceJobPayload } from '../config/risk-job-types';
// PHASE 2.4 INTEGRATION
import { createTasksFromRiskAssessment } from './riskAssessmentIntegration.service';

interface PropertyWithRelations extends Property {
  warranties: Warranty[];
  insurancePolicies: InsurancePolicy[];
  riskReport: RiskAssessmentReport | null;

  // ✅ New: Inventory source of truth
  inventoryItems: Array<
    InventoryItem & {
      room?: Pick<InventoryRoom, 'id' | 'name'> | null;
    }
  >;
}


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

  async getOrCreateRiskReport(propertyId: string): Promise<RiskAssessmentReport | 'QUEUED'> {
    const property = await this.fetchPropertyDetails(propertyId);
    if (!property) {
      throw new Error("Property not found.");
    }

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    if (property.riskReport && property.riskReport.lastCalculatedAt.getTime() > thirtyMinutesAgo.getTime()) {
      return property.riskReport;
    }

    const payload: PropertyIntelligenceJobPayload = {
      propertyId,
      jobType: PropertyIntelligenceJobType.CALCULATE_RISK_REPORT,
    };
    await (this.jobQueueService as any).addJob(PropertyIntelligenceJobType.CALCULATE_RISK_REPORT, payload); 
    
    return property.riskReport || 'QUEUED'; 
  }

  async getPrimaryPropertyRiskSummary(userId: string): Promise<RiskSummaryDto | null> {
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

    const baseResult: Omit<RiskSummaryDto, 'status'> = {
      riskScore: report?.riskScore || 0,
      financialExposureTotal: report?.financialExposureTotal || new Prisma.Decimal(0),
      lastCalculatedAt: report?.lastCalculatedAt || new Date(0),
      propertyId,
      propertyName,
    };

    if (!report) {
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
    
    const jobStatus = await propertyIntelligenceQueue.getJob(jobId);
    
    if (jobStatus) {
        const state = await jobStatus.getState();
        if (['waiting', 'active', 'delayed', 'prioritized'].includes(state)) {
            return {
                ...baseResult,
                status: 'QUEUED',
            };
        }
    }

    if (report.lastCalculatedAt.getTime() < thirtyMinutesAgo.getTime()) {
      this.jobQueueService.addJob(PropertyIntelligenceJobType.CALCULATE_RISK_REPORT, { 
        propertyId,
        jobType: PropertyIntelligenceJobType.CALCULATE_RISK_REPORT 
      });
      
      return {
        ...baseResult,
        status: 'CALCULATED',
      };
    }

    return {
      ...baseResult,
      status: 'CALCULATED',
    };
  }
  
  /**
   * Main logic for calculating the risk score for a property.
   * PHASE 2.4 INTEGRATION: Now auto-creates maintenance tasks for HIGH/CRITICAL risks
   */
  async calculateAndSaveReport(
    propertyId: string,
    property?: PropertyWithRelations
  ): Promise<RiskAssessmentReport> {
    
    let fetchedProperty: PropertyWithRelations | null | undefined = property; 
    let reportData: any; 
    let finalError: any = null; 
    let isBasicDataMissing: boolean = false;

    try {
        // --- STEP 0: FETCH AND VALIDATE PROPERTY ---
        if (!fetchedProperty) {
            fetchedProperty = await this.fetchPropertyDetails(propertyId);
            if (!fetchedProperty) {
                throw new Error("Property not found or access denied for calculation.");
            }
        }
        property = fetchedProperty;

        // --- STEP 1: CONDITIONAL CALCULATION START ---
        isBasicDataMissing = !property.propertySize || !property.yearBuilt; 

        if (isBasicDataMissing) {
             console.warn(`[RISK-CALC] Skipping full calculation for ${propertyId}: Basic property data missing.`);
             
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
        } 
        const currentYear = new Date().getFullYear();
        const assetRisks: AssetRiskDetail[] = [];
        
        if (isBasicDataMissing) {
          console.warn(`[RISK-CALC] Basic property data missing for ${propertyId}. Running inventory-only assessment.`);
        } else {
          console.log(`[RISK-SERVICE] Filtering assets for property ${propertyId}...`);
          const relevantConfigs = filterRelevantAssets(property as PropertyWithRelations, RISK_ASSET_CONFIG);
          console.log(`[RISK-SERVICE] Filtered from ${RISK_ASSET_CONFIG.length} to ${relevantConfigs.length} relevant assets`);
        
          for (const config of relevantConfigs) {
            const assetRisk = calculateAssetRisk(
              config.systemType,
              config,
              property as PropertyWithRelations,
              currentYear
            );
            if (assetRisk) assetRisks.push(assetRisk);
          }
        }
        
        // ✅ Always include inventory major appliances (single source of truth)
        try {
          const invRisks = this.buildMajorApplianceRisksFromInventory(
            property as PropertyWithRelations,
            currentYear
          );
          if (invRisks.length > 0) {
            assetRisks.push(...invRisks);
            console.log(`[RISK-SERVICE] Added ${invRisks.length} MAJOR_APPLIANCE inventory risks`);
          }
        } catch (e) {
          console.warn('[RISK-SERVICE] Failed to build inventory major appliance risks', e);
        }

        // Property-level resilience impact: sump-pump backup reduces basement flood risk.
        assetRisks.push(this.buildBasementFloodRisk(property as PropertyWithRelations));
        
        console.log(`[RISK-SERVICE] Calculated risk for ${assetRisks.length} assets`);
        
        const calculatedResult = calculateTotalRiskScore(property as PropertyWithRelations, assetRisks);
        
        reportData = {
          ...calculatedResult,
          lastCalculatedAt: new Date(),
        };        

    } catch (error: any) {
        console.error(`RISK CALCULATION FAILED for property ${propertyId}:`, error);
        finalError = error;
        
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
    
    // --- STEP 3: PERSIST REPORT ---
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

    // --- PHASE 2.4 INTEGRATION: AUTO-CREATE MAINTENANCE TASKS ---
    try {
      // Get property with homeowner profile to get userId
      const propertyWithProfile = await prisma.property.findUnique({
        where: { id: propertyId },
        include: {
          homeownerProfile: true,
        },
      });

      if (propertyWithProfile && !isBasicDataMissing && !finalError) {
        // Extract HIGH/CRITICAL risk recommendations
        const recommendations = (reportData.details as AssetRiskDetail[])
          .filter((c: AssetRiskDetail) => c.riskLevel === 'HIGH' || c.riskLevel === 'CRITICAL')
          .filter((c: AssetRiskDetail) => !String(c.systemType || '').startsWith('MAJOR_APPLIANCE_'))
          .map((c: AssetRiskDetail) => ({
            assetType: c.systemType,
            systemType: c.systemType,
            category: c.category,
            title: `${c.riskLevel} Risk: ${c.assetName || c.systemType}`,
            description: c.actionCta || `Maintenance required for ${c.systemType}`,
            priority: (c.riskLevel === 'CRITICAL' ? 'URGENT' : 'HIGH') as 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW',
            riskLevel: c.riskLevel as 'CRITICAL' | 'HIGH' | 'ELEVATED' | 'MODERATE' | 'LOW',
            estimatedCost: Number(c.outOfPocketCost ?? c.replacementCost ?? 0),
            age: c.age,
            expectedLife: c.expectedLife,
            exposure: Number(c.outOfPocketCost ?? c.replacementCost ?? 0),
          }));

        if (recommendations.length > 0) {
          console.log(`[RISK-SERVICE] Creating ${recommendations.length} maintenance tasks for HIGH/CRITICAL risks...`);
          
          const taskResult = await createTasksFromRiskAssessment(
            propertyId,
            propertyWithProfile.homeownerProfile.userId,
            recommendations
          );

          console.log(`✅ Risk assessment tasks: ${taskResult.created} created, ${taskResult.skipped} skipped`);
        } else {
          console.log(`[RISK-SERVICE] No HIGH/CRITICAL risks found - no maintenance tasks created`);
        }
      }
    } catch (taskError) {
      // Don't fail the risk calculation if task creation fails
      console.error('[RISK-SERVICE] Failed to create maintenance tasks:', taskError);
    }

    return updatedReport;
  }
  
  async generateRiskReportPdf(propertyId: string): Promise<Buffer> {
    const report = await this.getOrCreateRiskReport(propertyId);

    if (report === 'QUEUED') {
        throw new Error("Risk assessment report is currently calculating. Please try again in a moment.");
    }

    const mockPdfContent = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );

    console.log(`[PDF] Generated mock PDF buffer for property ${propertyId}.`);

    return mockPdfContent;
  }
  private normUpperUnderscore(s: string) {
    return String(s || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }
  
  private inferMajorApplianceType(item: InventoryItem): string | null {
    const tags = Array.isArray((item as any).tags) ? (item as any).tags : [];
  
    // Preferred: TAG like "APPLIANCE_TYPE:FRIDGE"
    const tag = tags.find((t: string) => String(t).startsWith('APPLIANCE_TYPE:'));
    if (tag) {
      const raw = String(tag).split('APPLIANCE_TYPE:')[1] || '';
      const t = this.normUpperUnderscore(raw);
      return t || null;
    }
  
    // Fallback: keyword inference from name
    const name = String(item.name || '').toLowerCase();
  
    if (name.includes('refrigerator') || name.includes('fridge')) return 'FRIDGE';
    if (name.includes('dishwasher')) return 'DISHWASHER';
    if (name.includes('washer') || name.includes('washing machine')) return 'WASHER';
    if (name.includes('dryer')) return 'DRYER';
    if (name.includes('range') || name.includes('stove') || name.includes('cooktop')) return 'RANGE';
    if (name.includes('microwave')) return 'MICROWAVE';
    if (name.includes('freezer')) return 'FREEZER';
    if (name.includes('garbage disposal') || name.includes('disposal')) return 'DISPOSAL';
  
    return null;
  }
  
  private expectedLifeYearsForAppliance(applianceType: string): number {
    // Conservative defaults (tweak later)
    const map: Record<string, number> = {
      FRIDGE: 13,
      DISHWASHER: 10,
      WASHER: 10,
      DRYER: 13,
      RANGE: 15,
      MICROWAVE: 9,
      FREEZER: 11,
      DISPOSAL: 10,
    };
  
    return map[applianceType] ?? 12;
  }
  
  private getItemAgeYears(item: InventoryItem, currentYear: number): number | null {
    const d = item.installedOn ?? item.purchasedOn ?? null;
    if (!d) return null;
  
    const dt = new Date(d as any);
    if (Number.isNaN(dt.getTime())) return null;
  
    const year = dt.getFullYear();
    if (!year || year < 1900 || year > currentYear) return null;
  
    return Math.max(0, currentYear - year);
  }
  
  private buildMajorApplianceRisksFromInventory(
    property: PropertyWithRelations,
    currentYear: number
  ): AssetRiskDetail[] {
    const out: AssetRiskDetail[] = [];
  
    const items = Array.isArray(property.inventoryItems) ? property.inventoryItems : [];
    for (const item of items) {
      // Only appliances (and only if we have replacement cost)
      if (String(item.category) !== 'APPLIANCE') continue;
      if (!item.replacementCostCents || item.replacementCostCents <= 0) continue;
  
      const applianceType = this.inferMajorApplianceType(item);
      if (!applianceType) continue;
  
      const expectedLife = this.expectedLifeYearsForAppliance(applianceType);
      const age = this.getItemAgeYears(item, currentYear);
  
      // If we can't determine age at all, still include it as a LOW informational row
      const ageYears = age ?? 0;
  
      const ratio = expectedLife > 0 ? ageYears / expectedLife : 0;
      const riskLevel: 'LOW' | 'MODERATE' | 'HIGH' =
        ratio >= 1 ? 'HIGH' : ratio >= 0.8 ? 'MODERATE' : 'LOW';
  
      // CoverageFactor: simple V1 heuristic:
      // - insurancePolicyId or warrantyId reduces out-of-pocket exposure
      const hasCoverage = Boolean(item.warrantyId || item.insurancePolicyId);
      const coverageFactor = hasCoverage ? 0.7 : 0.0;
  
      const outOfPocketCost =
        Math.round(item.replacementCostCents * (1 - coverageFactor)) / 100;
  
      // Normalized names used by the frontend (it replaces underscores)
      const assetName = this.normUpperUnderscore(item.name);
      const systemType = `MAJOR_APPLIANCE_${applianceType}`;
  
      out.push({
        assetName,
        systemType,
        category: 'SYSTEMS' as any,
  
        age: ageYears,
        expectedLife,
  
        replacementCost: Math.round(item.replacementCostCents / 100),
        probability: Math.max(0.15, Math.min(1, ratio)), // simple signal
  
        coverageFactor,
        outOfPocketCost,
        riskDollar: outOfPocketCost,
  
        riskLevel,
        actionCta: hasCoverage ? 'Schedule Maintenance' : 'Add Home Warranty',
  
        // If your AssetRiskDetail supports extra fields, these are useful
        // roomName: (item as any).room?.name ?? null,
        // inventoryItemId: item.id,
      } as any);
    }
  
    return out;
  }

  private buildBasementFloodRisk(property: PropertyWithRelations): AssetRiskDetail {
    const baselineScore = property.hasDrainageIssues === true ? 72 : 48;
    const basementFloodRisk =
      property.hasSumpPumpBackup === true
        ? Math.round(baselineScore * 0.6)
        : baselineScore;

    const probability = Math.max(0.1, Math.min(0.95, basementFloodRisk / 100));
    const replacementCost = property.hasDrainageIssues === true ? 18000 : 12000;
    const hasCoverage = property.insurancePolicies.length > 0;
    const coverageFactor = hasCoverage ? 0.35 : 0;
    const outOfPocketCost = Math.round(replacementCost * (1 - coverageFactor));
    const riskDollar = Math.round(outOfPocketCost * probability);

    let riskLevel: AssetRiskDetail['riskLevel'];
    if (basementFloodRisk < 35) riskLevel = 'LOW';
    else if (basementFloodRisk < 50) riskLevel = 'MODERATE';
    else if (basementFloodRisk < 65) riskLevel = 'ELEVATED';
    else if (basementFloodRisk < 80) riskLevel = 'HIGH';
    else riskLevel = 'CRITICAL';

    const actionCta =
      property.hasSumpPumpBackup === true
        ? 'Maintain battery backup and test quarterly'
        : 'Install sump pump battery backup';

    return {
      assetName: 'BASEMENT_FLOOD_RISK',
      systemType: 'BASEMENT_FLOOD_RISK',
      category: RiskCategory.STRUCTURE,
      age: 0,
      expectedLife: 1,
      replacementCost,
      probability: Math.round(probability * 100) / 100,
      coverageFactor,
      outOfPocketCost,
      riskDollar,
      riskLevel,
      actionCta,
    } as AssetRiskDetail;
  }

  private async fetchPropertyDetails(propertyId: string): Promise<PropertyWithRelations | null> {
    return prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        warranties: true,
        insurancePolicies: true,
        riskReport: true,
  
        // ✅ New: inventory items drive MAJOR_APPLIANCE risks
        inventoryItems: {
          include: {
            room: { select: { id: true, name: true } },
          },
        },
      },
    }) as Promise<PropertyWithRelations | null>;
  }  
}

export default new RiskAssessmentService();
