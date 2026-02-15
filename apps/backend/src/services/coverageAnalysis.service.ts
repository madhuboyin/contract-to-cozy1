import {
  CoverageAnalysis,
  CoverageAnalysisStatus,
  CoverageConfidence,
  CoverageImpactLevel,
  CoverageScenario,
  CoverageVerdict,
  InventoryItemCondition,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { detectCoverageGaps } from './coverageGap.service';

type Impact = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
type Severity = 'LOW' | 'MEDIUM' | 'HIGH';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
type RiskTolerance = 'LOW' | 'MEDIUM' | 'HIGH';

export type CoverageAnalysisOverrides = {
  annualPremiumUsd?: number;
  deductibleUsd?: number;
  warrantyAnnualCostUsd?: number;
  warrantyServiceFeeUsd?: number;
  cashBufferUsd?: number;
  riskTolerance?: RiskTolerance;
};

export type CoverageSimulationInput = {
  overrides?: CoverageAnalysisOverrides;
  saveScenario?: boolean;
  name?: string;
};

export type CoverageAnalysisDTO = {
  id: string;
  propertyId: string;
  homeownerProfileId: string;
  status: 'READY' | 'STALE' | 'ERROR';
  computedAt: string;

  overallVerdict: 'WORTH_IT' | 'SITUATIONAL' | 'NOT_WORTH_IT';
  insuranceVerdict: 'WORTH_IT' | 'SITUATIONAL' | 'NOT_WORTH_IT';
  warrantyVerdict: 'WORTH_IT' | 'SITUATIONAL' | 'NOT_WORTH_IT';

  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  impactLevel?: 'LOW' | 'MEDIUM' | 'HIGH';

  summary?: string;
  nextSteps?: Array<{
    title: string;
    detail?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;

  insurance: {
    inputsUsed: { annualPremiumUsd?: number; deductibleUsd?: number; cashBufferUsd?: number };
    flags: Array<{ code: string; label: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' }>;
    recommendedAddOns: Array<{ code: string; label: string; why: string }>;
  };

  warranty: {
    inputsUsed: { warrantyAnnualCostUsd?: number; warrantyServiceFeeUsd?: number };
    expectedAnnualRepairRiskUsd?: number;
    expectedNetImpactUsd?: number;
    breakEvenMonths?: number | null;
  };

  decisionTrace: Array<{
    label: string;
    detail?: string;
    impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  }>;

  scenarios?: Array<{
    id: string;
    name?: string;
    createdAt: string;
    inputOverrides: any;
    outputSnapshot: any;
  }>;
};

type InsuranceFlag = {
  code: string;
  label: string;
  severity: Severity;
};

type AddOnSuggestion = {
  code: string;
  label: string;
  why: string;
};

type DecisionTraceItem = {
  label: string;
  detail?: string;
  impact: Impact;
};

type NextStep = {
  title: string;
  detail?: string;
  priority?: Priority;
};

type ComputedSnapshot = {
  status: CoverageAnalysisStatus;
  confidence: CoverageConfidence;
  impactLevel?: CoverageImpactLevel;
  overallVerdict: CoverageVerdict;
  insuranceVerdict: CoverageVerdict;
  warrantyVerdict: CoverageVerdict;
  summary?: string;
  nextSteps: NextStep[];
  insuranceResult: {
    inputsUsed: {
      annualPremiumUsd?: number;
      deductibleUsd?: number;
      cashBufferUsd?: number;
      riskTolerance: RiskTolerance;
    };
    flags: InsuranceFlag[];
  };
  warrantyResult: {
    inputsUsed: {
      warrantyAnnualCostUsd?: number;
      warrantyServiceFeeUsd?: number;
    };
    expectedAnnualRepairRiskUsd?: number;
    expectedNetImpactUsd?: number;
    breakEvenMonths?: number | null;
  };
  addOnRecommendations: AddOnSuggestion[];
  decisionTrace: DecisionTraceItem[];
  inputsSnapshot: Record<string, unknown>;
};

type LatestAnalysisRecord = CoverageAnalysis & {
  scenarios: CoverageScenario[];
};

const DEFAULT_WARRANTY_SERVICE_FEE_USD = 95;
const DEFAULT_DEDUCTIBLE_USD = 1500;
const DEFAULT_CATEGORY_COST_USD: Record<string, number> = {
  APPLIANCE: 1200,
  HVAC: 6500,
  PLUMBING: 1800,
  ELECTRICAL: 1600,
  ROOF_EXTERIOR: 9000,
  SAFETY: 800,
  SMART_HOME: 600,
  FURNITURE: 900,
  ELECTRONICS: 950,
  OTHER: 850,
};

const CONDITION_WEIGHT: Record<InventoryItemCondition, number> = {
  NEW: 0.05,
  GOOD: 0.1,
  FAIR: 0.18,
  POOR: 0.28,
  UNKNOWN: 0.14,
};

function asNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'object' && value && 'toNumber' in (value as Record<string, unknown>)) {
    const decimalValue = (value as { toNumber: () => number }).toNumber();
    if (Number.isFinite(decimalValue)) return decimalValue;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function toMoney(value: number | undefined | null): number | undefined {
  if (value === undefined || value === null || Number.isNaN(value)) return undefined;
  return Math.round(value * 100) / 100;
}

function safeArray<T>(value: Prisma.JsonValue | null | undefined): T[] {
  if (!Array.isArray(value)) return [];
  return value as T[];
}

function safeObject<T extends object>(value: Prisma.JsonValue | null | undefined, fallback: T): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  return value as T;
}

function verdictWeight(verdict: CoverageVerdict): number {
  if (verdict === CoverageVerdict.WORTH_IT) return 2;
  if (verdict === CoverageVerdict.SITUATIONAL) return 1;
  return 0;
}

function severityWeight(severity: Severity): number {
  if (severity === 'HIGH') return 3;
  if (severity === 'MEDIUM') return 2;
  return 1;
}

function dedupeByCode<T extends { code: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    if (seen.has(item.code)) continue;
    seen.add(item.code);
    deduped.push(item);
  }
  return deduped;
}

function dedupeSteps(items: NextStep[]): NextStep[] {
  const seen = new Set<string>();
  const deduped: NextStep[] = [];
  for (const item of items) {
    const key = `${item.title}-${item.detail ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function ageFactorFromDate(date?: Date | null): number {
  if (!date) return 1;
  const years = Math.max(0, (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365));
  if (years >= 12) return 1.4;
  if (years >= 8) return 1.25;
  if (years >= 5) return 1.1;
  return 0.9;
}

function riskToleranceMultiplier(riskTolerance: RiskTolerance): number {
  if (riskTolerance === 'LOW') return 1.12;
  if (riskTolerance === 'HIGH') return 0.9;
  return 1;
}

async function assertPropertyForUser(propertyId: string, userId: string) {
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      homeownerProfile: { userId },
    },
    select: {
      id: true,
      homeownerProfileId: true,
      name: true,
      state: true,
      hasDrainageIssues: true,
      climateSetting: {
        select: {
          notificationEnabled: true,
        },
      },
      riskReport: {
        select: {
          riskScore: true,
          lastCalculatedAt: true,
        },
      },
      homeownerProfile: {
        select: {
          totalBudget: true,
          spentAmount: true,
        },
      },
      _count: {
        select: {
          inventoryItems: true,
          maintenanceTasks: true,
          claims: true,
          warranties: true,
          insurancePolicies: true,
        },
      },
    },
  });

  if (!property) {
    throw new Error('Property not found or access denied.');
  }

  return property;
}

function mapAnalysisToDto(analysis: LatestAnalysisRecord): CoverageAnalysisDTO {
  const insuranceResult = safeObject(
    analysis.insuranceResult,
    {
      inputsUsed: {},
      flags: [],
    } as {
      inputsUsed: { annualPremiumUsd?: number; deductibleUsd?: number; cashBufferUsd?: number };
      flags: InsuranceFlag[];
    }
  );
  const warrantyResult = safeObject(
    analysis.warrantyResult,
    {
      inputsUsed: {},
      expectedAnnualRepairRiskUsd: undefined,
      expectedNetImpactUsd: undefined,
      breakEvenMonths: null,
    } as {
      inputsUsed: { warrantyAnnualCostUsd?: number; warrantyServiceFeeUsd?: number };
      expectedAnnualRepairRiskUsd?: number;
      expectedNetImpactUsd?: number;
      breakEvenMonths?: number | null;
    }
  );

  const addOnRecommendations = safeArray<AddOnSuggestion>(analysis.addOnRecommendations);
  const decisionTrace = safeArray<DecisionTraceItem>(analysis.decisionTrace);
  const nextSteps = safeArray<NextStep>(analysis.nextSteps);

  return {
    id: analysis.id,
    propertyId: analysis.propertyId,
    homeownerProfileId: analysis.homeownerProfileId,
    status: analysis.status,
    computedAt: analysis.computedAt.toISOString(),
    overallVerdict: analysis.overallVerdict,
    insuranceVerdict: analysis.insuranceVerdict,
    warrantyVerdict: analysis.warrantyVerdict,
    confidence: analysis.confidence,
    impactLevel: analysis.impactLevel ?? undefined,
    summary: analysis.summary ?? undefined,
    nextSteps,
    insurance: {
      inputsUsed: insuranceResult.inputsUsed ?? {},
      flags: insuranceResult.flags ?? [],
      recommendedAddOns: addOnRecommendations,
    },
    warranty: {
      inputsUsed: warrantyResult.inputsUsed ?? {},
      expectedAnnualRepairRiskUsd: toMoney(warrantyResult.expectedAnnualRepairRiskUsd),
      expectedNetImpactUsd: toMoney(warrantyResult.expectedNetImpactUsd),
      breakEvenMonths: warrantyResult.breakEvenMonths ?? null,
    },
    decisionTrace,
    scenarios:
      analysis.scenarios?.map((scenario) => ({
        id: scenario.id,
        name: scenario.name ?? undefined,
        createdAt: scenario.createdAt.toISOString(),
        inputOverrides: scenario.inputOverrides ?? {},
        outputSnapshot: scenario.outputSnapshot ?? {},
      })) ?? [],
  };
}

export class CoverageIntelligenceService {
  private async computeSnapshot(
    propertyId: string,
    userId: string,
    overrides?: CoverageAnalysisOverrides
  ): Promise<{
    snapshot: ComputedSnapshot;
    homeownerProfileId: string;
  }> {
    const property = await assertPropertyForUser(propertyId, userId);
    const homeownerProfileId = property.homeownerProfileId;

    const lookback = new Date();
    lookback.setMonth(lookback.getMonth() - 24);

    const [inventoryItems, maintenanceTasks, claims, insurancePolicies, warranties, coverageGaps] =
      await Promise.all([
        prisma.inventoryItem.findMany({
          where: { propertyId },
          select: {
            id: true,
            category: true,
            condition: true,
            replacementCostCents: true,
            installedOn: true,
            purchasedOn: true,
            warrantyId: true,
            insurancePolicyId: true,
          },
        }),
        prisma.propertyMaintenanceTask.findMany({
          where: { propertyId },
          select: {
            id: true,
            status: true,
            priority: true,
          },
        }),
        prisma.claim.findMany({
          where: {
            propertyId,
            createdAt: { gte: lookback },
          },
          select: {
            id: true,
            type: true,
            status: true,
            deductibleAmount: true,
          },
        }),
        prisma.insurancePolicy.findMany({
          where: { propertyId, homeownerProfileId },
          select: {
            id: true,
            coverageType: true,
            premiumAmount: true,
          },
        }),
        prisma.warranty.findMany({
          where: { propertyId, homeownerProfileId },
          select: {
            id: true,
            category: true,
            providerName: true,
            cost: true,
          },
        }),
        detectCoverageGaps(propertyId),
      ]);

    const riskTolerance: RiskTolerance = overrides?.riskTolerance ?? 'MEDIUM';
    const toleranceMultiplier = riskToleranceMultiplier(riskTolerance);

    const annualPremiumUsd =
      overrides?.annualPremiumUsd ??
      insurancePolicies.reduce((sum, policy) => sum + (asNumber(policy.premiumAmount) ?? 0), 0);

    const deductibleFromClaims = (() => {
      const values = claims
        .map((claim) => asNumber(claim.deductibleAmount))
        .filter((value): value is number => value !== undefined && value > 0);
      if (!values.length) return undefined;
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    })();

    const deductibleUsd =
      overrides?.deductibleUsd ??
      deductibleFromClaims ??
      (insurancePolicies.length > 0 ? DEFAULT_DEDUCTIBLE_USD : undefined);

    const profileBudget = asNumber(property.homeownerProfile.totalBudget);
    const profileSpent = asNumber(property.homeownerProfile.spentAmount);
    const inferredCashBuffer =
      profileBudget !== undefined && profileSpent !== undefined
        ? Math.max(0, profileBudget - profileSpent)
        : undefined;

    const cashBufferUsd = overrides?.cashBufferUsd ?? inferredCashBuffer;
    const warrantyAnnualCostUsd =
      overrides?.warrantyAnnualCostUsd ??
      warranties.reduce((sum, warranty) => sum + (asNumber(warranty.cost) ?? 0), 0);
    const warrantyServiceFeeUsd = overrides?.warrantyServiceFeeUsd ?? DEFAULT_WARRANTY_SERVICE_FEE_USD;

    const expectedAnnualRepairRiskUsdRaw = inventoryItems.reduce((sum, item) => {
      const replacementUsd =
        item.replacementCostCents !== null && item.replacementCostCents !== undefined
          ? item.replacementCostCents / 100
          : DEFAULT_CATEGORY_COST_USD[item.category] ?? DEFAULT_CATEGORY_COST_USD.OTHER;
      const conditionWeight = CONDITION_WEIGHT[item.condition as InventoryItemCondition] ?? CONDITION_WEIGHT.UNKNOWN;
      const ageFactor = ageFactorFromDate(item.purchasedOn ?? item.installedOn);
      const categoryFactor =
        item.category === 'HVAC' || item.category === 'ROOF_EXTERIOR'
          ? 1.12
          : item.category === 'APPLIANCE'
            ? 1.05
            : 1;

      return sum + replacementUsd * conditionWeight * ageFactor * categoryFactor * toleranceMultiplier;
    }, 0);

    const maintenanceRiskBoost =
      maintenanceTasks.filter(
        (task) => task.status === 'PENDING' || task.status === 'NEEDS_REVIEW' || task.status === 'IN_PROGRESS'
      ).length * 65;
    const claimsRiskBoost = claims.length * 120;
    const expectedAnnualRepairRiskUsd = Math.max(
      0,
      expectedAnnualRepairRiskUsdRaw + maintenanceRiskBoost + claimsRiskBoost
    );

    const expectedNetImpactUsd = expectedAnnualRepairRiskUsd - (warrantyAnnualCostUsd + warrantyServiceFeeUsd);
    const breakEvenMonths =
      expectedAnnualRepairRiskUsd > 0
        ? Math.round((((warrantyAnnualCostUsd + warrantyServiceFeeUsd) / expectedAnnualRepairRiskUsd) * 12) * 10) / 10
        : null;

    const warrantyVerdict: CoverageVerdict =
      expectedNetImpactUsd > 150
        ? CoverageVerdict.WORTH_IT
        : expectedNetImpactUsd < -150
          ? CoverageVerdict.NOT_WORTH_IT
          : CoverageVerdict.SITUATIONAL;

    const insuranceFlags: InsuranceFlag[] = [];
    if (insurancePolicies.length === 0) {
      insuranceFlags.push({
        code: 'NO_PROPERTY_POLICY',
        label: 'No property-linked insurance policy is saved for this home.',
        severity: 'HIGH',
      });
    }

    if (deductibleUsd !== undefined && cashBufferUsd !== undefined && cashBufferUsd > 0) {
      const ratio = deductibleUsd / cashBufferUsd;
      if (ratio >= 0.4) {
        insuranceFlags.push({
          code: 'DEDUCTIBLE_VS_BUFFER_HIGH',
          label: 'Deductible is high compared with your cash buffer.',
          severity: 'HIGH',
        });
      } else if (ratio >= 0.25) {
        insuranceFlags.push({
          code: 'DEDUCTIBLE_VS_BUFFER_MEDIUM',
          label: 'Deductible may be difficult to absorb from current cash buffer.',
          severity: 'MEDIUM',
        });
      }
    }

    if ((property.riskReport?.riskScore ?? 100) < 45) {
      insuranceFlags.push({
        code: 'PROPERTY_RISK_HIGH',
        label: 'Property risk profile is elevated; review protection limits and riders.',
        severity: 'HIGH',
      });
    }

    if (claims.length >= 2) {
      insuranceFlags.push({
        code: 'CLAIMS_FREQUENCY',
        label: 'Multiple claims in the last 24 months suggest higher claim probability.',
        severity: 'MEDIUM',
      });
    }

    if (coverageGaps.length > 0) {
      insuranceFlags.push({
        code: 'INVENTORY_COVERAGE_GAPS',
        label: `${coverageGaps.length} inventory item(s) have coverage gaps or expirations.`,
        severity: coverageGaps.length >= 3 ? 'HIGH' : 'MEDIUM',
      });
    }

    if (
      maintenanceTasks.some((task) => task.status === 'PENDING' || task.status === 'NEEDS_REVIEW')
    ) {
      insuranceFlags.push({
        code: 'MAINTENANCE_BACKLOG',
        label: 'Pending maintenance tasks may increase preventable claim exposure.',
        severity: 'LOW',
      });
    }

    if (annualPremiumUsd > 0 && annualPremiumUsd >= 6500) {
      insuranceFlags.push({
        code: 'PREMIUM_PRESSURE',
        label: 'Annual premium is high; run periodic coverage value checks.',
        severity: 'MEDIUM',
      });
    }

    const recommendedAddOns: AddOnSuggestion[] = [];
    const state = (property.state || '').toUpperCase();
    const hadWaterClaim = claims.some((claim) => claim.type === 'WATER_DAMAGE' || claim.type === 'PLUMBING');

    if (hadWaterClaim || property.hasDrainageIssues) {
      recommendedAddOns.push({
        code: 'WATER_BACKUP',
        label: 'Water backup / sump overflow rider',
        why: 'Water-related risk signals detected from claims or property attributes.',
      });
    }

    if (['FL', 'LA', 'TX', 'SC', 'NC', 'NJ'].includes(state)) {
      recommendedAddOns.push({
        code: 'WINDSTORM_HAIL',
        label: 'Wind / hail endorsement review',
        why: 'Regional storm exposure can raise out-of-pocket risk during severe weather.',
      });
    }

    if (['CA', 'CO', 'AZ', 'NM', 'OR', 'WA', 'ID', 'MT'].includes(state)) {
      recommendedAddOns.push({
        code: 'WILDFIRE_ENDORSEMENT',
        label: 'Wildfire protection endorsement review',
        why: 'Regional wildfire risk can materially change replacement and loss expectations.',
      });
    }

    if (
      inventoryItems.some((item) => item.category === 'HVAC' || item.category === 'APPLIANCE')
    ) {
      recommendedAddOns.push({
        code: 'EQUIPMENT_BREAKDOWN',
        label: 'Equipment breakdown endorsement',
        why: 'Multiple major systems/appliances can make mechanical failures expensive.',
      });
    }

    const insurancePressureScore = insuranceFlags.reduce(
      (sum, flag) => sum + severityWeight(flag.severity),
      0
    );

    const insuranceVerdict: CoverageVerdict =
      insurancePolicies.length === 0
        ? CoverageVerdict.WORTH_IT
        : insurancePressureScore >= 8
          ? CoverageVerdict.WORTH_IT
          : insurancePressureScore >= 4
            ? CoverageVerdict.SITUATIONAL
            : annualPremiumUsd > 0 && annualPremiumUsd > (expectedAnnualRepairRiskUsd * 0.8 + 1500)
              ? CoverageVerdict.NOT_WORTH_IT
              : CoverageVerdict.SITUATIONAL;

    const averageVerdictScore =
      (verdictWeight(insuranceVerdict) + verdictWeight(warrantyVerdict)) / 2 +
      (insurancePressureScore >= 8 ? 0.25 : 0);
    const overallVerdict: CoverageVerdict =
      averageVerdictScore >= 1.55
        ? CoverageVerdict.WORTH_IT
        : averageVerdictScore >= 0.8
          ? CoverageVerdict.SITUATIONAL
          : CoverageVerdict.NOT_WORTH_IT;

    const confidenceSignals = [
      inventoryItems.length > 0,
      insurancePolicies.length > 0,
      warranties.length > 0,
      claims.length > 0,
      property.riskReport?.riskScore !== null && property.riskReport?.riskScore !== undefined,
    ].filter(Boolean).length;

    const confidence: CoverageConfidence =
      confidenceSignals >= 4
        ? CoverageConfidence.HIGH
        : confidenceSignals >= 2
          ? CoverageConfidence.MEDIUM
          : CoverageConfidence.LOW;

    const maxSeverityScore = Math.max(
      insuranceFlags.length ? Math.max(...insuranceFlags.map((flag) => severityWeight(flag.severity))) : 1,
      Math.abs(expectedNetImpactUsd) >= 900 ? 3 : Math.abs(expectedNetImpactUsd) >= 400 ? 2 : 1
    );
    const impactLevel: CoverageImpactLevel =
      maxSeverityScore >= 3
        ? CoverageImpactLevel.HIGH
        : maxSeverityScore === 2
          ? CoverageImpactLevel.MEDIUM
          : CoverageImpactLevel.LOW;

    const decisionTrace: DecisionTraceItem[] = [
      {
        label: 'Inventory profile analyzed',
        detail: `${inventoryItems.length} tracked item(s) used to estimate annual repair exposure.`,
        impact: inventoryItems.length > 0 ? 'POSITIVE' : 'NEUTRAL',
      },
      {
        label: 'Claims history reviewed',
        detail: `${claims.length} claim(s) in the last 24 months were considered.`,
        impact: claims.length >= 2 ? 'NEGATIVE' : claims.length === 1 ? 'NEUTRAL' : 'POSITIVE',
      },
      {
        label: 'Maintenance backlog factored',
        detail: `${maintenanceTasks.length} maintenance task(s) influence preventable-loss exposure.`,
        impact: maintenanceTasks.length >= 4 ? 'NEGATIVE' : 'NEUTRAL',
      },
      {
        label: 'Risk score incorporated',
        detail:
          property.riskReport?.riskScore !== null && property.riskReport?.riskScore !== undefined
            ? `Latest property risk score: ${Math.round(property.riskReport.riskScore)} / 100.`
            : 'No recent risk score was available; confidence reduced.',
        impact:
          property.riskReport?.riskScore !== null && property.riskReport?.riskScore !== undefined
            ? property.riskReport.riskScore < 45
              ? 'NEGATIVE'
              : 'POSITIVE'
            : 'NEUTRAL',
      },
      {
        label: 'Deductible affordability check',
        detail:
          deductibleUsd !== undefined && cashBufferUsd !== undefined
            ? `Deductible ${toMoney(deductibleUsd)} vs cash buffer ${toMoney(cashBufferUsd)}.`
            : 'Deductible-to-buffer analysis used fallback assumptions.',
        impact:
          deductibleUsd !== undefined && cashBufferUsd !== undefined && cashBufferUsd > 0
            ? deductibleUsd / cashBufferUsd > 0.4
              ? 'NEGATIVE'
              : 'POSITIVE'
            : 'NEUTRAL',
      },
      {
        label: 'Warranty economics',
        detail: `Expected annual repair risk ${toMoney(expectedAnnualRepairRiskUsd)} vs estimated warranty annual cost ${toMoney(
          warrantyAnnualCostUsd + warrantyServiceFeeUsd
        )}.`,
        impact:
          expectedNetImpactUsd > 150 ? 'POSITIVE' : expectedNetImpactUsd < -150 ? 'NEGATIVE' : 'NEUTRAL',
      },
      {
        label: 'Coverage gaps scan',
        detail:
          coverageGaps.length > 0
            ? `${coverageGaps.length} gap(s) detected from inventory coverage mapping.`
            : 'No high-value coverage gaps were detected.',
        impact: coverageGaps.length > 0 ? 'NEGATIVE' : 'POSITIVE',
      },
      {
        label: 'Risk tolerance adjustment',
        detail: `User preference set to ${riskTolerance}, affecting expected-loss assumptions.`,
        impact: 'NEUTRAL',
      },
    ];

    const nextSteps: NextStep[] = [];
    if (insurancePolicies.length === 0) {
      nextSteps.push({
        title: 'Add your primary homeowner policy details',
        detail: 'Store premium and deductible values to improve insurance confidence.',
        priority: 'HIGH',
      });
    }
    if (coverageGaps.length > 0) {
      nextSteps.push({
        title: 'Close inventory coverage gaps',
        detail: `${coverageGaps.length} high-value item(s) are missing active warranty or insurance mapping.`,
        priority: coverageGaps.length >= 3 ? 'HIGH' : 'MEDIUM',
      });
    }
    if (
      deductibleUsd !== undefined &&
      cashBufferUsd !== undefined &&
      cashBufferUsd > 0 &&
      deductibleUsd / cashBufferUsd > 0.25
    ) {
      nextSteps.push({
        title: 'Review deductible vs emergency cash buffer',
        detail: 'A lower deductible may reduce short-term out-of-pocket strain.',
        priority: deductibleUsd / cashBufferUsd > 0.4 ? 'HIGH' : 'MEDIUM',
      });
    }
    if (warrantyVerdict === CoverageVerdict.NOT_WORTH_IT) {
      nextSteps.push({
        title: 'Re-evaluate warranty spend for low-risk systems',
        detail: 'Current expected repair risk appears lower than annual warranty costs.',
        priority: 'LOW',
      });
    }
    if (recommendedAddOns.length > 0) {
      nextSteps.push({
        title: 'Review optional protection add-ons at next renewal',
        detail: 'Use the add-on list as questions for your current carrier/warranty provider.',
        priority: 'MEDIUM',
      });
    }

    const summary =
      overallVerdict === CoverageVerdict.WORTH_IT
        ? 'Coverage stack appears valuable for this property. Keep limits and deductible settings aligned to risk signals.'
        : overallVerdict === CoverageVerdict.SITUATIONAL
          ? 'Coverage value is mixed. A periodic review of deductibles, add-ons, and warranty costs is recommended.'
          : 'Current protection mix may not be cost-efficient. Revisit assumptions and verify if coverage levels match your risk profile.';

    const snapshot: ComputedSnapshot = {
      status: CoverageAnalysisStatus.READY,
      confidence,
      impactLevel,
      overallVerdict,
      insuranceVerdict,
      warrantyVerdict,
      summary,
      nextSteps: dedupeSteps(nextSteps).slice(0, 5),
      insuranceResult: {
        inputsUsed: {
          annualPremiumUsd: toMoney(annualPremiumUsd),
          deductibleUsd: toMoney(deductibleUsd),
          cashBufferUsd: toMoney(cashBufferUsd),
          riskTolerance,
        },
        flags: dedupeByCode(insuranceFlags),
      },
      warrantyResult: {
        inputsUsed: {
          warrantyAnnualCostUsd: toMoney(warrantyAnnualCostUsd),
          warrantyServiceFeeUsd: toMoney(warrantyServiceFeeUsd),
        },
        expectedAnnualRepairRiskUsd: toMoney(expectedAnnualRepairRiskUsd),
        expectedNetImpactUsd: toMoney(expectedNetImpactUsd),
        breakEvenMonths,
      },
      addOnRecommendations: dedupeByCode(recommendedAddOns),
      decisionTrace: decisionTrace.slice(0, 12),
      inputsSnapshot: {
        overrides: overrides ?? {},
        counts: {
          inventoryItems: inventoryItems.length,
          maintenanceTasks: maintenanceTasks.length,
          claimsLast24Months: claims.length,
          insurancePolicies: insurancePolicies.length,
          warranties: warranties.length,
          coverageGaps: coverageGaps.length,
        },
      },
    };

    return { snapshot, homeownerProfileId };
  }

  private async createAnalysisRecord(
    propertyId: string,
    homeownerProfileId: string,
    snapshot: ComputedSnapshot
  ): Promise<LatestAnalysisRecord> {
    const analysis = await prisma.coverageAnalysis.create({
      data: {
        propertyId,
        homeownerProfileId,
        status: snapshot.status,
        confidence: snapshot.confidence,
        impactLevel: snapshot.impactLevel,
        overallVerdict: snapshot.overallVerdict,
        insuranceVerdict: snapshot.insuranceVerdict,
        warrantyVerdict: snapshot.warrantyVerdict,
        summary: snapshot.summary,
        nextSteps: snapshot.nextSteps as unknown as Prisma.InputJsonValue,
        insuranceResult: snapshot.insuranceResult as unknown as Prisma.InputJsonValue,
        warrantyResult: snapshot.warrantyResult as unknown as Prisma.InputJsonValue,
        addOnRecommendations: snapshot.addOnRecommendations as unknown as Prisma.InputJsonValue,
        decisionTrace: snapshot.decisionTrace as unknown as Prisma.InputJsonValue,
        inputsSnapshot: snapshot.inputsSnapshot as unknown as Prisma.InputJsonValue,
      },
      include: {
        scenarios: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    return analysis;
  }

  async getLatest(
    propertyId: string,
    userId: string
  ): Promise<{ exists: false } | { exists: true; analysis: CoverageAnalysisDTO }> {
    await assertPropertyForUser(propertyId, userId);

    const latest = await prisma.coverageAnalysis.findFirst({
      where: { propertyId },
      orderBy: { computedAt: 'desc' },
      include: {
        scenarios: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!latest) return { exists: false };

    return { exists: true, analysis: mapAnalysisToDto(latest) };
  }

  async run(
    propertyId: string,
    userId: string,
    overrides?: CoverageAnalysisOverrides
  ): Promise<CoverageAnalysisDTO> {
    const { snapshot, homeownerProfileId } = await this.computeSnapshot(propertyId, userId, overrides);
    const analysis = await this.createAnalysisRecord(propertyId, homeownerProfileId, snapshot);
    return mapAnalysisToDto(analysis);
  }

  async simulate(
    propertyId: string,
    userId: string,
    input: CoverageSimulationInput
  ): Promise<CoverageAnalysisDTO> {
    const { snapshot, homeownerProfileId } = await this.computeSnapshot(
      propertyId,
      userId,
      input.overrides
    );

    if (!input.saveScenario) {
      return {
        id: `sim-${Date.now()}`,
        propertyId,
        homeownerProfileId,
        status: snapshot.status,
        computedAt: new Date().toISOString(),
        overallVerdict: snapshot.overallVerdict,
        insuranceVerdict: snapshot.insuranceVerdict,
        warrantyVerdict: snapshot.warrantyVerdict,
        confidence: snapshot.confidence,
        impactLevel: snapshot.impactLevel,
        summary: snapshot.summary,
        nextSteps: snapshot.nextSteps,
        insurance: {
          inputsUsed: {
            annualPremiumUsd: snapshot.insuranceResult.inputsUsed.annualPremiumUsd,
            deductibleUsd: snapshot.insuranceResult.inputsUsed.deductibleUsd,
            cashBufferUsd: snapshot.insuranceResult.inputsUsed.cashBufferUsd,
          },
          flags: snapshot.insuranceResult.flags,
          recommendedAddOns: snapshot.addOnRecommendations,
        },
        warranty: {
          inputsUsed: snapshot.warrantyResult.inputsUsed,
          expectedAnnualRepairRiskUsd: snapshot.warrantyResult.expectedAnnualRepairRiskUsd,
          expectedNetImpactUsd: snapshot.warrantyResult.expectedNetImpactUsd,
          breakEvenMonths: snapshot.warrantyResult.breakEvenMonths,
        },
        decisionTrace: snapshot.decisionTrace,
        scenarios: [],
      };
    }

    let latest = await prisma.coverageAnalysis.findFirst({
      where: { propertyId, homeownerProfileId },
      orderBy: { computedAt: 'desc' },
      include: {
        scenarios: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!latest) {
      latest = await this.createAnalysisRecord(propertyId, homeownerProfileId, snapshot);
    }

    await prisma.coverageScenario.create({
      data: {
        propertyId,
        coverageAnalysisId: latest.id,
        name: input.name ?? undefined,
        inputOverrides: (input.overrides ?? {}) as Prisma.InputJsonValue,
        outputSnapshot: {
          overallVerdict: snapshot.overallVerdict,
          insuranceVerdict: snapshot.insuranceVerdict,
          warrantyVerdict: snapshot.warrantyVerdict,
          confidence: snapshot.confidence,
          impactLevel: snapshot.impactLevel,
          warrantyResult: snapshot.warrantyResult,
          insuranceResult: snapshot.insuranceResult,
        } as Prisma.InputJsonValue,
      },
    });

    const refreshed = await prisma.coverageAnalysis.findFirstOrThrow({
      where: { id: latest.id },
      include: {
        scenarios: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    return mapAnalysisToDto(refreshed);
  }
}

export async function markCoverageAnalysisStale(propertyId: string) {
  await prisma.coverageAnalysis.updateMany({
    where: {
      propertyId,
      status: CoverageAnalysisStatus.READY,
    },
    data: {
      status: CoverageAnalysisStatus.STALE,
    },
  });
}
