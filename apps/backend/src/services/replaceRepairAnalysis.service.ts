import {
  InventoryItemCondition,
  Prisma,
  ReplaceRepairAnalysis,
  ReplaceRepairAnalysisStatus,
  ReplaceRepairConfidence,
  ReplaceRepairImpactLevel,
  ReplaceRepairVerdict,
  HomeEventType,
} from '@prisma/client';
import { prisma } from '../lib/prisma';

type RiskTolerance = 'LOW' | 'MEDIUM' | 'HIGH';
type UsageIntensity = 'LOW' | 'MEDIUM' | 'HIGH';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
type Impact = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

export type ReplaceRepairOverrides = {
  estimatedNextRepairCostCents?: number;
  estimatedReplacementCostCents?: number;
  expectedRemainingYears?: number;
  cashBufferCents?: number;
  riskTolerance?: RiskTolerance;
  usageIntensity?: UsageIntensity;
};

export type ReplaceRepairAnalysisDTO = {
  id: string;
  propertyId: string;
  homeownerProfileId: string;
  inventoryItemId: string;

  status: 'READY' | 'STALE' | 'ERROR';
  verdict: 'REPLACE_NOW' | 'REPLACE_SOON' | 'REPAIR_AND_MONITOR' | 'REPAIR_ONLY';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  impactLevel?: 'LOW' | 'MEDIUM' | 'HIGH';

  summary?: string;

  nextSteps?: Array<{
    title: string;
    detail?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;

  decisionTrace: Array<{
    label: string;
    detail?: string;
    impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  }>;

  ageYears?: number;
  remainingYears?: number;
  estimatedNextRepairCostCents?: number;
  estimatedReplacementCostCents?: number;
  expectedAnnualRepairRiskCents?: number;
  breakEvenMonths?: number | null;

  computedAt: string;
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

type ItemDefaults = {
  lifespanYears: number;
  typicalRepairCostCents: number;
  typicalReplacementCostCents: number;
};

const DEFAULTS_BY_CATEGORY: Record<string, ItemDefaults> = {
  HVAC: { lifespanYears: 15, typicalRepairCostCents: 105000, typicalReplacementCostCents: 900000 },
  PLUMBING: { lifespanYears: 12, typicalRepairCostCents: 55000, typicalReplacementCostCents: 280000 },
  APPLIANCE: { lifespanYears: 11, typicalRepairCostCents: 65000, typicalReplacementCostCents: 165000 },
  ELECTRICAL: { lifespanYears: 14, typicalRepairCostCents: 52000, typicalReplacementCostCents: 220000 },
  ROOF_EXTERIOR: { lifespanYears: 24, typicalRepairCostCents: 155000, typicalReplacementCostCents: 1200000 },
  SAFETY: { lifespanYears: 9, typicalRepairCostCents: 25000, typicalReplacementCostCents: 95000 },
  SMART_HOME: { lifespanYears: 8, typicalRepairCostCents: 32000, typicalReplacementCostCents: 120000 },
  FURNITURE: { lifespanYears: 11, typicalRepairCostCents: 22000, typicalReplacementCostCents: 95000 },
  ELECTRONICS: { lifespanYears: 7, typicalRepairCostCents: 42000, typicalReplacementCostCents: 150000 },
  OTHER: { lifespanYears: 10, typicalRepairCostCents: 50000, typicalReplacementCostCents: 175000 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

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

function toInt(value?: number | null): number | undefined {
  if (value === null || value === undefined || Number.isNaN(value)) return undefined;
  return Math.max(0, Math.round(value));
}

function safeArray<T>(value: Prisma.JsonValue | null | undefined): T[] {
  if (!Array.isArray(value)) return [];
  return value as T[];
}

function ageYearsFromDate(date?: Date | null): number | undefined {
  if (!date) return undefined;
  const years = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365);
  if (!Number.isFinite(years) || years < 0) return undefined;
  return years;
}

function usageMultiplier(usageIntensity: UsageIntensity): number {
  if (usageIntensity === 'LOW') return 0.86;
  if (usageIntensity === 'HIGH') return 1.2;
  return 1;
}

function toleranceMultiplier(riskTolerance: RiskTolerance): number {
  if (riskTolerance === 'LOW') return 1.1;
  if (riskTolerance === 'HIGH') return 0.9;
  return 1;
}

function conditionAdjustment(condition: InventoryItemCondition): number {
  if (condition === 'NEW') return -0.05;
  if (condition === 'GOOD') return 0;
  if (condition === 'FAIR') return 0.08;
  if (condition === 'POOR') return 0.18;
  return 0.05;
}

function dedupeSteps(items: NextStep[]): NextStep[] {
  const seen = new Set<string>();
  const out: NextStep[] = [];
  for (const item of items) {
    const key = `${item.title}-${item.detail ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function inferDefaults(category: string, name: string): ItemDefaults {
  const normalizedCategory = String(category || 'OTHER').toUpperCase();
  const normalizedName = String(name || '').toLowerCase();

  if (normalizedCategory === 'APPLIANCE') {
    if (normalizedName.includes('water heater')) {
      return { lifespanYears: 10, typicalRepairCostCents: 65000, typicalReplacementCostCents: 260000 };
    }
    if (normalizedName.includes('dishwasher')) {
      return { lifespanYears: 10, typicalRepairCostCents: 45000, typicalReplacementCostCents: 95000 };
    }
    if (normalizedName.includes('fridge') || normalizedName.includes('refrigerator')) {
      return { lifespanYears: 13, typicalRepairCostCents: 70000, typicalReplacementCostCents: 180000 };
    }
    if (normalizedName.includes('washer') || normalizedName.includes('dryer')) {
      return { lifespanYears: 11, typicalRepairCostCents: 52000, typicalReplacementCostCents: 145000 };
    }
  }

  return DEFAULTS_BY_CATEGORY[normalizedCategory] ?? DEFAULTS_BY_CATEGORY.OTHER;
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
      riskReport: {
        select: {
          riskScore: true,
        },
      },
    },
  });

  if (!property) {
    throw new Error('Property not found or access denied.');
  }

  return property;
}

function mapAnalysisToDto(analysis: ReplaceRepairAnalysis): ReplaceRepairAnalysisDTO {
  return {
    id: analysis.id,
    propertyId: analysis.propertyId,
    homeownerProfileId: analysis.homeownerProfileId,
    inventoryItemId: analysis.inventoryItemId,
    status: analysis.status,
    verdict: analysis.verdict,
    confidence: analysis.confidence,
    impactLevel: analysis.impactLevel ?? undefined,
    summary: analysis.summary ?? undefined,
    nextSteps: safeArray<NextStep>(analysis.nextSteps),
    decisionTrace: safeArray<DecisionTraceItem>(analysis.decisionTrace),
    ageYears: analysis.ageYears ?? undefined,
    remainingYears: analysis.remainingYears ?? undefined,
    estimatedNextRepairCostCents: analysis.estimatedNextRepairCostCents ?? undefined,
    estimatedReplacementCostCents: analysis.estimatedReplacementCostCents ?? undefined,
    expectedAnnualRepairRiskCents: analysis.expectedAnnualRepairRiskCents ?? undefined,
    breakEvenMonths: analysis.breakEvenMonths ?? null,
    computedAt: analysis.computedAt.toISOString(),
  };
}

export class ReplaceRepairService {
  private async assertItemForProperty(propertyId: string, itemId: string) {
    const item = await prisma.inventoryItem.findFirst({
      where: { id: itemId, propertyId },
      select: {
        id: true,
        propertyId: true,
        roomId: true,
        name: true,
        category: true,
        condition: true,
        installedOn: true,
        purchasedOn: true,
        lastServicedOn: true,
        purchaseCostCents: true,
        replacementCostCents: true,
      },
    });

    if (!item) {
      throw new Error('Inventory item not found for property.');
    }

    return item;
  }

  async getLatestForItem(propertyId: string, itemId: string, userId: string) {
    await assertPropertyForUser(propertyId, userId);
    await this.assertItemForProperty(propertyId, itemId);

    const latest = await prisma.replaceRepairAnalysis.findFirst({
      where: { propertyId, inventoryItemId: itemId },
      orderBy: [{ computedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (!latest) {
      return { exists: false as const };
    }

    return {
      exists: true as const,
      analysis: mapAnalysisToDto(latest),
    };
  }

  async runItemAnalysis(propertyId: string, itemId: string, userId: string, overrides?: ReplaceRepairOverrides) {
    const property = await assertPropertyForUser(propertyId, userId);
    const item = await this.assertItemForProperty(propertyId, itemId);

    const riskTolerance: RiskTolerance = overrides?.riskTolerance ?? 'MEDIUM';
    const usageIntensity: UsageIntensity = overrides?.usageIntensity ?? 'MEDIUM';

    const defaults = inferDefaults(item.category, item.name);
    const ageYearsRaw = ageYearsFromDate(item.installedOn ?? item.purchasedOn ?? null);
    const ageYears = ageYearsRaw !== undefined ? Math.max(0, Math.round(ageYearsRaw)) : undefined;

    const inferredRemainingYears = ageYears !== undefined ? Math.max(0, defaults.lifespanYears - ageYears) : Math.round(defaults.lifespanYears * 0.5);
    const remainingYears = clamp(
      toInt(overrides?.expectedRemainingYears) ?? inferredRemainingYears,
      0,
      40
    );

    const estimatedReplacementCostCents = Math.max(
      5000,
      toInt(overrides?.estimatedReplacementCostCents) ??
        item.replacementCostCents ??
        (item.purchaseCostCents ? Math.max(Math.round(item.purchaseCostCents * 1.15), defaults.typicalReplacementCostCents) : defaults.typicalReplacementCostCents)
    );

    const lookback = new Date();
    lookback.setMonth(lookback.getMonth() - 30);

    const homeEvents = await prisma.homeEvent.findMany({
      where: {
        propertyId,
        inventoryItemId: item.id,
        occurredAt: { gte: lookback },
      },
      select: {
        id: true,
        type: true,
        subtype: true,
        title: true,
        amount: true,
        occurredAt: true,
      },
      orderBy: [{ occurredAt: 'desc' }],
    });

    const repairLikeEvents = homeEvents.filter((event) => {
      if (
        event.type === HomeEventType.REPAIR ||
        event.type === HomeEventType.MAINTENANCE ||
        event.type === HomeEventType.INSPECTION
      ) {
        return true;
      }

      const descriptor = `${event.type} ${event.subtype ?? ''} ${event.title ?? ''}`.toUpperCase();
      return descriptor.includes('REPLACE') || descriptor.includes('REPAIR') || descriptor.includes('MAINTEN');
    });

    const repairsLast24m = repairLikeEvents.length;
    const repairSpendLast24mCents = repairLikeEvents.reduce((sum, event) => {
      const amount = asNumber(event.amount);
      if (!amount || amount <= 0) return sum;
      return sum + Math.round(amount * 100);
    }, 0);

    const estimatedNextRepairCostBase = toInt(overrides?.estimatedNextRepairCostCents) ?? defaults.typicalRepairCostCents;
    const avgHistoricalRepairCents = repairsLast24m > 0 ? Math.round(repairSpendLast24mCents / repairsLast24m) : 0;

    let estimatedNextRepairCostCents = Math.max(estimatedNextRepairCostBase, avgHistoricalRepairCents || 0);
    if (repairsLast24m >= 3) estimatedNextRepairCostCents = Math.round(estimatedNextRepairCostCents * 1.25);
    else if (repairsLast24m >= 2) estimatedNextRepairCostCents = Math.round(estimatedNextRepairCostCents * 1.15);

    if (item.condition === 'POOR') estimatedNextRepairCostCents = Math.round(estimatedNextRepairCostCents * 1.2);
    if (item.condition === 'FAIR') estimatedNextRepairCostCents = Math.round(estimatedNextRepairCostCents * 1.08);

    estimatedNextRepairCostCents = clamp(
      estimatedNextRepairCostCents,
      5000,
      Math.max(20000, Math.round(estimatedReplacementCostCents * 0.9))
    );

    const ageRatio = ageYears !== undefined && defaults.lifespanYears > 0 ? ageYears / defaults.lifespanYears : 0.5;

    let failureProb = 0.35;
    if (ageRatio < 0.3) failureProb = 0.15;
    else if (ageRatio < 0.7) failureProb = 0.35;
    else failureProb = 0.6;

    failureProb += conditionAdjustment(item.condition);

    if (repairsLast24m >= 3) failureProb += 0.2;
    else if (repairsLast24m >= 2) failureProb += 0.12;
    else if (repairsLast24m >= 1) failureProb += 0.05;

    const repairSpendRatio =
      estimatedReplacementCostCents > 0 ? repairSpendLast24mCents / estimatedReplacementCostCents : 0;
    if (repairSpendRatio >= 0.3) failureProb += 0.15;
    else if (repairSpendRatio >= 0.2) failureProb += 0.08;

    const riskScore = property.riskReport?.riskScore ?? 60;
    const propertyRiskMultiplier = riskScore < 45 ? 1.18 : riskScore < 60 ? 1.08 : riskScore > 80 ? 0.92 : 1;
    failureProb = clamp(
      failureProb * usageMultiplier(usageIntensity) * toleranceMultiplier(riskTolerance) * propertyRiskMultiplier,
      0.08,
      0.95
    );

    const expectedAnnualRepairRiskCents = Math.round(estimatedNextRepairCostCents * failureProb);

    const annualRepairRiskAfterReplaceCents = Math.round(expectedAnnualRepairRiskCents * 0.35);
    const annualRepairRiskDeltaCents = Math.max(0, expectedAnnualRepairRiskCents - annualRepairRiskAfterReplaceCents);
    const upfrontDeltaCents = Math.max(0, estimatedReplacementCostCents - estimatedNextRepairCostCents);
    const breakEvenMonths =
      annualRepairRiskDeltaCents > 0 && upfrontDeltaCents > 0
        ? Math.max(1, Math.round(upfrontDeltaCents / (annualRepairRiskDeltaCents / 12)))
        : null;

    const repairToReplaceRatio =
      estimatedReplacementCostCents > 0 ? estimatedNextRepairCostCents / estimatedReplacementCostCents : 0;

    const replaceSignalFromHistory = repairLikeEvents.some((event) => {
      const descriptor = `${event.subtype ?? ''} ${event.title ?? ''}`.toUpperCase();
      return descriptor.includes('REPLACE');
    });

    let verdict: ReplaceRepairVerdict = ReplaceRepairVerdict.REPAIR_AND_MONITOR;
    if (
      (remainingYears <= 2 && (repairsLast24m >= 2 || repairToReplaceRatio >= 0.35 || failureProb >= 0.65)) ||
      (replaceSignalFromHistory && remainingYears <= 3)
    ) {
      verdict = ReplaceRepairVerdict.REPLACE_NOW;
    } else if (
      remainingYears <= 4 ||
      failureProb >= 0.58 ||
      (repairsLast24m >= 2 && repairToReplaceRatio >= 0.25)
    ) {
      verdict = ReplaceRepairVerdict.REPLACE_SOON;
    } else if (failureProb >= 0.3 || repairsLast24m >= 1 || repairSpendRatio >= 0.18) {
      verdict = ReplaceRepairVerdict.REPAIR_AND_MONITOR;
    } else {
      verdict = ReplaceRepairVerdict.REPAIR_ONLY;
    }

    const confidenceSignals = [
      ageYears !== undefined,
      estimatedReplacementCostCents > 0,
      estimatedNextRepairCostCents > 0,
      item.condition !== 'UNKNOWN',
      homeEvents.length > 0,
    ].filter(Boolean).length;

    const confidence: ReplaceRepairConfidence =
      confidenceSignals >= 4
        ? ReplaceRepairConfidence.HIGH
        : confidenceSignals >= 3
          ? ReplaceRepairConfidence.MEDIUM
          : ReplaceRepairConfidence.LOW;

    const impactLevel: ReplaceRepairImpactLevel =
      verdict === ReplaceRepairVerdict.REPLACE_NOW || failureProb >= 0.65 || repairToReplaceRatio >= 0.45
        ? ReplaceRepairImpactLevel.HIGH
        : verdict === ReplaceRepairVerdict.REPLACE_SOON || failureProb >= 0.45
          ? ReplaceRepairImpactLevel.MEDIUM
          : ReplaceRepairImpactLevel.LOW;

    const summaryByVerdict: Record<ReplaceRepairVerdict, string> = {
      REPLACE_NOW:
        'Educational estimate indicates replacement now is likely more reliable and cost-effective than repeated repairs.',
      REPLACE_SOON:
        'Educational estimate suggests planning a replacement soon while completing only essential repairs.',
      REPAIR_AND_MONITOR:
        'Educational estimate supports repairing now with close monitoring of recurring issues and costs.',
      REPAIR_ONLY:
        'Educational estimate indicates the item is a good repair candidate and immediate replacement is not necessary.',
    };

    const decisionTrace: DecisionTraceItem[] = [
      {
        label: 'Item profile analyzed',
        detail: `${item.name} (${item.category}) in ${item.condition} condition.`,
        impact: 'NEUTRAL',
      },
      {
        label: 'Age and lifespan baseline',
        detail:
          ageYears !== undefined
            ? `Estimated age ${ageYears} year(s) against default lifespan ${defaults.lifespanYears} year(s).`
            : `Age unavailable; used category default lifespan ${defaults.lifespanYears} year(s).`,
        impact: ageYears !== undefined && remainingYears <= 3 ? 'NEGATIVE' : 'NEUTRAL',
      },
      {
        label: 'Remaining useful life',
        detail: `Estimated remaining years: ${remainingYears}.`,
        impact: remainingYears <= 3 ? 'NEGATIVE' : remainingYears >= 6 ? 'POSITIVE' : 'NEUTRAL',
      },
      {
        label: 'Repair history frequency',
        detail: `${repairsLast24m} repair/maintenance-like event(s) in the lookback window.`,
        impact: repairsLast24m >= 2 ? 'NEGATIVE' : repairsLast24m === 0 ? 'POSITIVE' : 'NEUTRAL',
      },
      {
        label: 'Repair spend pressure',
        detail: `Recent repair spend: ${repairSpendLast24mCents} cents (${(repairSpendRatio * 100).toFixed(0)}% of replacement).`,
        impact: repairSpendRatio >= 0.25 ? 'NEGATIVE' : repairSpendRatio <= 0.1 ? 'POSITIVE' : 'NEUTRAL',
      },
      {
        label: 'Failure probability estimate',
        detail: `Estimated annual failure probability ${(failureProb * 100).toFixed(0)}% after age/condition/usage adjustments.`,
        impact: failureProb >= 0.58 ? 'NEGATIVE' : failureProb <= 0.22 ? 'POSITIVE' : 'NEUTRAL',
      },
      {
        label: 'Next repair estimate',
        detail: `Estimated next repair cost: ${estimatedNextRepairCostCents} cents.`,
        impact: repairToReplaceRatio >= 0.3 ? 'NEGATIVE' : 'NEUTRAL',
      },
      {
        label: 'Replacement estimate',
        detail: `Estimated replacement cost: ${estimatedReplacementCostCents} cents.`,
        impact: estimatedReplacementCostCents <= 90000 ? 'POSITIVE' : 'NEUTRAL',
      },
      {
        label: 'Expected annual repair risk',
        detail: `Expected annual repair risk: ${expectedAnnualRepairRiskCents} cents.`,
        impact: expectedAnnualRepairRiskCents >= Math.round(estimatedReplacementCostCents * 0.3) ? 'NEGATIVE' : 'NEUTRAL',
      },
      {
        label: 'Break-even outlook',
        detail:
          breakEvenMonths !== null
            ? `Estimated break-even: ${breakEvenMonths} month(s) if replacement reduces annual repair risk.`
            : 'Break-even could not be reliably estimated from current assumptions.',
        impact:
          breakEvenMonths !== null ? (breakEvenMonths <= 36 ? 'POSITIVE' : breakEvenMonths <= 72 ? 'NEUTRAL' : 'NEGATIVE') : 'NEUTRAL',
      },
    ];

    const nextSteps: NextStep[] = [];
    if (verdict === ReplaceRepairVerdict.REPLACE_NOW) {
      nextSteps.push({
        title: 'Start replacement planning this quarter',
        detail: 'Prioritize reliability and total ownership cost over another major repair cycle.',
        priority: 'HIGH',
      });
      nextSteps.push({
        title: 'Limit new repair spend unless safety-critical',
        detail: 'Large repairs may have low payback if replacement is imminent.',
        priority: 'HIGH',
      });
    }

    if (verdict === ReplaceRepairVerdict.REPLACE_SOON) {
      nextSteps.push({
        title: 'Run replacement budget scenarios',
        detail: 'Compare replacing in 3-6 months versus extending with one moderate repair.',
        priority: 'MEDIUM',
      });
    }

    if (verdict === ReplaceRepairVerdict.REPAIR_AND_MONITOR || verdict === ReplaceRepairVerdict.REPAIR_ONLY) {
      nextSteps.push({
        title: 'Proceed with a targeted repair',
        detail: 'Address the immediate issue and avoid over-improving near end-of-life components.',
        priority: 'MEDIUM',
      });
      nextSteps.push({
        title: 'Track repair outcomes in Home Timeline',
        detail: 'More event history will improve confidence for the next run.',
        priority: 'LOW',
      });
    }

    if (overrides?.cashBufferCents !== undefined && overrides.cashBufferCents > 0) {
      if (estimatedReplacementCostCents > overrides.cashBufferCents) {
        nextSteps.push({
          title: 'Review cash buffer vs replacement cost',
          detail: 'Current replacement estimate is above available buffer; consider staged planning.',
          priority: 'MEDIUM',
        });
      } else {
        nextSteps.push({
          title: 'Replacement is within current cash buffer',
          detail: 'If reliability is a concern, replacing sooner may reduce disruption risk.',
          priority: 'LOW',
        });
      }
    }

    if (ageYears === undefined) {
      nextSteps.push({
        title: 'Add install or purchase date',
        detail: 'Age is one of the strongest signals for replace/repair confidence.',
        priority: 'MEDIUM',
      });
    }

    const analysis = await prisma.replaceRepairAnalysis.create({
      data: {
        homeownerProfileId: property.homeownerProfileId,
        propertyId,
        inventoryItemId: item.id,
        status: ReplaceRepairAnalysisStatus.READY,
        verdict,
        confidence,
        impactLevel,
        summary: summaryByVerdict[verdict],
        nextSteps: dedupeSteps(nextSteps).slice(0, 6),
        decisionTrace: decisionTrace.slice(0, 12),
        inputsSnapshot: {
          item: {
            itemId: item.id,
            name: item.name,
            category: item.category,
            condition: item.condition,
            installedOn: item.installedOn?.toISOString() ?? null,
            purchasedOn: item.purchasedOn?.toISOString() ?? null,
            lastServicedOn: item.lastServicedOn?.toISOString() ?? null,
          },
          overridesUsed: overrides ?? {},
          assumptions: {
            riskTolerance,
            usageIntensity,
            defaults,
            repairSpendLast24mCents,
            repairsLast24m,
            failureProbability: Number(failureProb.toFixed(4)),
            annualRepairRiskAfterReplaceCents,
            annualRepairRiskDeltaCents,
          },
        },
        ageYears,
        remainingYears,
        estimatedNextRepairCostCents,
        estimatedReplacementCostCents,
        expectedAnnualRepairRiskCents,
        expectedAnnualOwnershipDeltaCents: annualRepairRiskDeltaCents,
        breakEvenMonths,
      },
    });

    return mapAnalysisToDto(analysis);
  }
}

export async function markReplaceRepairStale(propertyId: string, inventoryItemId?: string) {
  if (!inventoryItemId) {
    await prisma.replaceRepairAnalysis.updateMany({
      where: { propertyId, status: ReplaceRepairAnalysisStatus.READY },
      data: { status: ReplaceRepairAnalysisStatus.STALE },
    });
    return;
  }

  const latest = await prisma.replaceRepairAnalysis.findFirst({
    where: {
      propertyId,
      inventoryItemId,
      status: ReplaceRepairAnalysisStatus.READY,
    },
    orderBy: [{ computedAt: 'desc' }, { createdAt: 'desc' }],
    select: { id: true },
  });

  if (!latest) return;

  await prisma.replaceRepairAnalysis.update({
    where: { id: latest.id },
    data: { status: ReplaceRepairAnalysisStatus.STALE },
  });
}
