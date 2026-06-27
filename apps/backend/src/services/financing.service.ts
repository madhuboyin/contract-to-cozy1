// apps/backend/src/services/financing.service.ts
import { prisma } from '../lib/prisma';
import { RateConfigType, FinancingScenarioStatus, FinancingEntryPoint } from '@prisma/client';
import {
  FinancingCalculatorService,
  RateSnapshot,
  FinancingResultSet,
} from './financingCalculator.service';

const STALE_EQUITY_DAYS = 7;
const HELOC_MAX_CLTV = 0.85;
const HELOC_MIN_EQUITY_PCT = 20;

const calculator = new FinancingCalculatorService();

// ─── Rate Config ─────────────────────────────────────────────────────────────

export async function loadRateSnapshot(): Promise<{ rates: RateSnapshot; asOf: string }> {
  const configs = await prisma.financingRateConfig.findMany();
  const byType = Object.fromEntries(configs.map((c) => [c.type, c]));

  const get = (type: RateConfigType, fallback: number) =>
    byType[type]?.valueBps ?? fallback;

  const mostRecent = configs.reduce<Date | null>((acc, c) => {
    const d = c.effectiveDate;
    return !acc || d > acc ? d : acc;
  }, null);

  return {
    rates: {
      helocRateBps: get(RateConfigType.HELOC_RATE, 900),
      helRateBps: get(RateConfigType.HOME_EQUITY_LOAN_RATE, 875),
      personalLoanMinRateBps: get(RateConfigType.PERSONAL_LOAN_RATE_MIN, 1100),
      personalLoanMaxRateBps: get(RateConfigType.PERSONAL_LOAN_RATE_MAX, 2000),
      contractorPromoMonths: get(RateConfigType.CONTRACTOR_PROMO_MONTHS, 12),
      contractorOngoingAprBps: get(RateConfigType.CONTRACTOR_ONGOING_APR, 2699),
      opportunityCostRateBps: get(RateConfigType.OPPORTUNITY_COST_RATE, 600),
    },
    asOf: mostRecent ? mostRecent.toISOString() : new Date().toISOString(),
  };
}

export async function listRateConfigs() {
  return prisma.financingRateConfig.findMany({ orderBy: { type: 'asc' } });
}

export async function updateRateConfig(
  type: RateConfigType,
  patch: { valueBps: number; label?: string; sourceNote?: string; effectiveDate?: string },
) {
  return prisma.financingRateConfig.upsert({
    where: { type },
    create: {
      type,
      valueBps: patch.valueBps,
      label: patch.label ?? type,
      sourceNote: patch.sourceNote,
      effectiveDate: patch.effectiveDate ? new Date(patch.effectiveDate) : new Date(),
    },
    update: {
      valueBps: patch.valueBps,
      ...(patch.label && { label: patch.label }),
      ...(patch.sourceNote !== undefined && { sourceNote: patch.sourceNote }),
      effectiveDate: patch.effectiveDate ? new Date(patch.effectiveDate) : new Date(),
    },
  });
}

// ─── Financing Profile ────────────────────────────────────────────────────────

export async function getProfile(propertyId: string) {
  return prisma.propertyFinancingProfile.findUnique({ where: { propertyId } });
}

export async function upsertProfile(
  propertyId: string,
  payload: {
    purchasePriceCents?: number;
    purchaseDate?: string;
    mortgageType?: string;
    originalMortgageBalanceCents?: number;
    currentMortgageBalanceCents?: number;
    mortgageBalanceAsOfDate?: string;
    interestRateBps?: number;
    monthlyPaymentCents?: number;
    hasSecondMortgage?: boolean;
    secondMortgageBalanceCents?: number;
    hasPMI?: boolean;
  },
) {
  const data: any = {
    ...(payload.purchasePriceCents !== undefined && { purchasePriceCents: payload.purchasePriceCents }),
    ...(payload.purchaseDate && { purchaseDate: new Date(payload.purchaseDate) }),
    ...(payload.mortgageType && { mortgageType: payload.mortgageType }),
    ...(payload.originalMortgageBalanceCents !== undefined && {
      originalMortgageBalanceCents: payload.originalMortgageBalanceCents,
    }),
    ...(payload.currentMortgageBalanceCents !== undefined && {
      currentMortgageBalanceCents: payload.currentMortgageBalanceCents,
    }),
    ...(payload.mortgageBalanceAsOfDate && {
      mortgageBalanceAsOfDate: new Date(payload.mortgageBalanceAsOfDate),
    }),
    ...(payload.interestRateBps !== undefined && { interestRateBps: payload.interestRateBps }),
    ...(payload.monthlyPaymentCents !== undefined && { monthlyPaymentCents: payload.monthlyPaymentCents }),
    ...(payload.hasSecondMortgage !== undefined && { hasSecondMortgage: payload.hasSecondMortgage }),
    ...(payload.secondMortgageBalanceCents !== undefined && {
      secondMortgageBalanceCents: payload.secondMortgageBalanceCents,
    }),
    ...(payload.hasPMI !== undefined && { hasPMI: payload.hasPMI }),
  };

  return prisma.propertyFinancingProfile.upsert({
    where: { propertyId },
    create: { propertyId, ...data },
    update: data,
  });
}

// ─── Equity Position ──────────────────────────────────────────────────────────

async function computeEquity(propertyId: string) {
  const profile = await prisma.propertyFinancingProfile.findUnique({ where: { propertyId } });

  // Get best available property value estimate
  let estimatedValueCents = 0;
  let estimatedValueSource: 'APPRECIATION_TRACKER' | 'PURCHASE_PRICE' | 'USER_ENTERED' = 'PURCHASE_PRICE';

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { purchasePriceCents: true, lastAppraisedValue: true },
  });

  if (property?.lastAppraisedValue) {
    // lastAppraisedValue on Property is in dollars (existing field) — convert to cents
    estimatedValueCents = property.lastAppraisedValue * 100;
    estimatedValueSource = 'APPRECIATION_TRACKER';
  } else if (profile?.purchasePriceCents) {
    estimatedValueCents = profile.purchasePriceCents;
    estimatedValueSource = 'PURCHASE_PRICE';
  } else if (property?.purchasePriceCents) {
    estimatedValueCents = property.purchasePriceCents;
    estimatedValueSource = 'PURCHASE_PRICE';
  }

  const mortgageBalance = profile?.currentMortgageBalanceCents ?? 0;
  const secondMortgageBalance =
    profile?.hasSecondMortgage && profile.secondMortgageBalanceCents
      ? profile.secondMortgageBalanceCents
      : 0;
  const totalLiabilityCents = mortgageBalance + secondMortgageBalance;
  const equityCents = Math.max(0, estimatedValueCents - totalLiabilityCents);

  const equityPercent =
    estimatedValueCents > 0
      ? parseFloat(((equityCents / estimatedValueCents) * 100).toFixed(2))
      : 0;
  const ltvPercent =
    estimatedValueCents > 0
      ? parseFloat(((totalLiabilityCents / estimatedValueCents) * 100).toFixed(2))
      : 0;
  const helocCapacityCents = Math.max(
    0,
    Math.floor(estimatedValueCents * HELOC_MAX_CLTV) - totalLiabilityCents,
  );
  const helocEligible = ltvPercent <= 85 && equityPercent >= HELOC_MIN_EQUITY_PCT;

  return prisma.equityPosition.create({
    data: {
      propertyId,
      estimatedValueCents,
      estimatedValueSource,
      mortgageBalanceCents: mortgageBalance,
      secondMortgageBalanceCents: secondMortgageBalance,
      equityCents,
      equityPercent,
      ltvPercent,
      helocCapacityCents,
      helocEligible,
    },
  });
}

export async function getLatestEquity(propertyId: string) {
  const latest = await prisma.equityPosition.findFirst({
    where: { propertyId },
    orderBy: { computedAt: 'desc' },
  });

  if (!latest) return computeEquity(propertyId);

  const ageMs = Date.now() - latest.computedAt.getTime();
  if (ageMs > STALE_EQUITY_DAYS * 24 * 60 * 60 * 1000) return computeEquity(propertyId);

  return latest;
}

export async function refreshEquity(propertyId: string) {
  return computeEquity(propertyId);
}

export async function getEquityHistory(propertyId: string) {
  return prisma.equityPosition.findMany({
    where: { propertyId },
    orderBy: { computedAt: 'desc' },
  });
}

// ─── Calculator (stateless) ───────────────────────────────────────────────────

export async function calculate(
  propertyId: string,
  projectCostCents: number,
): Promise<FinancingResultSet> {
  const [{ rates, asOf }, equity] = await Promise.all([
    loadRateSnapshot(),
    getLatestEquity(propertyId).catch(() => null),
  ]);

  return calculator.computeAll(
    projectCostCents,
    rates,
    equity
      ? {
          helocEligible: equity.helocEligible,
          helocCapacityCents: Number(equity.helocCapacityCents),
        }
      : null,
    asOf,
  );
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

export async function listScenarios(
  propertyId: string,
  params?: { status?: FinancingScenarioStatus },
) {
  return prisma.financingScenario.findMany({
    where: {
      propertyId,
      status: params?.status ?? { in: [FinancingScenarioStatus.SAVED, FinancingScenarioStatus.DRAFT] },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      projectCostCents: true,
      status: true,
      entryPoint: true,
      selectedOption: true,
      createdAt: true,
    },
  });
}

export async function createScenario(
  propertyId: string,
  userId: string,
  payload: {
    title: string;
    projectDescription?: string;
    projectCostCents: number;
    entryPoint: FinancingEntryPoint;
    sourceEntityType?: string;
    sourceEntityId?: string;
    notes?: string;
  },
) {
  const [{ rates, asOf }, equity] = await Promise.all([
    loadRateSnapshot(),
    getLatestEquity(propertyId).catch(() => null),
  ]);

  const equityShape = equity
    ? { helocEligible: equity.helocEligible, helocCapacityCents: Number(equity.helocCapacityCents) }
    : null;

  const results = calculator.computeAll(payload.projectCostCents, rates, equityShape, asOf);

  return prisma.financingScenario.create({
    data: {
      propertyId,
      userId,
      title: payload.title,
      projectDescription: payload.projectDescription,
      projectCostCents: payload.projectCostCents,
      entryPoint: payload.entryPoint,
      sourceEntityType: payload.sourceEntityType,
      sourceEntityId: payload.sourceEntityId,
      notes: payload.notes,
      equitySnapshotCents: equity ? Number(equity.equityCents) : null,
      helocCapacitySnapshotCents: equity ? Number(equity.helocCapacityCents) : null,
      rateSnapshotJson: rates as any,
      resultsJson: results as any,
      status: FinancingScenarioStatus.SAVED,
    },
  });
}

export async function getScenario(scenarioId: string, propertyId: string) {
  return prisma.financingScenario.findFirst({ where: { id: scenarioId, propertyId } });
}

export async function updateScenario(
  scenarioId: string,
  propertyId: string,
  patch: {
    title?: string;
    notes?: string;
    selectedOption?: string;
    status?: FinancingScenarioStatus;
  },
) {
  return prisma.financingScenario.updateMany({
    where: { id: scenarioId, propertyId },
    data: {
      ...(patch.title && { title: patch.title }),
      ...(patch.notes !== undefined && { notes: patch.notes }),
      ...(patch.selectedOption && { selectedOption: patch.selectedOption as any }),
      ...(patch.status && { status: patch.status }),
    },
  });
}

export async function archiveScenario(scenarioId: string, propertyId: string) {
  return prisma.financingScenario.updateMany({
    where: { id: scenarioId, propertyId },
    data: { status: FinancingScenarioStatus.ARCHIVED },
  });
}
