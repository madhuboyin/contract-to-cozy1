// apps/backend/src/services/vault.service.ts

import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';

// ─────────────────────────────────────────────────────────────────────────────
// Output shape
// ─────────────────────────────────────────────────────────────────────────────

export interface VaultAsset {
  id: string;
  name: string;
  category: string;
  manufacturer: string | null;
  modelNumber: string | null;
  serialNumber: string | null;
  installedOn: Date | null;
  purchasedOn: Date | null;
  condition: string;
  expectedExpiryDate: Date | null;
}

export interface VaultServiceEntry {
  id: string;
  category: string;
  description: string;
  completedAt: Date | null;
  finalPrice: string | null;
  providerBusinessName: string | null;
}

export interface VaultData {
  overview: {
    address: string;
    city: string;
    state: string;
    zipCode: string;
    name: string | null;
    yearBuilt: number | null;
    propertySize: number | null;
    /** Computed: min(100, baseHealthScore × bonusMultiplier) */
    healthScore: number;
  };
  gamification: {
    currentStreak: number;
    longestStreak: number;
    bonusMultiplier: number;
    /** String array, e.g. ["HVAC_HERO", "ROOF_GUARDIAN"] */
    unlockedBadges: string[];
  };
  verifiedAssets: VaultAsset[];
  serviceTimeline: VaultServiceEntry[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns whether a vault password has been configured for the given property.
 * Used by the homeowner's dashboard to know whether to show the "set password" form.
 */
export async function getVaultStatus(propertyId: string): Promise<{ isConfigured: boolean }> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { vaultPasswordHash: true },
  });

  if (!property) {
    throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');
  }

  return { isConfigured: property.vaultPasswordHash !== null };
}

/**
 * Sets (or replaces) the vault password for a property.
 * Caller must be authenticated and own the property (enforced at the route layer).
 */
export async function setVaultPassword(propertyId: string, plainPassword: string): Promise<void> {
  if (!plainPassword || plainPassword.length < 8) {
    throw new APIError(
      'Vault password must be at least 8 characters',
      400,
      'INVALID_VAULT_PASSWORD'
    );
  }

  const hash = await bcrypt.hash(plainPassword, 12);

  await prisma.property.update({
    where: { id: propertyId },
    data: { vaultPasswordHash: hash },
  });
}

/**
 * Verifies the supplied password and returns vault data on success.
 * Uses bcrypt.compare — timing-safe by design.
 * Intentionally generic error messages to prevent property/password enumeration.
 */
export async function getVaultData(propertyId: string, password: string): Promise<VaultData> {
  // 1. Fetch property — includes hash for comparison
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      vaultPasswordHash: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      name: true,
      yearBuilt: true,
      propertySize: true,
      baseHealthScore: true,
      bonusMultiplier: true,
      currentStreak: true,
      longestStreak: true,
      unlockedBadges: true,
    },
  });

  // Return identical error for "not found" and "not configured" to prevent enumeration
  if (!property || property.vaultPasswordHash === null) {
    throw new APIError('Invalid vault password', 401, 'INVALID_VAULT_PASSWORD');
  }

  // 2. Timing-safe password check
  const isValid = await bcrypt.compare(password, property.vaultPasswordHash);
  if (!isValid) {
    throw new APIError('Invalid vault password', 401, 'INVALID_VAULT_PASSWORD');
  }

  // 3. Verified assets + service timeline in parallel
  const [verifiedAssets, completedBookings] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { propertyId, isVerified: true },
      select: {
        id: true,
        name: true,
        category: true,
        manufacturer: true,
        modelNumber: true,
        serialNumber: true,
        installedOn: true,
        purchasedOn: true,
        condition: true,
        expectedExpiryDate: true,
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    }),

    prisma.booking.findMany({
      where: { propertyId, status: 'COMPLETED' },
      select: {
        id: true,
        category: true,
        description: true,
        completedAt: true,
        finalPrice: true,
        providerProfile: {
          select: { businessName: true },
        },
      },
      orderBy: { completedAt: 'desc' },
      take: 50,
    }),
  ]);

  // 4. Compute effective health score
  const effectiveHealthScore = Math.min(
    100,
    Math.round(property.baseHealthScore * property.bonusMultiplier)
  );

  return {
    overview: {
      address: property.address,
      city: property.city,
      state: property.state,
      zipCode: property.zipCode,
      name: property.name,
      yearBuilt: property.yearBuilt,
      propertySize: property.propertySize,
      healthScore: effectiveHealthScore,
    },
    gamification: {
      currentStreak: property.currentStreak,
      longestStreak: property.longestStreak,
      bonusMultiplier: property.bonusMultiplier,
      unlockedBadges: property.unlockedBadges,
    },
    verifiedAssets: verifiedAssets.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category as string,
      manufacturer: item.manufacturer,
      modelNumber: item.modelNumber,
      serialNumber: item.serialNumber,
      installedOn: item.installedOn,
      purchasedOn: item.purchasedOn,
      condition: item.condition as string,
      expectedExpiryDate: item.expectedExpiryDate,
    })),
    serviceTimeline: completedBookings.map((b) => ({
      id: b.id,
      category: b.category as string,
      description: b.description,
      completedAt: b.completedAt,
      finalPrice: b.finalPrice ? b.finalPrice.toString() : null,
      providerBusinessName: b.providerProfile?.businessName ?? null,
    })),
  };
}
