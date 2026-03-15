/**
 * HomeDigitalTwinQualityService
 *
 * Evaluates data quality per dimension and computes aggregate
 * completeness and confidence scores for a HomeDigitalTwin.
 */

import {
  HomeTwinDataQualityDimension,
  HomeTwinDataQualityStatus,
  HomeTwinComponentStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';

// ============================================================================
// DIMENSION WEIGHTS
// ============================================================================

const DIMENSION_WEIGHTS: Record<HomeTwinDataQualityDimension, number> = {
  PROPERTY_PROFILE: 0.25,
  SYSTEMS:          0.25,
  APPLIANCES:       0.10,
  DOCUMENTATION:    0.10,
  COST_BASIS:       0.15,
  ENERGY_BASIS:     0.05,
  RISK_BASIS:       0.10,
};

// ============================================================================
// DIMENSION RESULT
// ============================================================================

type DimensionResult = {
  dimension: HomeTwinDataQualityDimension;
  status: HomeTwinDataQualityStatus;
  score: number; // 0–1
  missingFields: string[];
};

// ============================================================================
// STATUS FROM SCORE
// ============================================================================

function statusFromScore(score: number): HomeTwinDataQualityStatus {
  if (score >= 0.70) return 'SUFFICIENT';
  if (score >= 0.35) return 'PARTIAL';
  if (score > 0)     return 'INSUFFICIENT';
  return 'UNKNOWN';
}

// ============================================================================
// INDIVIDUAL DIMENSION EVALUATORS
// ============================================================================

function evaluatePropertyProfile(property: {
  yearBuilt: number | null;
  propertyType: string | null;
  propertySize: number | null;
  heatingType: string | null;
  coolingType: string | null;
  waterHeaterType: string | null;
  roofType: string | null;
  ownershipType: string | null;
}): DimensionResult {
  const checks: Array<{ field: string; present: boolean }> = [
    { field: 'yearBuilt',     present: property.yearBuilt != null },
    { field: 'propertyType',  present: property.propertyType != null },
    { field: 'propertySize',  present: property.propertySize != null },
    { field: 'heatingType',   present: property.heatingType != null },
    { field: 'coolingType',   present: property.coolingType != null },
    { field: 'waterHeaterType', present: property.waterHeaterType != null },
    { field: 'roofType',      present: property.roofType != null },
    { field: 'ownershipType', present: property.ownershipType != null },
  ];

  const present = checks.filter((c) => c.present).length;
  const score = present / checks.length;
  const missingFields = checks.filter((c) => !c.present).map((c) => c.field);

  return {
    dimension: 'PROPERTY_PROFILE',
    status: statusFromScore(score),
    score,
    missingFields,
  };
}

function evaluateSystems(property: {
  hvacInstallYear: number | null;
  waterHeaterInstallYear: number | null;
  roofReplacementYear: number | null;
  electricalPanelAge: number | null;
}): DimensionResult {
  const checks: Array<{ field: string; present: boolean }> = [
    { field: 'hvacInstallYear',          present: property.hvacInstallYear != null },
    { field: 'waterHeaterInstallYear',   present: property.waterHeaterInstallYear != null },
    { field: 'roofReplacementYear',      present: property.roofReplacementYear != null },
    { field: 'electricalPanelAge',       present: property.electricalPanelAge != null },
  ];

  const present = checks.filter((c) => c.present).length;
  const score = present / checks.length;
  const missingFields = checks.filter((c) => !c.present).map((c) => c.field);

  return {
    dimension: 'SYSTEMS',
    status: statusFromScore(score),
    score,
    missingFields,
  };
}

function evaluateAppliances(inventoryItemCount: number): DimensionResult {
  // Consider "sufficient" if 3+ appliance/HVAC items tracked
  const score = Math.min(1, inventoryItemCount / 3);
  return {
    dimension: 'APPLIANCES',
    status: statusFromScore(score),
    score,
    missingFields: inventoryItemCount === 0 ? ['inventoryItems'] : [],
  };
}

function evaluateDocumentation(documentCount: number): DimensionResult {
  const score = Math.min(1, documentCount / 3);
  return {
    dimension: 'DOCUMENTATION',
    status: statusFromScore(score),
    score,
    missingFields: documentCount === 0 ? ['documents'] : [],
  };
}

function evaluateCostBasis(property: {
  purchasePriceCents: number | null;
  lastAppraisedValue: number | null;
}, componentsWithCost: number, totalComponents: number): DimensionResult {
  const checks: Array<{ field: string; present: boolean }> = [
    { field: 'purchasePriceCents',    present: property.purchasePriceCents != null },
    { field: 'lastAppraisedValue',    present: property.lastAppraisedValue != null },
    {
      field: 'componentCostEstimates',
      present: totalComponents > 0 && componentsWithCost / totalComponents >= 0.5,
    },
  ];

  const present = checks.filter((c) => c.present).length;
  const score = present / checks.length;
  const missingFields = checks.filter((c) => !c.present).map((c) => c.field);

  return {
    dimension: 'COST_BASIS',
    status: statusFromScore(score),
    score,
    missingFields,
  };
}

function evaluateEnergyBasis(property: {
  primaryHeatingFuel: string | null;
}, hasSolarItems: boolean): DimensionResult {
  const checks: Array<{ field: string; present: boolean }> = [
    { field: 'primaryHeatingFuel', present: property.primaryHeatingFuel != null },
    { field: 'solarInventory',     present: hasSolarItems },
  ];

  // Only require primary heating fuel for "sufficient"
  const score = checks[0].present ? 0.70 : 0;
  const missingFields = checks.filter((c) => !c.present).map((c) => c.field);

  return {
    dimension: 'ENERGY_BASIS',
    status: statusFromScore(score),
    score,
    missingFields,
  };
}

function evaluateRiskBasis(riskReportExists: boolean): DimensionResult {
  const score = riskReportExists ? 1.0 : 0;
  return {
    dimension: 'RISK_BASIS',
    status: statusFromScore(score),
    score,
    missingFields: riskReportExists ? [] : ['riskAssessmentReport'],
  };
}

// ============================================================================
// SERVICE
// ============================================================================

export class HomeDigitalTwinQualityService {
  /**
   * Evaluate all quality dimensions for the twin, upsert
   * HomeTwinDataQuality rows, and update the twin's aggregate scores.
   */
  async evaluate(digitalTwinId: string, propertyId: string): Promise<void> {
    const [property, inventoryItems, documentCount, components, riskReport] = await Promise.all([
      prisma.property.findUniqueOrThrow({
        where: { id: propertyId },
        select: {
          yearBuilt: true,
          propertyType: true,
          propertySize: true,
          heatingType: true,
          coolingType: true,
          waterHeaterType: true,
          roofType: true,
          ownershipType: true,
          hvacInstallYear: true,
          waterHeaterInstallYear: true,
          roofReplacementYear: true,
          electricalPanelAge: true,
          purchasePriceCents: true,
          lastAppraisedValue: true,
          primaryHeatingFuel: true,
        },
      }),
      prisma.inventoryItem.findMany({
        where: { propertyId },
        select: { id: true, category: true, name: true, replacementCostCents: true },
      }),
      prisma.document.count({ where: { propertyId } }),
      prisma.homeTwinComponent.findMany({
        where: { digitalTwinId },
        select: { replacementCostEstimate: true, confidenceScore: true },
      }),
      prisma.riskAssessmentReport.findUnique({
        where: { propertyId },
        select: { id: true },
      }),
    ]);

    const applianceItems = inventoryItems.filter(
      (i) => i.category === 'APPLIANCE' || i.category === 'HVAC',
    );
    const hasSolarItems = inventoryItems.some(
      (i) =>
        i.name?.toLowerCase().includes('solar') ||
        i.name?.toLowerCase().includes('panel') ||
        i.category === 'SMART_HOME',
    );
    const componentsWithCost = components.filter(
      (c) => c.replacementCostEstimate != null,
    ).length;

    const dimensionResults: DimensionResult[] = [
      evaluatePropertyProfile(property),
      evaluateSystems(property),
      evaluateAppliances(applianceItems.length),
      evaluateDocumentation(documentCount),
      evaluateCostBasis(property, componentsWithCost, components.length),
      evaluateEnergyBasis(property, hasSolarItems),
      evaluateRiskBasis(riskReport != null),
    ];

    // Upsert each dimension row
    for (const result of dimensionResults) {
      await prisma.homeTwinDataQuality.upsert({
        where: {
          digitalTwinId_dimension: {
            digitalTwinId,
            dimension: result.dimension,
          },
        },
        create: {
          digitalTwinId,
          dimension: result.dimension,
          status: result.status,
          score: result.score,
          missingFields: result.missingFields,
          lastEvaluatedAt: new Date(),
        },
        update: {
          status: result.status,
          score: result.score,
          missingFields: result.missingFields,
          lastEvaluatedAt: new Date(),
        },
      });
    }

    // Aggregate completeness score (weighted average of dimension scores)
    const completenessScore = dimensionResults.reduce(
      (sum, r) => sum + r.score * DIMENSION_WEIGHTS[r.dimension],
      0,
    );

    // Aggregate confidence score (mean of component confidence scores)
    const componentConfidences = components
      .map((c) => c.confidenceScore)
      .filter((s): s is number => s != null);
    const confidenceScore =
      componentConfidences.length > 0
        ? componentConfidences.reduce((a, b) => a + b, 0) / componentConfidences.length
        : completenessScore * 0.7; // fallback: derive from completeness

    // Update the twin's aggregate scores
    await prisma.homeDigitalTwin.update({
      where: { id: digitalTwinId },
      data: {
        completenessScore: Math.round(completenessScore * 100) / 100,
        confidenceScore: Math.round(confidenceScore * 100) / 100,
        lastComputedAt: new Date(),
      },
    });
  }
}
