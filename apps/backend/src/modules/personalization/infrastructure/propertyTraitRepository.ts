// apps/backend/src/modules/personalization/infrastructure/propertyTraitRepository.ts
//
// Prisma-backed repository for current property-derived traits. Evaluation
// inputs are retained once in PersonalizationEvaluationRun.resultJson rather
// than duplicated in a separate trait-snapshot history table.
import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { HomeAssetFact } from '../domain/traits';
import { getAggregationPropertyContext } from '../../../services/aggregationContext/context';

export interface PropertyTraitFacts {
  hasSmokeDetectors: boolean | null;
  roofReplacementYear: number | null;
  homeAssets: HomeAssetFact[];
}

interface InventoryServiceFact {
  name: string;
  category: string;
  tags: string[];
  lastServicedOn: Date | null;
}

/**
 * Inventory is the homeowner-facing asset record. Normalize the small set of
 * asset families used by the reviewed personalization catalog so demo and
 * production properties can be configured entirely through the UI. Legacy
 * HomeAsset rows remain supported and are combined with these facts.
 */
export function inventoryItemToPersonalizationAssetFact(
  item: InventoryServiceFact,
): HomeAssetFact | null {
  const text = `${item.category} ${item.name} ${(item.tags || []).join(' ')}`.toUpperCase();
  let assetType: string | null = null;

  if (item.category === 'HVAC' || /\b(HVAC|FURNACE|HEAT PUMP|AIR CONDITION)/.test(text)) {
    assetType = 'HVAC';
  } else if (/\bSMOKE\b/.test(text) && /\b(DETECTOR|ALARM)\b/.test(text)) {
    assetType = 'SMOKE_DETECTOR';
  } else if (/\b(DRYER|WASHER_DRYER|LAUNDRY)\b/.test(text)) {
    assetType = 'DRYER';
  }

  return assetType ? { assetType, lastServiced: item.lastServicedOn } : null;
}

export async function loadPropertyTraitFacts(propertyId: string): Promise<PropertyTraitFacts | null> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      hasSmokeDetectors: true,
      roofReplacementYear: true,
      inventoryItems: {
        select: { name: true, category: true, tags: true, lastServicedOn: true, assetType: true },
      },
    },
  });
  if (!property) return null;

  return {
    hasSmokeDetectors: property.hasSmokeDetectors,
    roofReplacementYear: property.roofReplacementYear,
    homeAssets: (property.inventoryItems ?? [])
      .map((item) => item.assetType
        ? { assetType: item.assetType, lastServiced: item.lastServicedOn }
        : inventoryItemToPersonalizationAssetFact(item))
      .filter((asset): asset is HomeAssetFact => asset !== null),
  };
}

/**
 * Production personalization adapter. Trait inputs come from the authorized,
 * bounded Property Context snapshot instead of a second feature-owned query.
 */
export async function loadPropertyTraitFactsFromContext(
  propertyId: string,
  userId: string,
): Promise<PropertyTraitFacts | null> {
  const context = await getAggregationPropertyContext(propertyId, userId, 'PERSONALIZED_GUIDANCE');
  const known = <T>(key: string): T | null => {
    const fact = context.facts[key];
    return fact?.state === 'KNOWN' ? fact.value as T : null;
  };
  const items = known<Array<InventoryServiceFact & { assetType?: string | null }>>('inventory.items') ?? [];
  return {
    hasSmokeDetectors: known<boolean>('safety.hasSmokeDetectors'),
    roofReplacementYear: known<number>('structure.roofReplacementYear'),
    homeAssets: items
      .map((item) => item.assetType
        ? { assetType: item.assetType, lastServiced: item.lastServicedOn ? new Date(item.lastServicedOn) : null }
        : inventoryItemToPersonalizationAssetFact({
            ...item,
            lastServicedOn: item.lastServicedOn ? new Date(item.lastServicedOn) : null,
          }))
      .filter((asset): asset is HomeAssetFact => asset !== null),
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
