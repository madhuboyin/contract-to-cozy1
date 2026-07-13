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
 * Upserts one DerivedTrait row per known trait. Traits with known=false are
 * skipped — a DerivedTrait row's existence represents "this is currently
 * known," so an UNKNOWN trait is represented by the absence of a row, not a
 * row with a null/placeholder value.
 */
export async function persistDerivedTraits(
  propertyId: string,
  householdId: string | null,
  traits: DerivedTraitInput[],
): Promise<void> {
  for (const trait of traits) {
    if (!trait.known) continue;

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

export async function persistTraitSnapshot(
  propertyId: string,
  householdId: string | null,
  traitsJson: Record<string, unknown>,
  traitsHash: string,
): Promise<void> {
  await prisma.traitSnapshot.create({
    data: {
      propertyId,
      householdId,
      traitsJson: traitsJson as Prisma.InputJsonValue,
      traitsHash,
    },
  });
}
