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
 * Most recent service date among HVAC-type assets, or `null` when there's no
 * HVAC-type asset at all or none was ever serviced. Shared by both HVAC
 * traits below so "what counts as serviced" only has one implementation.
 */
function mostRecentHvacServiceDate(homeAssets: HomeAssetFact[]): Date | null {
  const hvacAssets = homeAssets.filter((a) => a.assetType.toUpperCase().startsWith('HVAC'));
  const serviced = hvacAssets.filter(
    (a): a is HomeAssetFact & { lastServiced: Date } => a.lastServiced !== null,
  );
  if (serviced.length === 0) {
    return null;
  }
  return serviced.reduce(
    (latest, a) => (a.lastServiced > latest ? a.lastServiced : latest),
    serviced[0].lastServiced,
  );
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
  const mostRecentServiceDate = mostRecentHvacServiceDate(homeAssets);
  if (!mostRecentServiceDate) {
    return { known: false };
  }

  const daysSinceServiced = Math.floor(
    (now.getTime() - mostRecentServiceDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  return { known: true, value: daysSinceServiced >= HVAC_FILTER_OVERDUE_THRESHOLD_DAYS };
}

/**
 * Raw days-since-last-HVAC-service, as a scoring input (not an eligibility
 * trait — no rule AST references this key). Same UNKNOWN semantics as
 * deriveHvacFilterReplacementOverdue: no HVAC asset or never serviced -> unknown.
 */
export function deriveHvacFilterDaysSinceServiced(
  homeAssets: HomeAssetFact[],
  now: Date = new Date(),
): TraitReading {
  const mostRecentServiceDate = mostRecentHvacServiceDate(homeAssets);
  if (!mostRecentServiceDate) {
    return { known: false };
  }

  const daysSinceServiced = Math.floor(
    (now.getTime() - mostRecentServiceDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  return { known: true, value: daysSinceServiced };
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

export const SMOKE_DETECTOR_BATTERY_CHECK_THRESHOLD_DAYS = 365;

/**
 * Derives whether a smoke/CO detector battery check is overdue, for the
 * `smoke_co_detector_battery_check` catalog-plan definition (seeded DRAFT in
 * seedPersonalizationCatalog.ts; see seedSmokeDetectorBatteryCheckRule.ts for
 * the rule this trait backs). Same HomeAsset.lastServiced pattern as the HVAC
 * filter traits above — a battery check is modeled as a HomeAsset row with
 * assetType 'SMOKE_DETECTOR', `lastServiced` being the last check date.
 *
 * UNKNOWN (not FALSE) whenever detector presence isn't confirmed true, or
 * it is but no service history exists yet — "no detector confirmed present"
 * is a distinct concept already covered by deriveSmokeDetectorMissing above;
 * this trait only answers "given detectors exist, is a check overdue."
 */
export function deriveSmokeDetectorBatteryOverdue(
  property: PropertySafetyFact,
  homeAssets: HomeAssetFact[],
  now: Date = new Date(),
): TraitReading {
  if (property.hasSmokeDetectors !== true) {
    return { known: false };
  }

  const smokeDetectorAssets = homeAssets.filter((a) => a.assetType.toUpperCase().startsWith('SMOKE_DETECTOR'));
  const serviced = smokeDetectorAssets.filter(
    (a): a is HomeAssetFact & { lastServiced: Date } => a.lastServiced !== null,
  );
  if (serviced.length === 0) {
    return { known: false };
  }

  const mostRecentCheck = serviced.reduce(
    (latest, a) => (a.lastServiced > latest ? a.lastServiced : latest),
    serviced[0].lastServiced,
  );
  const daysSinceChecked = Math.floor((now.getTime() - mostRecentCheck.getTime()) / (1000 * 60 * 60 * 24));

  return { known: true, value: daysSinceChecked >= SMOKE_DETECTOR_BATTERY_CHECK_THRESHOLD_DAYS };
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
