// apps/backend/src/modules/personalization/infrastructure/propertyTraitRepository.ts
//
// Prisma-backed repository for current property-derived traits. Evaluation
// inputs are retained once in PersonalizationEvaluationRun.resultJson rather
// than duplicated in a separate trait-snapshot history table.
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
        traitKey: trait.traitKey,
        valueJson: trait.value as Prisma.InputJsonValue,
        source: 'DERIVED',
      },
      update: {
        valueJson: trait.value as Prisma.InputJsonValue,
        computedAt: new Date(),
      },
    });
  }
}
