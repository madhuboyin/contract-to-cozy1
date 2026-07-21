// apps/workers/src/jobs/propertyIntelligence.job.ts
//
// W4 item 4: extracted verbatim out of worker.ts (registry key
// property-intelligence — the BullMQ Worker on property-intelligence-queue)
// so it can be unit-tested directly. Same reasoning/technique as
// propertyScoreSnapshots.job.ts (extracted alongside this, in the same
// slice — capturePropertyScoreSnapshots is shared between both). No logic
// changes from the original inline version.

import { PropertyType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { calculateFinancialEfficiency } from '../../../backend/src/utils/FinancialCalculator.util';
import { HiddenAssetService } from '../../../backend/src/services/hiddenAssets.service';
import RiskAssessmentService from '../../../backend/src/services/RiskAssessment.service';
import { capturePropertyScoreSnapshots } from './propertyScoreSnapshots.job';

export enum PropertyIntelligenceJobType {
  CALCULATE_RISK_REPORT = 'CALCULATE_RISK_REPORT',
  CALCULATE_FES = 'CALCULATE_FES',
  CALCULATE_HIDDEN_ASSETS = 'CALCULATE_HIDDEN_ASSETS',
}

export interface PropertyIntelligenceJobPayload {
  propertyId: string;
  jobType: PropertyIntelligenceJobType;
}

const hiddenAssetService = new HiddenAssetService();

/**
 * Process risk assessment calculation.
 * Delegates to RiskAssessmentService.calculateAndSaveReport which fetches
 * the full property including canonical inventory items.
 */
export async function processRiskCalculation(jobData: PropertyIntelligenceJobPayload) {
  const { propertyId } = jobData;
  logger.info(`[${new Date().toISOString()}] Processing risk calculation for property ${propertyId}...`);

  try {
    await RiskAssessmentService.calculateAndSaveReport(propertyId);
    logger.info(`✅ Risk assessment calculated and saved for property ${propertyId}.`);
  } catch (error) {
    logger.error({ err: error }, '❌ Error calculating risk assessment');
    throw error;
  }

  // Score snapshot update is best-effort — failure here must not re-queue the job
  try {
    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { homeownerProfileId: true },
    });
    if (property?.homeownerProfileId) {
      await capturePropertyScoreSnapshots(propertyId, property.homeownerProfileId);
      logger.info(`[SCORE-SNAPSHOT] Updated weekly snapshots from risk calculation for property ${propertyId}.`);
    }
  } catch (snapshotError) {
    logger.error({ err: snapshotError }, `[SCORE-SNAPSHOT] Failed to update snapshots for property ${propertyId} — risk report was saved successfully`);
  }
}

/**
 * Process FES calculation
 */
export async function processFESCalculation(jobData: PropertyIntelligenceJobPayload) {
  logger.info(`[${new Date().toISOString()}] Processing FES calculation for property ${jobData.propertyId}...`);

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
      logger.error(`Property ${propertyId} not found. Job failed.`);
      throw new Error("Property not found for FES calculation.");
    }

    // 2. Get benchmark (matching the old getBenchmark logic)
    let benchmark = null;
    const benchmarkPropertyType = ({
      DETACHED_SINGLE_FAMILY: PropertyType.SINGLE_FAMILY,
      ATTACHED_SINGLE_FAMILY: PropertyType.TOWNHOME,
      TOWNHOUSE: PropertyType.TOWNHOME,
      CONDO_UNIT: PropertyType.CONDO,
      APARTMENT_UNIT: PropertyType.APARTMENT,
      DUPLEX: PropertyType.MULTI_UNIT,
      MULTI_FAMILY: PropertyType.MULTI_UNIT,
      MANUFACTURED_HOME: null,
      OTHER: null,
      UNKNOWN: null,
    } as Record<string, PropertyType | null>)[String(property.dwellingType)] ?? null;
    if (benchmarkPropertyType) {
      benchmark = await (prisma as any).financialEfficiencyConfig.findUnique({
        where: {
          zipCode_propertyType: {
            zipCode: property.zipCode,
            propertyType: benchmarkPropertyType
          }
        },
      });

      // Fallback to global benchmark for property type
      if (!benchmark) {
        benchmark = await (prisma as any).financialEfficiencyConfig.findFirst({
          where: { zipCode: null, propertyType: benchmarkPropertyType },
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

    logger.info(`✅ FES calculation completed for property ${propertyId}.`);
    logger.info(`   Score: ${result.score}, Exposure: $${totalExposure.toFixed(2)}`);

    if (property.homeownerProfileId) {
      await capturePropertyScoreSnapshots(propertyId, property.homeownerProfileId);
      logger.info(`[SCORE-SNAPSHOT] Updated weekly snapshots from FES calculation for property ${propertyId}.`);
    }

  } catch (error) {
    logger.error({ err: error }, '❌ Error calculating FES');
    throw error;
  }
}

/**
 * Process hidden asset scan for a single property
 */
export async function processHiddenAssetScan(jobData: PropertyIntelligenceJobPayload) {
  const { propertyId } = jobData;
  logger.info(`[${new Date().toISOString()}] Processing hidden asset scan for property ${propertyId}...`);

  try {
    const result = await hiddenAssetService.refreshMatchesInternal(propertyId);
    logger.info(
      `✅ Hidden asset scan completed for property ${propertyId}. ` +
      `Evaluated: ${result.programsEvaluated}, Matched: ${result.matchesFound}, ` +
      `Expired: ${result.matchesExpired}, Inactivated: ${result.matchesInactivated}`
    );
  } catch (error) {
    logger.error({ err: error }, `❌ Error running hidden asset scan for property ${propertyId}`);
    throw error;
  }
}
