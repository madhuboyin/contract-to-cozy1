// apps/backend/src/services/inventoryVerification.service.ts

import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { applianceOracleService } from './applianceOracle.service';
import { refreshEstimatedMaintenancePremium } from './valueIntelligence.service';
import { incrementStreak, StreakUpdateResult } from './gamification.service';
import { generateForecast } from './maintenancePrediction.service';

const APPLIANCE_LIFESPAN_DATA: Record<string, { avgLife: number; category: string }> = {
  'HVAC': { avgLife: 15, category: 'HVAC' },
  'HVAC Furnace': { avgLife: 15, category: 'HVAC' },
  'HVAC Air Conditioner': { avgLife: 15, category: 'HVAC' },
  'Water Heater': { avgLife: 10, category: 'PLUMBING' },
  'Water Heater (Tank)': { avgLife: 10, category: 'PLUMBING' },
  'Water Heater (Tankless)': { avgLife: 20, category: 'PLUMBING' },
  'Refrigerator': { avgLife: 13, category: 'APPLIANCE' },
  'Dishwasher': { avgLife: 10, category: 'APPLIANCE' },
  'Washer': { avgLife: 11, category: 'APPLIANCE' },
  'Dryer': { avgLife: 13, category: 'APPLIANCE' },
  'Oven': { avgLife: 15, category: 'APPLIANCE' },
  'Range': { avgLife: 15, category: 'APPLIANCE' },
  'Microwave': { avgLife: 9, category: 'APPLIANCE' },
  'Garbage Disposal': { avgLife: 12, category: 'PLUMBING' },
  'Roof': { avgLife: 20, category: 'ROOFING' },
};

// High-priority categories for nudge ordering
const HIGH_VALUE_CATEGORIES = ['HVAC', 'ROOF_EXTERIOR', 'APPLIANCE', 'PLUMBING'];
const CRITICAL_VERIFICATION_CATEGORIES = ['HVAC', 'ROOF_EXTERIOR'];

type VerificationSource = 'OCR_LABEL' | 'MANUAL' | 'AI_ORACLE';

export function calculateExpectedExpiry(
  item: { name: string; category: string; purchasedOn?: Date | null; installedOn?: Date | null },
  homeItemInstalledAt?: Date | null
): Date | null {
  // Look up lifespan by item name first, then by category
  const nameKey = Object.keys(APPLIANCE_LIFESPAN_DATA).find(
    (k) => item.name.toLowerCase().includes(k.toLowerCase())
  );

  const categoryKey = Object.keys(APPLIANCE_LIFESPAN_DATA).find(
    (k) => k.toUpperCase() === item.category
  );

  const lifespanEntry = APPLIANCE_LIFESPAN_DATA[nameKey || ''] || APPLIANCE_LIFESPAN_DATA[categoryKey || ''];
  if (!lifespanEntry) return null;

  // Use purchasedOn, then homeItem installedAt, then item installedOn as base date
  const baseDate = item.purchasedOn || homeItemInstalledAt || (item as any).installedOn;
  if (!baseDate) return null;

  const expiry = new Date(baseDate);
  expiry.setFullYear(expiry.getFullYear() + lifespanEntry.avgLife);
  return expiry;
}

export async function getHighestPriorityUnverifiedItem(propertyId: string) {
  // Get total counts first
  const [totalItems, totalUnverified] = await Promise.all([
    prisma.inventoryItem.count({ where: { propertyId } }),
    prisma.inventoryItem.count({ where: { propertyId, isVerified: false } }),
  ]);

  if (totalUnverified === 0) return null;

  // Priority 1: Items linked to HomeItems with ACTION_NEEDED status
  const actionNeededItem = await prisma.inventoryItem.findFirst({
    where: {
      propertyId,
      isVerified: false,
      homeItems: {
        some: {
          status: {
            computedCondition: 'ACTION_NEEDED',
          },
        },
      },
    },
    include: { room: true, homeAsset: true },
    orderBy: { createdAt: 'asc' },
  });

  if (actionNeededItem) {
    return { item: actionNeededItem, totalUnverified, totalItems };
  }

  // Priority 2: High-value categories (HVAC, APPLIANCE, PLUMBING)
  const highValueItem = await prisma.inventoryItem.findFirst({
    where: {
      propertyId,
      isVerified: false,
      category: { in: HIGH_VALUE_CATEGORIES as any },
    },
    include: { room: true, homeAsset: true },
    orderBy: [
      { purchasedOn: { sort: 'desc', nulls: 'last' } },
      { createdAt: 'asc' },
    ],
  });

  if (highValueItem) {
    return { item: highValueItem, totalUnverified, totalItems };
  }

  // Priority 3: Items with some data (purchasedOn set) but not verified
  const partialDataItem = await prisma.inventoryItem.findFirst({
    where: {
      propertyId,
      isVerified: false,
      purchasedOn: { not: null },
    },
    include: { room: true, homeAsset: true },
    orderBy: { createdAt: 'asc' },
  });

  if (partialDataItem) {
    return { item: partialDataItem, totalUnverified, totalItems };
  }

  // Priority 4: Fallback — oldest unverified item
  const fallbackItem = await prisma.inventoryItem.findFirst({
    where: { propertyId, isVerified: false },
    include: { room: true, homeAsset: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!fallbackItem) return null;

  return { item: fallbackItem, totalUnverified, totalItems };
}

export async function hasPendingCriticalAssetVerification(propertyId: string) {
  const item = await prisma.inventoryItem.findFirst({
    where: {
      propertyId,
      isVerified: false,
      category: { in: CRITICAL_VERIFICATION_CATEGORIES as any },
    },
    select: { id: true },
  });

  return Boolean(item);
}

export async function markItemVerified(
  itemId: string,
  propertyId: string,
  source: VerificationSource,
  technicalSpecs?: Record<string, any>
): Promise<{ item: any; streak: StreakUpdateResult }> {
  const item = await prisma.inventoryItem.findFirst({
    where: { id: itemId, propertyId },
  });

  if (!item) {
    throw new APIError('Inventory item not found', 404, 'ITEM_NOT_FOUND');
  }

  const updated = await prisma.inventoryItem.update({
    where: { id: itemId },
    data: {
      isVerified: true,
      verificationSource: source,
      ...(technicalSpecs ? { technicalSpecs } : {}),
    },
    include: { room: true, homeAsset: true },
  });

  // Fire-and-forget lifespan recalculation
  applianceOracleService.recalculateLifespan(itemId).catch((err) => {
    console.error('[VERIFICATION] Lifespan recalculation failed (non-blocking):', err);
  });

  const streak = await incrementStreak(propertyId);

  generateForecast(propertyId).catch((err) => {
    console.error('[VERIFICATION] Maintenance forecast generation failed (non-blocking):', err);
  });

  if (HIGH_VALUE_CATEGORIES.includes(updated.category as string)) {
    refreshEstimatedMaintenancePremium(propertyId).catch((err) => {
      console.error('[VERIFICATION] Maintenance premium refresh failed (non-blocking):', err);
    });
  }

  return { item: updated, streak };
}

export async function getVerificationStats(propertyId: string) {
  const [total, verified] = await Promise.all([
    prisma.inventoryItem.count({ where: { propertyId } }),
    prisma.inventoryItem.count({ where: { propertyId, isVerified: true } }),
  ]);

  const unverified = total - verified;
  const percentVerified = total > 0 ? Math.round((verified / total) * 100) : 0;

  return { total, verified, unverified, percentVerified };
}
