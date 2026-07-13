// apps/backend/src/modules/personalization/infrastructure/traitSnapshotRepository.ts
//
// Prisma-backed repository for the Phase 1 property-trait snapshot pipeline
// (see docs/personalization/adr-0002-phase1-foundation-migration-steps-1-3.md).
import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { HomeAssetFact } from '../domain/traits';

export interface PropertyTraitFacts {
  hasSmokeDetectors: boolean | null;
  roofReplacementYear: number | null;
  homeAssets: HomeAssetFact[];
}

export async function loadPropertyTraitFacts(propertyId: string): Promise<PropertyTraitFacts | null> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      hasSmokeDetectors: true,
      roofReplacementYear: true,
      homeAssets: { select: { assetType: true, lastServiced: true } },
    },
  });
  if (!property) return null;

  return {
    hasSmokeDetectors: property.hasSmokeDetectors,
    roofReplacementYear: property.roofReplacementYear,
    homeAssets: property.homeAssets,
  };
}

/** Most recent still-effective HouseholdProperty link, if any — supplementary context, not required for property traits. */
export async function loadHouseholdIdForProperty(propertyId: string): Promise<string | null> {
  const link = await prisma.householdProperty.findFirst({
    where: { propertyId, effectiveTo: null },
    select: { householdId: true },
    orderBy: { effectiveFrom: 'desc' },
  });
  return link?.householdId ?? null;
}

export interface DerivedTraitInput {
  traitKey: string;
  known: boolean;
  value?: unknown;
}

/**
 * Upserts one DerivedTrait row per known trait. Traits with known=false have
 * any existing row deleted (not just skipped) — a DerivedTrait row's
 * existence represents "this is currently known," so an UNKNOWN trait is
 * represented by the absence of a row. A trait can flip from known to
 * unknown between computations (e.g. HVAC service history removed), and
 * without the delete, that stale known-value row would persist forever.
 */
export async function persistDerivedTraits(
  propertyId: string,
  householdId: string | null,
  traits: DerivedTraitInput[],
): Promise<void> {
  for (const trait of traits) {
    if (!trait.known) {
      await prisma.derivedTrait.deleteMany({ where: { propertyId, traitKey: trait.traitKey } });
      continue;
    }

    await prisma.derivedTrait.upsert({
      where: { propertyId_traitKey: { propertyId, traitKey: trait.traitKey } },
      create: {
        propertyId,
        householdId,
        traitKey: trait.traitKey,
        valueJson: trait.value as Prisma.InputJsonValue,
        source: 'DERIVED',
      },
      update: {
        householdId,
        valueJson: trait.value as Prisma.InputJsonValue,
        computedAt: new Date(),
      },
    });
  }
}

/**
 * Skips creating a new TraitSnapshot when the most recent one for this
 * property already has the same traitsHash — nothing changed since last
 * computation, so a fresh row would just be an unbounded duplicate. Compares
 * against the single most recent snapshot only (not full dedup across all
 * history), which is all "reuse the last computation" needs.
 */
export async function persistTraitSnapshot(
  propertyId: string,
  householdId: string | null,
  traitsJson: Record<string, unknown>,
  traitsHash: string,
): Promise<void> {
  const latest = await prisma.traitSnapshot.findFirst({
    where: { propertyId },
    orderBy: { computedAt: 'desc' },
    select: { traitsHash: true },
  });
  if (latest?.traitsHash === traitsHash) return;

  await prisma.traitSnapshot.create({
    data: {
      propertyId,
      householdId,
      traitsJson: traitsJson as Prisma.InputJsonValue,
      traitsHash,
    },
  });
}
