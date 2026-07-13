// apps/backend/src/modules/personalization/domain/traits.ts
//
// The "one non-sensitive property trait" item in
// docs/personalization/09-implementation-roadmap.md's first implementation
// step. `hvacFilterReplacementOverdue` is derived purely from Property/
// HomeAsset fields already in the schema (HomeAsset.assetType,
// HomeAsset.lastServiced) — no household, pet, or profile data is read,
// satisfying the roadmap's "without collecting household data" constraint.
//
// This is deliberately a *different*, simpler trait than the
// `hvac_filter_pet_adjusted` catalog-plan entry (docs/personalization/catalog-plan.md),
// which is pet-adjusted by design and therefore needs household data — not
// usable for this proof's constraint. See adr-0001 for the full reasoning.
import { TraitReading } from './evaluator';

export const HVAC_FILTER_OVERDUE_THRESHOLD_DAYS = 90;

export interface HomeAssetFact {
  assetType: string;
  lastServiced: Date | null;
}

/**
 * Derives whether an HVAC filter is likely overdue for replacement, purely
 * from HomeAsset service history.
 *
 * Returns `{ known: false }` (UNKNOWN, not FALSE) when there's no HVAC-type
 * asset on the property at all, or one exists but was never serviced —
 * both are genuinely "we don't know," not "definitely fine," and must not
 * be treated as ineligible-by-default per the three-valued handling
 * 04-target-architecture.md's evaluator section calls for.
 */
export function deriveHvacFilterReplacementOverdue(
  homeAssets: HomeAssetFact[],
  now: Date = new Date(),
): TraitReading {
  const hvacAssets = homeAssets.filter((a) => a.assetType.toUpperCase().startsWith('HVAC'));
  if (hvacAssets.length === 0) {
    return { known: false };
  }

  const serviced = hvacAssets.filter(
    (a): a is HomeAssetFact & { lastServiced: Date } => a.lastServiced !== null,
  );
  if (serviced.length === 0) {
    return { known: false };
  }

  const mostRecentServiceDate = serviced.reduce(
    (latest, a) => (a.lastServiced > latest ? a.lastServiced : latest),
    serviced[0].lastServiced,
  );

  const daysSinceServiced = Math.floor(
    (now.getTime() - mostRecentServiceDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  return { known: true, value: daysSinceServiced >= HVAC_FILTER_OVERDUE_THRESHOLD_DAYS };
}

// ─── Phase 1, migration step 3: two more non-sensitive property traits ────
// (see docs/personalization/adr-0002-phase1-foundation-migration-steps-1-3.md)
// Both derived from fields already on Property — no household/personal data.

export interface PropertySafetyFact {
  hasSmokeDetectors: boolean | null;
}

/**
 * Derives whether the property is missing smoke detectors, from
 * Property.hasSmokeDetectors directly. `null` (never confirmed either way)
 * is UNKNOWN, not FALSE — an unconfirmed property must not be treated as
 * "definitely has detectors."
 */
export function deriveSmokeDetectorMissing(property: PropertySafetyFact): TraitReading {
  if (property.hasSmokeDetectors === null || property.hasSmokeDetectors === undefined) {
    return { known: false };
  }
  return { known: true, value: property.hasSmokeDetectors === false };
}

export const ROOF_REPLACEMENT_OVERDUE_THRESHOLD_YEARS = 25;

export interface PropertyRoofFact {
  roofReplacementYear: number | null;
}

/**
 * Derives whether the roof is likely overdue for replacement, from
 * Property.roofReplacementYear against a fixed threshold. This is a
 * deliberate simplification — real per-material lifespan modeling (asphalt
 * shingle vs. metal vs. tile, climate exposure, etc.) is out of scope for
 * this proof-adjacent slice; `roofReplacementYear` unset is UNKNOWN.
 */
export function deriveRoofReplacementOverdue(
  property: PropertyRoofFact,
  now: Date = new Date(),
): TraitReading {
  if (property.roofReplacementYear === null || property.roofReplacementYear === undefined) {
    return { known: false };
  }
  const age = now.getUTCFullYear() - property.roofReplacementYear;
  return { known: true, value: age >= ROOF_REPLACEMENT_OVERDUE_THRESHOLD_YEARS };
}
