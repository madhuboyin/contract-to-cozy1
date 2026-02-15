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

export type ItemCoverageType = 'WARRANTY' | 'SERVICE_PLAN';

export type ItemCoverageAnalysisOverrides = {
  coverageType?: ItemCoverageType;
  annualCostUsd?: number;
  serviceFeeUsd?: number;
  cashBufferUsd?: number;
  riskTolerance?: RiskTolerance;
  replacementCostUsd?: number;
  expectedRemainingYears?: number;
};

export type CoverageSimulationInput = {
  overrides?: CoverageAnalysisOverrides;
  saveScenario?: boolean;
  name?: string;
};

export type ItemCoverageAnalysisInput = {
  overrides?: ItemCoverageAnalysisOverrides;
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

export type ItemCoverageAnalysisDTO = {
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

  item: {
    itemId: string;
    name: string;
    category?: string | null;
    roomId?: string | null;
  };

  warranty: {
    inputsUsed: {
      annualCostUsd?: number;
      serviceFeeUsd?: number;
      replacementCostUsd?: number;
      expectedRemainingYears?: number;
    };
    expectedAnnualRepairRiskUsd?: number;
    expectedCoverageCostUsd?: number;
    expectedNetImpactUsd?: number;
    breakEvenMonths?: number | null;
    recommendation?: 'BUY_NOW' | 'WAIT' | 'REPLACE_SOON';
  };

  decisionTrace: Array<{
    label: string;
    detail?: string;
    impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
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

type ItemComputedSnapshot = {
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
      cashBufferUsd?: number;
      riskTolerance: RiskTolerance;
      coverageType: ItemCoverageType;
    };
    flags: InsuranceFlag[];
  };
  warrantyResult: {
    inputsUsed: {
      annualCostUsd?: number;
      serviceFeeUsd?: number;
      replacementCostUsd?: number;
      expectedRemainingYears?: number;
    };
    expectedAnnualRepairRiskUsd?: number;
    expectedCoverageCostUsd?: number;
    expectedNetImpactUsd?: number;
    breakEvenMonths?: number | null;
    recommendation?: 'BUY_NOW' | 'WAIT' | 'REPLACE_SOON';
  };
  decisionTrace: DecisionTraceItem[];
  inputsSnapshot: Record<string, unknown>;
};

type LatestAnalysisRecord = CoverageAnalysis & {
  scenarios: CoverageScenario[];
};

const DEFAULT_WARRANTY_SERVICE_FEE_USD = 95;
const DEFAULT_DEDUCTIBLE_USD = 1500;
const DEFAULT_ITEM_ANNUAL_COST_USD = 420;
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

const ITEM_CATEGORY_DEFAULTS: Record<
  string,
  {
    lifespanYears: number;
    typicalRepairCostUsd: number;
    expectedCallsPerYear: number;
  }
> = {
  APPLIANCE: { lifespanYears: 12, typicalRepairCostUsd: 620, expectedCallsPerYear: 0.7 },
  HVAC: { lifespanYears: 15, typicalRepairCostUsd: 980, expectedCallsPerYear: 0.85 },
  PLUMBING: { lifespanYears: 20, typicalRepairCostUsd: 540, expectedCallsPerYear: 0.6 },
  ELECTRICAL: { lifespanYears: 22, typicalRepairCostUsd: 520, expectedCallsPerYear: 0.55 },
  ROOF_EXTERIOR: { lifespanYears: 24, typicalRepairCostUsd: 1100, expectedCallsPerYear: 0.5 },
  SAFETY: { lifespanYears: 10, typicalRepairCostUsd: 260, expectedCallsPerYear: 0.4 },
  SMART_HOME: { lifespanYears: 8, typicalRepairCostUsd: 320, expectedCallsPerYear: 0.5 },
  FURNITURE: { lifespanYears: 11, typicalRepairCostUsd: 300, expectedCallsPerYear: 0.35 },
  ELECTRONICS: { lifespanYears: 7, typicalRepairCostUsd: 340, expectedCallsPerYear: 0.55 },
  OTHER: { lifespanYears: 10, typicalRepairCostUsd: 420, expectedCallsPerYear: 0.5 },
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ageYearsFromDate(date?: Date | null): number | undefined {
  if (!date) return undefined;
  const years = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365);
  if (!Number.isFinite(years) || years < 0) return undefined;
  return Math.round(years * 10) / 10;
}

function parseItemIdFromInputsSnapshot(value: Prisma.JsonValue | null | undefined): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const root = value as Record<string, unknown>;
  if (typeof root.itemId === 'string' && root.itemId) {
    return root.itemId;
  }

  const item = root.item;
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;

  const itemRecord = item as Record<string, unknown>;
  const idFromItem = itemRecord.itemId ?? itemRecord.id;
  return typeof idFromItem === 'string' && idFromItem ? idFromItem : null;
}

function parseItemMetaFromInputsSnapshot(
  value: Prisma.JsonValue | null | undefined
): { itemId: string; name: string; category?: string | null; roomId?: string | null } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  const item = root.item;
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;

  const itemRecord = item as Record<string, unknown>;
  const itemIdRaw = itemRecord.itemId ?? itemRecord.id;
  const nameRaw = itemRecord.name;

  if (typeof itemIdRaw !== 'string' || !itemIdRaw || typeof nameRaw !== 'string' || !nameRaw) {
    return null;
  }

  return {
    itemId: itemIdRaw,
    name: nameRaw,
    category: typeof itemRecord.category === 'string' ? itemRecord.category : null,
    roomId: typeof itemRecord.roomId === 'string' ? itemRecord.roomId : null,
  };
}

function computeItemFailureProbability(
  ageYears: number | undefined,
  lifespanYears: number,
  condition: InventoryItemCondition
): number {
  const conditionMultiplier: Record<InventoryItemCondition, number> = {
    NEW: 0.75,
    GOOD: 0.9,
    FAIR: 1.12,
    POOR: 1.35,
    UNKNOWN: 1.0,
  };

  if (ageYears === undefined) {
    return clamp(0.25 * (conditionMultiplier[condition] ?? 1), 0.06, 0.85);
  }

  const ageRatio = lifespanYears > 0 ? ageYears / lifespanYears : 0.7;

  let base: number;
  if (ageRatio < 0.35) base = 0.08;
  else if (ageRatio < 0.65) base = 0.18;
  else if (ageRatio < 0.85) base = 0.35;
  else if (ageRatio <= 1.0) base = 0.55;
  else base = 0.72;

  return clamp(base * (conditionMultiplier[condition] ?? 1), 0.04, 0.92);
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

function mapAnalysisToItemDto(
  analysis: LatestAnalysisRecord,
  fallbackItem?: {
    id: string;
    name: string;
    category?: string | null;
    roomId?: string | null;
  }
): ItemCoverageAnalysisDTO {
  const trace = safeArray<DecisionTraceItem>(analysis.decisionTrace);
  const nextSteps = safeArray<NextStep>(analysis.nextSteps);
  const warrantyResult = safeObject(
    analysis.warrantyResult,
    {
      inputsUsed: {},
      expectedAnnualRepairRiskUsd: undefined,
      expectedCoverageCostUsd: undefined,
      expectedNetImpactUsd: undefined,
      breakEvenMonths: null,
      recommendation: undefined,
    } as {
      inputsUsed: {
        annualCostUsd?: number;
        serviceFeeUsd?: number;
        replacementCostUsd?: number;
        expectedRemainingYears?: number;
      };
      expectedAnnualRepairRiskUsd?: number;
      expectedCoverageCostUsd?: number;
      expectedNetImpactUsd?: number;
      breakEvenMonths?: number | null;
      recommendation?: 'BUY_NOW' | 'WAIT' | 'REPLACE_SOON';
    }
  );

  const parsedMeta = parseItemMetaFromInputsSnapshot(analysis.inputsSnapshot);
  const itemMeta = fallbackItem
    ? {
        itemId: fallbackItem.id,
        name: fallbackItem.name,
        category: fallbackItem.category ?? null,
        roomId: fallbackItem.roomId ?? null,
      }
    : parsedMeta ?? {
        itemId: parseItemIdFromInputsSnapshot(analysis.inputsSnapshot) ?? 'unknown-item',
        name: 'Inventory item',
        category: null,
        roomId: null,
      };

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
    item: itemMeta,
    warranty: {
      inputsUsed: warrantyResult.inputsUsed ?? {},
      expectedAnnualRepairRiskUsd: toMoney(warrantyResult.expectedAnnualRepairRiskUsd),
      expectedCoverageCostUsd: toMoney(warrantyResult.expectedCoverageCostUsd),
      expectedNetImpactUsd: toMoney(warrantyResult.expectedNetImpactUsd),
      breakEvenMonths: warrantyResult.breakEvenMonths ?? null,
      recommendation: warrantyResult.recommendation,
    },
    decisionTrace: trace,
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

  private async assertItemForProperty(propertyId: string, itemId: string) {
    const item = await prisma.inventoryItem.findFirst({
      where: { id: itemId, propertyId },
      select: {
        id: true,
        name: true,
        category: true,
        roomId: true,
        condition: true,
        installedOn: true,
        purchasedOn: true,
        replacementCostCents: true,
        purchaseCostCents: true,
        homeAssetId: true,
        warranty: {
          select: {
            id: true,
            cost: true,
          },
        },
      },
    });

    if (!item) {
      throw new Error('Inventory item not found for this property.');
    }

    return item;
  }

  private async computeItemSnapshot(
    propertyId: string,
    itemId: string,
    userId: string,
    overrides?: ItemCoverageAnalysisOverrides
  ): Promise<{
    snapshot: ItemComputedSnapshot;
    homeownerProfileId: string;
    item: {
      id: string;
      name: string;
      category: string | null;
      roomId: string | null;
      condition: InventoryItemCondition;
      installedOn: Date | null;
      purchasedOn: Date | null;
      replacementCostCents: number | null;
      purchaseCostCents: number | null;
      homeAssetId: string | null;
      warranty: { id: string; cost: Prisma.Decimal | null } | null;
    };
  }> {
    const property = await assertPropertyForUser(propertyId, userId);
    const item = await this.assertItemForProperty(propertyId, itemId);
    const homeownerProfileId = property.homeownerProfileId;

    const lookback = new Date();
    lookback.setMonth(lookback.getMonth() - 24);

    const [maintenanceTasks, claims, coverageGaps] = await Promise.all([
      prisma.propertyMaintenanceTask.findMany({
        where: { propertyId },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          serviceCategory: true,
          homeAssetId: true,
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
        },
      }),
      detectCoverageGaps(propertyId),
    ]);

    const defaults = ITEM_CATEGORY_DEFAULTS[item.category] ?? ITEM_CATEGORY_DEFAULTS.OTHER;
    const coverageType: ItemCoverageType = overrides?.coverageType ?? 'WARRANTY';
    const riskTolerance: RiskTolerance = overrides?.riskTolerance ?? 'MEDIUM';
    const riskToleranceMultiplierValue = riskToleranceMultiplier(riskTolerance);

    const ageYears = ageYearsFromDate(item.installedOn ?? item.purchasedOn ?? null);
    const inferredRemainingYears =
      ageYears !== undefined ? Math.max(0, defaults.lifespanYears - ageYears) : Math.round(defaults.lifespanYears * 0.55 * 10) / 10;
    const expectedRemainingYears = Math.max(
      0,
      overrides?.expectedRemainingYears ?? inferredRemainingYears
    );

    const failureProb = computeItemFailureProbability(ageYears, defaults.lifespanYears, item.condition);

    const replacementCostUsd =
      overrides?.replacementCostUsd ??
      (item.replacementCostCents !== null && item.replacementCostCents !== undefined
        ? item.replacementCostCents / 100
        : item.purchaseCostCents !== null && item.purchaseCostCents !== undefined
          ? (item.purchaseCostCents / 100) * 1.15
          : defaults.typicalRepairCostUsd * 3.5);

    const annualCostUsd =
      overrides?.annualCostUsd ??
      asNumber(item.warranty?.cost) ??
      DEFAULT_ITEM_ANNUAL_COST_USD;
    const serviceFeeUsd = overrides?.serviceFeeUsd ?? DEFAULT_WARRANTY_SERVICE_FEE_USD;
    const cashBufferUsd = overrides?.cashBufferUsd;

    const relevantServiceCategoriesByItemCategory: Record<string, string[]> = {
      APPLIANCE: ['APPLIANCE_REPAIR', 'HANDYMAN', 'ELECTRICAL', 'PLUMBING'],
      HVAC: ['HVAC'],
      PLUMBING: ['PLUMBING'],
      ELECTRICAL: ['ELECTRICAL'],
      ROOF_EXTERIOR: ['HANDYMAN', 'INSPECTION'],
      SAFETY: ['HANDYMAN', 'ELECTRICAL'],
      SMART_HOME: ['ELECTRICAL', 'HANDYMAN'],
      FURNITURE: ['HANDYMAN'],
      ELECTRONICS: ['ELECTRICAL'],
      OTHER: ['HANDYMAN'],
    };

    const itemNameLower = item.name.toLowerCase();
    const itemNameTokens = itemNameLower
      .split(/[\s\-_/]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4);
    const categoryServiceMatchWeightByItemCategory: Record<string, number> = {
      APPLIANCE: 0.7,
      HVAC: 0.9,
      PLUMBING: 0.9,
      ELECTRICAL: 0.85,
      ROOF_EXTERIOR: 0.8,
      SAFETY: 0.6,
      SMART_HOME: 0.55,
      FURNITURE: 0.05,
      ELECTRONICS: 0.15,
      OTHER: 0.05,
    };

    let relevantTaskCount = 0;
    let relevantTaskScore = 0;
    for (const task of maintenanceTasks) {
      let contribution = 0;

      if (item.homeAssetId && task.homeAssetId && item.homeAssetId === task.homeAssetId) {
        contribution = Math.max(contribution, 1.0);
      }

      const title = String(task.title || '').toLowerCase();
      if (title && itemNameTokens.length > 0 && itemNameTokens.some((token) => title.includes(token))) {
        contribution = Math.max(contribution, 0.8);
      }

      const relevantServices = relevantServiceCategoriesByItemCategory[item.category] ?? [];
      if (task.serviceCategory && relevantServices.includes(task.serviceCategory)) {
        contribution = Math.max(
          contribution,
          categoryServiceMatchWeightByItemCategory[item.category] ?? 0.35
        );
      }

      if (contribution > 0) {
        relevantTaskCount += 1;
        relevantTaskScore += contribution;
      }
    }

    const claimKeywordsByCategory: Record<string, string[]> = {
      APPLIANCE: ['APPLIANCE', 'EQUIPMENT', 'ELECTRICAL'],
      HVAC: ['HVAC', 'FIRE', 'WATER_DAMAGE'],
      PLUMBING: ['PLUMBING', 'WATER_DAMAGE', 'FLOOD'],
      ELECTRICAL: ['ELECTRICAL', 'FIRE'],
      ROOF_EXTERIOR: ['ROOF', 'WIND', 'HAIL', 'STORM'],
      SAFETY: ['SMOKE', 'SECURITY', 'FIRE'],
      SMART_HOME: ['ELECTRICAL', 'SECURITY'],
      FURNITURE: ['WATER_DAMAGE', 'FIRE'],
      ELECTRONICS: ['ELECTRICAL', 'POWER'],
      OTHER: [],
    };

    const claimKeywords = claimKeywordsByCategory[item.category] ?? [];
    const relevantClaimCount = claims.filter((claim) => {
      if (!claimKeywords.length) return false;
      const type = String(claim.type || '').toUpperCase();
      return claimKeywords.some((k) => type.includes(k));
    }).length;

    const propertyRiskScore = property.riskReport?.riskScore ?? 60;
    const propertyRiskMultiplier =
      propertyRiskScore < 45 ? 1.25 : propertyRiskScore < 60 ? 1.12 : propertyRiskScore > 80 ? 0.9 : 1;

    const gapForItem = coverageGaps.some((gap) => gap.inventoryItemId === item.id);
    const expectedCallsPerYear =
      defaults.expectedCallsPerYear +
      (failureProb >= 0.5 ? 0.35 : failureProb >= 0.3 ? 0.15 : 0) +
      (relevantTaskScore >= 1 ? 0.1 : 0);

    const effectiveRepairCostUsd = Math.max(
      40,
      Math.min(
        defaults.typicalRepairCostUsd,
        replacementCostUsd > 0 ? replacementCostUsd * 0.65 : defaults.typicalRepairCostUsd
      )
    );

    const baseAnnualRiskUsd =
      effectiveRepairCostUsd * failureProb * riskToleranceMultiplierValue * propertyRiskMultiplier;
    const taskRiskBoostUsd = Math.min(90, relevantTaskScore * 22);
    const claimRiskBoostUsd = Math.min(180, relevantClaimCount * 45);
    const gapRiskBoostUsd = gapForItem ? Math.min(60, Math.max(20, replacementCostUsd * 0.08)) : 0;
    const rawExpectedAnnualRepairRiskUsd =
      baseAnnualRiskUsd + taskRiskBoostUsd + claimRiskBoostUsd + gapRiskBoostUsd;
    const annualRiskCapUsd = replacementCostUsd > 0 ? replacementCostUsd : rawExpectedAnnualRepairRiskUsd;

    const expectedAnnualRepairRiskUsd = Math.max(
      0,
      Math.min(rawExpectedAnnualRepairRiskUsd, annualRiskCapUsd)
    );
    const expectedCoverageCostUsd = Math.max(0, annualCostUsd + serviceFeeUsd * expectedCallsPerYear);
    const expectedNetImpactUsd = expectedAnnualRepairRiskUsd - expectedCoverageCostUsd;
    const breakEvenMonths =
      expectedAnnualRepairRiskUsd > 0
        ? Math.round((expectedCoverageCostUsd / expectedAnnualRepairRiskUsd) * 12 * 10) / 10
        : null;

    let warrantyVerdict: CoverageVerdict;
    let recommendation: 'BUY_NOW' | 'WAIT' | 'REPLACE_SOON';
    if (expectedRemainingYears <= 2.5) {
      recommendation = 'REPLACE_SOON';
      if (expectedNetImpactUsd >= 650) warrantyVerdict = CoverageVerdict.WORTH_IT;
      else if (expectedNetImpactUsd >= 250) warrantyVerdict = CoverageVerdict.SITUATIONAL;
      else warrantyVerdict = CoverageVerdict.NOT_WORTH_IT;
    } else if (expectedNetImpactUsd > 150) {
      warrantyVerdict = CoverageVerdict.WORTH_IT;
      recommendation = 'BUY_NOW';
    } else if (expectedNetImpactUsd < -150) {
      warrantyVerdict = CoverageVerdict.NOT_WORTH_IT;
      recommendation = expectedRemainingYears <= 4 ? 'REPLACE_SOON' : 'WAIT';
    } else {
      warrantyVerdict = CoverageVerdict.SITUATIONAL;
      recommendation = 'WAIT';
    }

    const insuranceVerdict = CoverageVerdict.SITUATIONAL;
    const overallVerdict = warrantyVerdict;

    const confidenceSignals = [
      ageYears !== undefined,
      !!item.category,
      item.condition !== 'UNKNOWN',
      replacementCostUsd > 0,
      Number.isFinite(annualCostUsd),
      maintenanceTasks.length > 0 || claims.length > 0 || property.riskReport?.riskScore !== null,
    ].filter(Boolean).length;

    const confidence: CoverageConfidence =
      confidenceSignals >= 5
        ? CoverageConfidence.HIGH
        : confidenceSignals >= 3
          ? CoverageConfidence.MEDIUM
          : CoverageConfidence.LOW;

    const impactLevel: CoverageImpactLevel =
      Math.abs(expectedNetImpactUsd) >= 500
        ? CoverageImpactLevel.HIGH
        : Math.abs(expectedNetImpactUsd) >= 200
          ? CoverageImpactLevel.MEDIUM
          : CoverageImpactLevel.LOW;

    const decisionTrace: DecisionTraceItem[] = [
      {
        label: 'Item profile analyzed',
        detail: `${item.name} (${item.category}) with condition ${item.condition}.`,
        impact: 'NEUTRAL',
      },
      {
        label: 'Age and lifespan estimate',
        detail:
          ageYears !== undefined
            ? `Estimated age ${ageYears} years vs typical ${defaults.lifespanYears}-year lifespan.`
            : `Item age unknown; used category default lifespan of ${defaults.lifespanYears} years.`,
        impact: ageYears !== undefined && expectedRemainingYears <= 3 ? 'NEGATIVE' : 'NEUTRAL',
      },
      {
        label: 'Failure probability',
        detail: `Estimated annual failure probability ${(failureProb * 100).toFixed(0)}%.`,
        impact: failureProb >= 0.45 ? 'NEGATIVE' : failureProb <= 0.15 ? 'POSITIVE' : 'NEUTRAL',
      },
      {
        label: 'Repair risk estimate',
        detail: `Expected annual repair risk ≈ $${toMoney(expectedAnnualRepairRiskUsd)} (educational estimate; capped by replacement value).`,
        impact: expectedAnnualRepairRiskUsd >= expectedCoverageCostUsd ? 'POSITIVE' : 'NEGATIVE',
      },
      {
        label: `${coverageType === 'SERVICE_PLAN' ? 'Service plan' : 'Warranty'} cost inputs`,
        detail: `Annual cost $${toMoney(annualCostUsd)} + service fees $${toMoney(serviceFeeUsd)} × ${expectedCallsPerYear.toFixed(1)} expected call(s).`,
        impact: expectedCoverageCostUsd <= expectedAnnualRepairRiskUsd ? 'POSITIVE' : 'NEGATIVE',
      },
      {
        label: 'Net impact comparison',
        detail: `Expected net impact ≈ $${toMoney(expectedNetImpactUsd)} (positive means coverage likely pays off).`,
        impact: expectedNetImpactUsd > 150 ? 'POSITIVE' : expectedNetImpactUsd < -150 ? 'NEGATIVE' : 'NEUTRAL',
      },
      {
        label: 'Remaining useful life',
        detail: `${expectedRemainingYears.toFixed(1)} year(s) estimated remaining before replacement pressure.`,
        impact: expectedRemainingYears <= 2.5 ? 'NEGATIVE' : 'NEUTRAL',
      },
      {
        label: 'Property risk and history signals',
        detail: `${relevantTaskCount} relevant maintenance task(s), ${relevantClaimCount} related claim(s), property risk score ${Math.round(propertyRiskScore)}.`,
        impact: relevantTaskCount + relevantClaimCount >= 2 || propertyRiskScore < 50 ? 'NEGATIVE' : 'NEUTRAL',
      },
      {
        label: 'Coverage gaps considered',
        detail: gapForItem
          ? 'Item has a current coverage gap signal in inventory coverage data.'
          : 'No active item-level coverage gap signal detected.',
        impact: gapForItem ? 'NEGATIVE' : 'POSITIVE',
      },
    ];

    const nextSteps: NextStep[] = [];
    if (warrantyVerdict === CoverageVerdict.WORTH_IT) {
      nextSteps.push({
        title: `Request ${coverageType === 'SERVICE_PLAN' ? 'service plan' : 'warranty'} quotes for this item`,
        detail: 'Compare annual cost and service fee terms against this estimate.',
        priority: 'HIGH',
      });
    }
    if (warrantyVerdict === CoverageVerdict.SITUATIONAL) {
      nextSteps.push({
        title: 'Run 2-3 pricing scenarios before buying coverage',
        detail: 'Try lower annual cost or service fee assumptions to see break-even shifts.',
        priority: 'MEDIUM',
      });
    }
    if (recommendation === 'REPLACE_SOON') {
      nextSteps.push({
        title: 'Plan replacement budget',
        detail: `Remaining life is limited; compare coverage spend with replacement planning.`,
        priority: 'HIGH',
      });
    }
    if (ageYears === undefined) {
      nextSteps.push({
        title: 'Add install or purchase date',
        detail: 'Known age improves confidence and break-even accuracy.',
        priority: 'MEDIUM',
      });
    }
    if (cashBufferUsd !== undefined && cashBufferUsd > 0 && replacementCostUsd > cashBufferUsd * 0.8) {
      nextSteps.push({
        title: 'Check emergency cash buffer vs replacement cost',
        detail: `Replacement estimate ($${toMoney(replacementCostUsd)}) is high relative to current buffer.`,
        priority: 'MEDIUM',
      });
    }

    const summary =
      warrantyVerdict === CoverageVerdict.WORTH_IT
        ? 'Educational estimate suggests this item is a strong candidate for coverage now.'
        : warrantyVerdict === CoverageVerdict.SITUATIONAL
          ? 'Coverage value is mixed for this item. Scenario testing is recommended before purchase.'
          : 'Educational estimate suggests coverage may not be cost-effective right now; replacement planning may be better.';

    const snapshot: ItemComputedSnapshot = {
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
          cashBufferUsd: toMoney(cashBufferUsd),
          riskTolerance,
          coverageType,
        },
        flags: [],
      },
      warrantyResult: {
        inputsUsed: {
          annualCostUsd: toMoney(annualCostUsd),
          serviceFeeUsd: toMoney(serviceFeeUsd),
          replacementCostUsd: toMoney(replacementCostUsd),
          expectedRemainingYears: Math.round(expectedRemainingYears * 10) / 10,
        },
        expectedAnnualRepairRiskUsd: toMoney(expectedAnnualRepairRiskUsd),
        expectedCoverageCostUsd: toMoney(expectedCoverageCostUsd),
        expectedNetImpactUsd: toMoney(expectedNetImpactUsd),
        breakEvenMonths,
        recommendation,
      },
      decisionTrace: decisionTrace.slice(0, 12),
      inputsSnapshot: {
        scope: 'ITEM',
        itemId: item.id,
        coverageType,
        overridesUsed: overrides ?? {},
        item: {
          itemId: item.id,
          name: item.name,
          category: item.category,
          roomId: item.roomId,
        },
        inferred: {
          ageYears: ageYears ?? null,
          defaultLifespanYears: defaults.lifespanYears,
          failureProbability: Number(failureProb.toFixed(4)),
          expectedCallsPerYear: Number(expectedCallsPerYear.toFixed(2)),
          relevantTaskCount,
          relevantTaskScore: Number(relevantTaskScore.toFixed(2)),
          relevantClaimCount,
          propertyRiskScore: Math.round(propertyRiskScore),
          effectiveRepairCostUsd: toMoney(effectiveRepairCostUsd),
        },
      },
    };

    return {
      snapshot,
      homeownerProfileId,
      item: {
        id: item.id,
        name: item.name,
        category: item.category,
        roomId: item.roomId,
        condition: item.condition,
        installedOn: item.installedOn,
        purchasedOn: item.purchasedOn,
        replacementCostCents: item.replacementCostCents,
        purchaseCostCents: item.purchaseCostCents,
        homeAssetId: item.homeAssetId,
        warranty: item.warranty,
      },
    };
  }

  private async createItemAnalysisRecord(
    propertyId: string,
    homeownerProfileId: string,
    snapshot: ItemComputedSnapshot
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
        addOnRecommendations: [] as unknown as Prisma.InputJsonValue,
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

  async getLatestForItem(
    propertyId: string,
    itemId: string,
    userId: string
  ): Promise<{ exists: false } | { exists: true; analysis: ItemCoverageAnalysisDTO }> {
    await assertPropertyForUser(propertyId, userId);
    const item = await this.assertItemForProperty(propertyId, itemId);

    const recentAnalyses = await prisma.coverageAnalysis.findMany({
      where: { propertyId },
      orderBy: { computedAt: 'desc' },
      include: {
        scenarios: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      take: 200,
    });

    const latestForItem = recentAnalyses.find(
      (analysis) => parseItemIdFromInputsSnapshot(analysis.inputsSnapshot) === itemId
    );
    if (!latestForItem) return { exists: false };

    return {
      exists: true,
      analysis: mapAnalysisToItemDto(latestForItem, {
        id: item.id,
        name: item.name,
        category: item.category,
        roomId: item.roomId,
      }),
    };
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

  async runItemAnalysis(
    propertyId: string,
    itemId: string,
    userId: string,
    overrides?: ItemCoverageAnalysisOverrides
  ): Promise<ItemCoverageAnalysisDTO> {
    const { snapshot, homeownerProfileId, item } = await this.computeItemSnapshot(
      propertyId,
      itemId,
      userId,
      overrides
    );
    const analysis = await this.createItemAnalysisRecord(propertyId, homeownerProfileId, snapshot);
    return mapAnalysisToItemDto(analysis, {
      id: item.id,
      name: item.name,
      category: item.category,
      roomId: item.roomId,
    });
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

export async function markItemCoverageAnalysesStale(propertyId: string, itemId?: string) {
  const readyAnalyses = await prisma.coverageAnalysis.findMany({
    where: {
      propertyId,
      status: CoverageAnalysisStatus.READY,
    },
    select: {
      id: true,
      computedAt: true,
      inputsSnapshot: true,
    },
    orderBy: {
      computedAt: 'desc',
    },
    take: 500,
  });

  const latestByItem = new Map<string, string>();
  for (const analysis of readyAnalyses) {
    const scopedItemId = parseItemIdFromInputsSnapshot(analysis.inputsSnapshot);
    if (!scopedItemId) continue;
    if (itemId && scopedItemId !== itemId) continue;
    if (!latestByItem.has(scopedItemId)) {
      latestByItem.set(scopedItemId, analysis.id);
    }
  }

  const ids = [...latestByItem.values()];
  if (!ids.length) return;

  await prisma.coverageAnalysis.updateMany({
    where: {
      id: { in: ids },
      status: CoverageAnalysisStatus.READY,
    },
    data: {
      status: CoverageAnalysisStatus.STALE,
    },
  });
}
