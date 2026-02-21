// apps/backend/src/services/valueIntelligence.service.ts

import { prisma } from '../lib/prisma';

const MAINTENANCE_PREMIUM_RATE = 0.08; // 8% conservative uplift from documented care
const RESALE_ADVANTAGE_HEALTH_BASELINE = 80;

export type HomeEquityResult = {
  propertyId: string;
  isEquityVerified: boolean;
  purchasePriceCents: number | null;
  purchaseDate: Date | null;
  lastAppraisedValueCents: number;
  appreciationCents: number;
  baseEquityCents: number;
  maintenanceSpendCents: number;
  maintenancePremiumRate: number;
  bonusMultiplier: number;
  maintenancePremiumCents: number;
  totalEquityWithMaintenanceCents: number;
  healthScore: number | null;
  resaleAdvantageBaseline: number;
  hasResaleAdvantage: boolean;
};

function dollarsDecimalToCents(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function hasResaleAdvantageFromHealthScore(
  healthScore: number | null | undefined,
  baseline: number = RESALE_ADVANTAGE_HEALTH_BASELINE
) {
  return typeof healthScore === 'number' && Number.isFinite(healthScore) && healthScore > baseline;
}

async function getMaintenanceSpendCents(propertyId: string): Promise<number> {
  const [inventoryAggregate, completedTaskAggregate] = await Promise.all([
    prisma.inventoryItem.aggregate({
      where: {
        propertyId,
        isVerified: true,
        purchaseCostCents: { not: null },
      },
      _sum: {
        purchaseCostCents: true,
      },
    }),
    prisma.propertyMaintenanceTask.aggregate({
      where: {
        propertyId,
        status: 'COMPLETED',
        actualCost: { not: null },
      },
      _sum: {
        actualCost: true,
      },
    }),
  ]);

  const verifiedInventorySpendCents = inventoryAggregate._sum.purchaseCostCents ?? 0;
  const verifiedMaintenanceSpendCents = dollarsDecimalToCents(completedTaskAggregate._sum.actualCost);

  return verifiedInventorySpendCents + verifiedMaintenanceSpendCents;
}

function maintenanceSpendToPremiumCents(maintenanceSpendCents: number) {
  return Math.round(maintenanceSpendCents * MAINTENANCE_PREMIUM_RATE);
}

function applyBonusMultiplier(basePremiumCents: number, bonusMultiplier: number) {
  return Math.round(basePremiumCents * bonusMultiplier);
}

export async function refreshEstimatedMaintenancePremium(propertyId: string): Promise<number> {
  const [maintenanceSpendCents, property] = await Promise.all([
    getMaintenanceSpendCents(propertyId),
    prisma.property.findUnique({
      where: { id: propertyId },
      select: { bonusMultiplier: true },
    }),
  ]);
  const basePremiumCents = maintenanceSpendToPremiumCents(maintenanceSpendCents);
  const maintenancePremiumCents = applyBonusMultiplier(
    basePremiumCents,
    property?.bonusMultiplier ?? 1.0
  );

  await prisma.property.update({
    where: { id: propertyId },
    data: { estimatedMaintenancePremiumCents: maintenancePremiumCents },
    select: { id: true },
  });

  return maintenancePremiumCents;
}

export async function calculateHomeEquity(propertyId: string): Promise<HomeEquityResult> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      purchasePriceCents: true,
      purchaseDate: true,
      lastAppraisedValue: true,
      isEquityVerified: true,
      bonusMultiplier: true,
    },
  });

  if (!property) {
    throw new Error('Property not found');
  }

  const [maintenanceSpendCents, latestHealthSnapshot] = await Promise.all([
    getMaintenanceSpendCents(propertyId),
    prisma.propertyScoreSnapshot.findFirst({
      where: {
        propertyId,
        scoreType: 'HEALTH',
      },
      orderBy: [{ weekStart: 'desc' }, { createdAt: 'desc' }],
      select: { score: true },
    }),
  ]);

  const baseMaintenancePremiumCents = maintenanceSpendToPremiumCents(maintenanceSpendCents);
  const maintenancePremiumCents = applyBonusMultiplier(
    baseMaintenancePremiumCents,
    property.bonusMultiplier
  );
  const lastAppraisedValueCents = property.lastAppraisedValue ?? 0;
  const purchasePriceCents = property.purchasePriceCents ?? null;
  const appreciationCents =
    purchasePriceCents !== null ? lastAppraisedValueCents - purchasePriceCents : 0;
  const baseEquityCents = appreciationCents;
  const totalEquityWithMaintenanceCents = baseEquityCents + maintenancePremiumCents;
  const healthScore = latestHealthSnapshot?.score ?? null;
  const hasResaleAdvantage = hasResaleAdvantageFromHealthScore(healthScore);

  await prisma.property.update({
    where: { id: propertyId },
    data: { estimatedMaintenancePremiumCents: maintenancePremiumCents },
    select: { id: true },
  });

  return {
    propertyId,
    isEquityVerified: property.isEquityVerified,
    purchasePriceCents: property.purchasePriceCents,
    purchaseDate: property.purchaseDate,
    lastAppraisedValueCents,
    appreciationCents,
    baseEquityCents,
    maintenanceSpendCents,
    maintenancePremiumRate: MAINTENANCE_PREMIUM_RATE,
    bonusMultiplier: property.bonusMultiplier,
    maintenancePremiumCents,
    totalEquityWithMaintenanceCents,
    healthScore,
    resaleAdvantageBaseline: RESALE_ADVANTAGE_HEALTH_BASELINE,
    hasResaleAdvantage,
  };
}
