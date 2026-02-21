// apps/backend/src/services/discovery.service.ts

import { InventoryItemCategory, SignalType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { calculateProtectionGap } from './insuranceAuditor.service';
import { evaluateStreakExpiry, PropertyStreakState } from './gamification.service';
import { weatherService } from './weather.service';
export { mapInventoryToServiceCategory } from '../utils/inventoryServiceCategory.util';

const WATER_HEATER_HINTS = ['water heater', 'hot water'];

export type DiscoveryNudge =
  | ({
      id: string;
      title: string;
      description: string;
      currentStreak: number;
      longestStreak: number;
      bonusMultiplier: number;
      actionType: 'PHOTO';
      type: 'ASSET';
      item: {
        id: string;
        name: string;
        category: string;
        condition: string;
        manufacturer: string | null;
        modelNumber: string | null;
        serialNumber: string | null;
        purchasedOn: Date | null;
        installedOn: Date | null;
        isVerified: boolean;
        room: { id: string; name: string } | null;
        homeAsset: { id: string } | null;
      };
      totalUnverified: number;
      totalItems: number;
    })
  | ({
      id: string;
      title: string;
      description: string;
      currentStreak: number;
      longestStreak: number;
      bonusMultiplier: number;
      actionType: 'TOGGLE';
      type: 'RESILIENCE';
      field: 'hasSumpPumpBackup';
      options: Array<{ label: string; value: boolean | null }>;
    })
  | ({
      id: string;
      title: string;
      description: string;
      currentStreak: number;
      longestStreak: number;
      bonusMultiplier: number;
      actionType: 'PHOTO';
      type: 'INSURANCE';
      policyId: string;
      totalInventoryValueCents: number;
      personalPropertyLimitCents: number;
      underInsuredCents: number;
    })
  | ({
      id: string;
      title: string;
      description: string;
      currentStreak: number;
      longestStreak: number;
      bonusMultiplier: number;
      actionType: 'INPUT';
      type: 'EQUITY';
      purchasePriceCents: number | null;
      purchaseDate: Date | null;
      lastAppraisedValueCents: number;
    })
  | ({
      id: string;
      title: string;
      description: string;
      currentStreak: number;
      longestStreak: number;
      bonusMultiplier: number;
      actionType: 'INPUT';
      type: 'UTILITY';
      field: 'primaryHeatingFuel';
      options: Array<{ label: string; value: string }>;
    });

function isExcluded(id: string, excludedIds: Set<string>) {
  return excludedIds.has(id);
}

function logSnoozed(propertyId: string, nudgeId: string, nudgeType: DiscoveryNudge['type']) {
  console.info(
    `[DISCOVERY] Snoozed nudge skipped: propertyId=${propertyId} id=${nudgeId} type=${nudgeType}`
  );
}

function logServed(propertyId: string, nudge: DiscoveryNudge) {
  console.info(
    `[DISCOVERY] Nudge served: propertyId=${propertyId} id=${nudge.id} type=${nudge.type}`
  );
}

function logNone(propertyId: string) {
  console.info(`[DISCOVERY] No nudge available: propertyId=${propertyId}`);
}

function assetNudgeId(itemId: string) {
  return `asset:${itemId}`;
}

function resilienceNudgeId(propertyId: string) {
  return `property:${propertyId}:resilience`;
}

function insuranceNudgeId(policyId: string) {
  return `insurance:${policyId}`;
}

function equityNudgeId(propertyId: string) {
  return `property:${propertyId}:equity`;
}

function utilityNudgeId(propertyId: string) {
  return `property:${propertyId}:utility`;
}

function withStreakEncouragement(description: string, streak: number) {
  if (streak <= 0) return description;
  return `${description} Complete this to keep your ${streak}-day streak alive!`;
}

function buildWaterHeaterNameFilter() {
  return WATER_HEATER_HINTS.map((hint) => ({
    name: { contains: hint, mode: 'insensitive' as const },
  }));
}

async function getCriticalAssetNudge(
  propertyId: string,
  excludedIds: Set<string>,
  streak: PropertyStreakState
): Promise<DiscoveryNudge | null> {
  const [totalItems, totalUnverified, candidates] = await Promise.all([
    prisma.inventoryItem.count({ where: { propertyId } }),
    prisma.inventoryItem.count({ where: { propertyId, isVerified: false } }),
    prisma.inventoryItem.findMany({
      where: {
        propertyId,
        isVerified: false,
        OR: [
          { category: InventoryItemCategory.HVAC },
          { category: InventoryItemCategory.ROOF_EXTERIOR },
          {
            AND: [
              { category: InventoryItemCategory.PLUMBING },
              { OR: buildWaterHeaterNameFilter() },
            ],
          },
        ],
      },
      include: { room: true, homeAsset: true },
      orderBy: [{ createdAt: 'asc' }],
      take: 25,
    }),
  ]);

  for (const item of candidates) {
    const nudgeId = assetNudgeId(item.id);
    if (isExcluded(nudgeId, excludedIds)) {
      logSnoozed(propertyId, nudgeId, 'ASSET');
      continue;
    }

    return {
      id: nudgeId,
      type: 'ASSET',
      title: `Verify ${item.name}`,
      description: withStreakEncouragement(
        'Capture key details to unlock accurate lifespan predictions and proactive maintenance alerts.',
        streak.currentStreak
      ),
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      bonusMultiplier: streak.bonusMultiplier,
      actionType: 'PHOTO',
      item: {
        id: item.id,
        name: item.name,
        category: item.category,
        condition: item.condition,
        manufacturer: item.manufacturer,
        modelNumber: item.modelNumber,
        serialNumber: item.serialNumber,
        purchasedOn: item.purchasedOn,
        installedOn: item.installedOn,
        isVerified: item.isVerified,
        room: item.room ? { id: item.room.id, name: item.room.name } : null,
        homeAsset: item.homeAsset ? { id: item.homeAsset.id } : null,
      },
      totalUnverified,
      totalItems,
    };
  }

  return null;
}

async function getResilienceNudge(
  propertyId: string,
  excludedIds: Set<string>,
  streak: PropertyStreakState
): Promise<DiscoveryNudge | null> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { hasSumpPumpBackup: true, zipCode: true },
  });

  if (!property || property.hasSumpPumpBackup !== null) return null;

  const id = resilienceNudgeId(propertyId);
  if (isExcluded(id, excludedIds)) {
    logSnoozed(propertyId, id, 'RESILIENCE');
    return null;
  }

  // Gate on live weather: only surface the sump-pump nudge when heavy rain
  // is actually forecast. Falls back gracefully if weather fetch fails.
  const zipCode = property.zipCode?.trim();
  if (!zipCode) {
    console.info(
      `[DISCOVERY] Resilience nudge suppressed — missing zip code for propertyId=${propertyId}`
    );
    return null;
  }

  let cityName: string | null = null;
  const meta = await weatherService
    .getLocalForecastMeta(zipCode)
    .catch(() => ({ signals: [] as SignalType[], cityName: null }));
  if (!meta.signals.includes(SignalType.WEATHER_FORECAST_HEAVY_RAIN)) {
    console.info(
      `[DISCOVERY] Resilience nudge suppressed — no WEATHER_FORECAST_HEAVY_RAIN for zip=${zipCode}`
    );
    return null;
  }
  cityName = meta.cityName;

  const rainLocation = cityName ? ` in ${cityName}` : '';

  return {
    id,
    type: 'RESILIENCE',
    title: 'Home resilience check',
    description: withStreakEncouragement(
      `Heavy rain predicted${rainLocation}. Do you have a battery backup for your sump pump? This unlocks better flood risk guidance.`,
      streak.currentStreak
    ),
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    bonusMultiplier: streak.bonusMultiplier,
    actionType: 'TOGGLE',
    field: 'hasSumpPumpBackup',
    options: [
      { label: 'Yes', value: true },
      { label: 'No', value: false },
      { label: 'Not Sure', value: null },
    ],
  };
}

async function getInsuranceNudge(
  propertyId: string,
  excludedIds: Set<string>,
  streak: PropertyStreakState
): Promise<DiscoveryNudge | null> {
  const policy = await prisma.insurancePolicy.findFirst({
    where: {
      propertyId,
      isVerified: false,
    },
    orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    select: { id: true },
  });

  if (!policy) return null;

  const id = insuranceNudgeId(policy.id);
  if (isExcluded(id, excludedIds)) {
    logSnoozed(propertyId, id, 'INSURANCE');
    return null;
  }

  const protectionGap = await calculateProtectionGap(propertyId);

  return {
    id,
    type: 'INSURANCE',
    title: 'Insurance declarations check',
    description: withStreakEncouragement(
      'Snap your declarations page to verify personal property coverage and unlock protection gap insights.',
      streak.currentStreak
    ),
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    bonusMultiplier: streak.bonusMultiplier,
    actionType: 'PHOTO',
    policyId: policy.id,
    totalInventoryValueCents: protectionGap.totalInventoryValueCents,
    personalPropertyLimitCents: protectionGap.personalPropertyLimitCents,
    underInsuredCents: protectionGap.underInsuredCents,
  };
}

async function getEquityNudge(
  propertyId: string,
  excludedIds: Set<string>,
  streak: PropertyStreakState
): Promise<DiscoveryNudge | null> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      isEquityVerified: true,
      purchasePriceCents: true,
      purchaseDate: true,
      lastAppraisedValue: true,
    },
  });

  if (!property) return null;

  const isMissingPurchasePrice = property.purchasePriceCents === null;
  const isMissingPurchaseDate = property.purchaseDate === null;
  const isMissingEquityCore = isMissingPurchasePrice || isMissingPurchaseDate;

  if (property.isEquityVerified && !isMissingEquityCore) {
    return null;
  }

  const id = equityNudgeId(propertyId);
  if (isExcluded(id, excludedIds)) {
    logSnoozed(propertyId, id, 'EQUITY');
    return null;
  }

  let title = 'Track your home equity';
  if (isMissingPurchasePrice && isMissingPurchaseDate) {
    title = 'Add purchase baseline';
  } else if (isMissingPurchasePrice) {
    title = 'Add purchase price';
  } else if (isMissingPurchaseDate) {
    title = 'Add purchase date';
  }

  let description =
    'Enter purchase details to unlock equity tracking and maintenance premium intelligence.';
  if (isMissingPurchasePrice && isMissingPurchaseDate) {
    description =
      'Add purchase price and purchase date to unlock accurate equity and appreciation insights.';
  } else if (isMissingPurchasePrice) {
    description =
      'Add your purchase price to unlock accurate equity and appreciation insights.';
  } else if (isMissingPurchaseDate) {
    description =
      'Add your purchase date to unlock accurate appreciation and equity timeline insights.';
  }

  return {
    id,
    type: 'EQUITY',
    title,
    description: withStreakEncouragement(
      description,
      streak.currentStreak
    ),
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    bonusMultiplier: streak.bonusMultiplier,
    actionType: 'INPUT',
    purchasePriceCents: property.purchasePriceCents,
    purchaseDate: property.purchaseDate,
    lastAppraisedValueCents: property.lastAppraisedValue ?? 0,
  };
}

async function getUtilityNudge(
  propertyId: string,
  excludedIds: Set<string>,
  streak: PropertyStreakState
): Promise<DiscoveryNudge | null> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { primaryHeatingFuel: true },
  });

  const normalizedFuel = String(property?.primaryHeatingFuel || '').trim();
  if (!property || normalizedFuel.length > 0) return null;

  const id = utilityNudgeId(propertyId);
  if (isExcluded(id, excludedIds)) {
    logSnoozed(propertyId, id, 'UTILITY');
    return null;
  }

  return {
    id,
    type: 'UTILITY',
    title: 'Utility setup',
    description: withStreakEncouragement(
      'Set your primary heating fuel to improve risk modeling and cost guidance quality.',
      streak.currentStreak
    ),
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    bonusMultiplier: streak.bonusMultiplier,
    actionType: 'INPUT',
    field: 'primaryHeatingFuel',
    options: [
      { label: 'Natural Gas', value: 'NATURAL_GAS' },
      { label: 'Electric', value: 'ELECTRIC' },
      { label: 'Propane', value: 'PROPANE' },
      { label: 'Fuel Oil', value: 'FUEL_OIL' },
      { label: 'Wood / Pellet', value: 'WOOD_PELLET' },
      { label: 'Other', value: 'OTHER' },
    ],
  };
}

export async function getNextDiscoveryNudge(
  propertyId: string,
  excludedIds: string[] = []
): Promise<DiscoveryNudge | null> {
  const streak = await evaluateStreakExpiry(propertyId);
  const excludedSet = new Set(
    excludedIds
      .map((id) => id.trim())
      .filter(Boolean)
  );

  const nudge =
    (await getResilienceNudge(propertyId, excludedSet, streak)) ??
    (await getCriticalAssetNudge(propertyId, excludedSet, streak)) ??
    (await getInsuranceNudge(propertyId, excludedSet, streak)) ??
    (await getEquityNudge(propertyId, excludedSet, streak)) ??
    (await getUtilityNudge(propertyId, excludedSet, streak));

  if (!nudge) {
    logNone(propertyId);
    return null;
  }

  logServed(propertyId, nudge);
  return nudge;
}
