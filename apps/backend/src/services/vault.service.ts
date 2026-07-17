// apps/backend/src/services/vault.service.ts

import bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { generateVaultShareToken, verifyVaultShareToken } from '../utils/jwt.util';

const MIN_VAULT_PASSWORD_LENGTH = 14;
const VAULT_SHARE_HOURS = 72;

function validateVaultPasswordStrength(plainPassword: string): void {
  if (!plainPassword || plainPassword.length < MIN_VAULT_PASSWORD_LENGTH) {
    throw new APIError(
      `Vault password must be at least ${MIN_VAULT_PASSWORD_LENGTH} characters`,
      400,
      'INVALID_VAULT_PASSWORD'
    );
  }

  if (!/[A-Z]/.test(plainPassword) || !/[a-z]/.test(plainPassword) || !/\d/.test(plainPassword)) {
    throw new APIError(
      'Vault password must include uppercase, lowercase, and a number',
      400,
      'INVALID_VAULT_PASSWORD'
    );
  }
}

function vaultPasswordVersion(vaultPasswordHash: string): string {
  return createHash('sha256').update(vaultPasswordHash).digest('hex');
}

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

async function loadVaultData(propertyId: string): Promise<VaultData> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
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

  if (!property) {
    throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');
  }

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

/**
 * Redaction applied to every password/share-token vault access (Property
 * Context §18: shared surfaces expose a redacted projection).
 *
 * The vault is a deliberate owner-configured emergency-access channel, so the
 * recipient keeps operational facts (address they are standing at, appliance
 * identity, service history). What they never receive: serial numbers (theft
 * and warranty-fraud value) and service pricing (financial detail). The
 * owner's authenticated views are unaffected.
 */
export function redactVaultDataForSharedAccess(data: VaultData): VaultData {
  return {
    ...data,
    verifiedAssets: data.verifiedAssets.map((asset) => ({
      ...asset,
      serialNumber: null,
    })),
    serviceTimeline: data.serviceTimeline.map((entry) => ({
      ...entry,
      finalPrice: null,
    })),
  };
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
  validateVaultPasswordStrength(plainPassword);

  const hash = await bcrypt.hash(plainPassword, 12);

  await prisma.property.update({
    where: { id: propertyId },
    data: { vaultPasswordHash: hash },
  });
}

export async function createVaultShareLink(
  propertyId: string,
  homeownerUserId: string,
  expiresInHours = VAULT_SHARE_HOURS
): Promise<{ accessToken: string; expiresAt: Date }> {
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      homeownerProfile: { userId: homeownerUserId },
    },
    select: {
      id: true,
      vaultPasswordHash: true,
    },
  });

  if (!property) {
    throw new APIError('Property not found or access denied', 404, 'PROPERTY_NOT_FOUND');
  }

  if (!property.vaultPasswordHash) {
    throw new APIError('Set a vault password before creating a share link', 400, 'VAULT_NOT_CONFIGURED');
  }

  const safeHours = Number.isFinite(expiresInHours)
    ? Math.min(Math.max(Math.round(expiresInHours), 1), VAULT_SHARE_HOURS)
    : VAULT_SHARE_HOURS;
  const expiresAt = new Date(Date.now() + safeHours * 60 * 60 * 1000);
  const accessToken = generateVaultShareToken(
    property.id,
    vaultPasswordVersion(property.vaultPasswordHash),
    `${safeHours}h`
  );

  return { accessToken, expiresAt };
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

  return redactVaultDataForSharedAccess(await loadVaultData(propertyId));
}

export async function getVaultDataWithShareToken(
  propertyId: string,
  accessToken: string
): Promise<VaultData> {
  const tokenPayload = verifyVaultShareToken(accessToken);
  if (tokenPayload.propertyId !== propertyId) {
    throw new APIError('Invalid vault share token', 401, 'INVALID_VAULT_SHARE_TOKEN');
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { vaultPasswordHash: true },
  });

  if (!property?.vaultPasswordHash) {
    throw new APIError('Invalid vault share token', 401, 'INVALID_VAULT_SHARE_TOKEN');
  }

  if (vaultPasswordVersion(property.vaultPasswordHash) !== tokenPayload.passwordVersion) {
    throw new APIError('Vault share link has expired', 401, 'EXPIRED_VAULT_SHARE_TOKEN');
  }

  return redactVaultDataForSharedAccess(await loadVaultData(propertyId));
}
