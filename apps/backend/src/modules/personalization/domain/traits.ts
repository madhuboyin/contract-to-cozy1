// apps/backend/src/modules/personalization/domain/traits.ts
//
// The "one non-sensitive property trait" item in
// docs/personalization/09-implementation-roadmap.md's first implementation
// step. `hvacFilterReplacementOverdue` is derived from canonical InventoryItem
// type and service-history facts; no household, pet, or profile data is read,
// satisfying the roadmap's "without collecting household data" constraint.
//
// This is deliberately a *different*, simpler trait than the
// `hvac_filter_pet_adjusted` catalog-plan entry (docs/personalization/catalog-plan.md),
// which is pet-adjusted by design and therefore needs household data — not
// usable for this proof's constraint. See adr-0001 for the full reasoning.
import { TraitReading } from './evaluator';

export const HVAC_FILTER_OVERDUE_THRESHOLD_DAYS = 90;

export interface InventoryItemFact {
  assetType: string;
  lastServiced: Date | null;
}

/**
 * Most recent service date among assets whose type starts with
 * `assetTypePrefix` (case-insensitive), or `null` when there's no such asset
 * at all or none was ever serviced. Shared by every asset-threshold trait in
 * this file (HVAC filter, smoke detector battery, dryer vent) so "what
 * counts as serviced" has one implementation — extracted once a third
 * near-identical trait made the duplication worth naming.
 */
export function mostRecentAssetServiceDate(inventoryItems: InventoryItemFact[], assetTypePrefix: string): Date | null {
  const matchingAssets = inventoryItems.filter((a) => a.assetType.toUpperCase().startsWith(assetTypePrefix));
  const serviced = matchingAssets.filter(
    (a): a is InventoryItemFact & { lastServiced: Date } => a.lastServiced !== null,
  );
  if (serviced.length === 0) {
    return null;
  }
  return serviced.reduce(
    (latest, a) => (a.lastServiced > latest ? a.lastServiced : latest),
    serviced[0].lastServiced,
  );
}

function mostRecentHvacServiceDate(inventoryItems: InventoryItemFact[]): Date | null {
  return mostRecentAssetServiceDate(inventoryItems, 'HVAC');
}

/**
 * Derives whether an HVAC filter is likely overdue for replacement, purely
 * from InventoryItem service history.
 *
 * Returns `{ known: false }` (UNKNOWN, not FALSE) when there's no HVAC-type
 * asset on the property at all, or one exists but was never serviced —
 * both are genuinely "we don't know," not "definitely fine," and must not
 * be treated as ineligible-by-default per the three-valued handling
 * 04-target-architecture.md's evaluator section calls for.
 */
export function deriveHvacFilterReplacementOverdue(
  inventoryItems: InventoryItemFact[],
  now: Date = new Date(),
): TraitReading {
  const mostRecentServiceDate = mostRecentHvacServiceDate(inventoryItems);
  if (!mostRecentServiceDate) {
    return { known: false };
  }

  const daysSinceServiced = Math.floor(
    (now.getTime() - mostRecentServiceDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  return { known: true, value: daysSinceServiced >= HVAC_FILTER_OVERDUE_THRESHOLD_DAYS };
}

/**
 * Raw days-since-last-HVAC-service, retained as a transparent property signal
 * (not an eligibility trait — no rule AST references this key). Same UNKNOWN semantics as
 * deriveHvacFilterReplacementOverdue: no HVAC asset or never serviced -> unknown.
 */
export function deriveHvacFilterDaysSinceServiced(
  inventoryItems: InventoryItemFact[],
  now: Date = new Date(),
): TraitReading {
  const mostRecentServiceDate = mostRecentHvacServiceDate(inventoryItems);
  if (!mostRecentServiceDate) {
    return { known: false };
  }

  const daysSinceServiced = Math.floor(
    (now.getTime() - mostRecentServiceDate.getTime()) / (1000 * 60 * 60 * 24),
  );

  return { known: true, value: daysSinceServiced };
}

// Additional non-sensitive property traits. Both derive from fields already
// on Property and never read household/profile data.

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
 * `smoke_co_detector_battery_check` definition (bootstrapped DRAFT by
 * apps/backend/prisma/seedPersonalization.sql). A battery check is modeled as
 * InventoryItem service history for a `SMOKE_DETECTOR` item, with `lastServiced`
 * check date.
 *
 * UNKNOWN (not FALSE) whenever detector presence isn't confirmed true, or
 * it is but no service history exists yet — "no detector confirmed present"
 * is a distinct concept already covered by deriveSmokeDetectorMissing above;
 * this trait only answers "given detectors exist, is a check overdue."
 */
export function deriveSmokeDetectorBatteryOverdue(
  property: PropertySafetyFact,
  inventoryItems: InventoryItemFact[],
  now: Date = new Date(),
): TraitReading {
  if (property.hasSmokeDetectors !== true) {
    return { known: false };
  }

  const mostRecentCheck = mostRecentAssetServiceDate(inventoryItems, 'SMOKE_DETECTOR');
  if (!mostRecentCheck) {
    return { known: false };
  }

  const daysSinceChecked = Math.floor((now.getTime() - mostRecentCheck.getTime()) / (1000 * 60 * 60 * 24));

  return { known: true, value: daysSinceChecked >= SMOKE_DETECTOR_BATTERY_CHECK_THRESHOLD_DAYS };
}

export function deriveSmokeDetectorBatteryDaysSinceServiced(
  property: PropertySafetyFact,
  inventoryItems: InventoryItemFact[],
  now: Date = new Date(),
): TraitReading {
  if (property.hasSmokeDetectors !== true) {
    return { known: false };
  }
  const mostRecentCheck = mostRecentAssetServiceDate(inventoryItems, 'SMOKE_DETECTOR');
  if (!mostRecentCheck) {
    return { known: false };
  }
  return {
    known: true,
    value: Math.floor((now.getTime() - mostRecentCheck.getTime()) / (1000 * 60 * 60 * 24)),
  };
}

export const DRYER_VENT_CLEANING_THRESHOLD_DAYS = 365;

/**
 * Derives whether dryer vent cleaning is overdue, for the
 * `dryer_vent_cleaning_reminder` definition (bootstrapped DRAFT by
 * apps/backend/prisma/seedPersonalization.sql). A DRYER InventoryItem's
 * `lastServiced` is the
 * last vent cleaning date. Unlike the smoke detector trait, there's no separate "is a dryer
 * present" property field to gate on first — no DRYER-type asset at all is
 * simply UNKNOWN, same as the original HVAC filter trait's approach.
 * 365-day threshold matches common fire-safety guidance (annual cleaning).
 */
export function deriveDryerVentCleaningOverdue(
  inventoryItems: InventoryItemFact[],
  now: Date = new Date(),
): TraitReading {
  const mostRecentCleaning = mostRecentAssetServiceDate(inventoryItems, 'DRYER');
  if (!mostRecentCleaning) {
    return { known: false };
  }

  const daysSinceCleaned = Math.floor((now.getTime() - mostRecentCleaning.getTime()) / (1000 * 60 * 60 * 24));

  return { known: true, value: daysSinceCleaned >= DRYER_VENT_CLEANING_THRESHOLD_DAYS };
}

export function deriveDryerVentDaysSinceServiced(
  inventoryItems: InventoryItemFact[],
  now: Date = new Date(),
): TraitReading {
  const mostRecentCleaning = mostRecentAssetServiceDate(inventoryItems, 'DRYER');
  if (!mostRecentCleaning) {
    return { known: false };
  }
  return {
    known: true,
    value: Math.floor((now.getTime() - mostRecentCleaning.getTime()) / (1000 * 60 * 60 * 24)),
  };
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

export function deriveRoofAgeYears(
  property: PropertyRoofFact,
  now: Date = new Date(),
): TraitReading {
  if (property.roofReplacementYear === null || property.roofReplacementYear === undefined) {
    return { known: false };
  }
  return { known: true, value: now.getUTCFullYear() - property.roofReplacementYear };
}
