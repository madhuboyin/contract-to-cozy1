import { HiddenAssetCategory, HiddenAssetConfidenceLevel } from '@prisma/client';
import { PropertyAttributeMap } from './types';

// ============================================================================
// CONFIDENCE GATE TYPES
// ============================================================================

/**
 * A confidence gate is a list of PropertyAttributeMap keys.
 *
 * Gate semantics:
 *   PASSES  → at least one attribute in the list is non-null on the property
 *   FAILS   → ALL attributes in the list are null/undefined
 *
 * When a gate FAILS:
 *   highConfidenceGates failure  → cap confidence at MEDIUM
 *   mediumConfidenceGates failure → cap confidence at LOW
 *
 * This models the idea that certain attribute families must be present to
 * justify a strong confidence claim for a given category.
 */
export type ConfidenceGate = (keyof PropertyAttributeMap)[];

export interface CategoryConfidencePolicy {
  /** If ANY of these gates fails, cap confidence at MEDIUM (not HIGH). */
  highConfidenceGates: ConfidenceGate[];
  /** If ANY of these gates fails, cap confidence at LOW (not MEDIUM). */
  mediumConfidenceGates: ConfidenceGate[];
}

// ============================================================================
// PER-CATEGORY CONFIDENCE POLICIES
// ============================================================================

export const CATEGORY_CONFIDENCE_POLICIES: Record<
  HiddenAssetCategory,
  CategoryConfidencePolicy
> = {
  /**
   * TAX_EXEMPTION
   * Geography + ownership context required for strong claims.
   * isPrimaryResidence alone gates HIGH; some location data gates MEDIUM.
   */
  [HiddenAssetCategory.TAX_EXEMPTION]: {
    highConfidenceGates: [
      ['state'],                                               // location required
      ['isPrimaryResidence', 'propertyType', 'county', 'city'], // ownership/locality context
    ],
    mediumConfidenceGates: [
      ['state', 'county', 'city', 'zipCode'],                 // some location data
    ],
  },

  /**
   * REBATE
   * Both geography AND equipment/system type needed for HIGH.
   * Geography alone sufficient for MEDIUM (equipment match is a bonus).
   */
  [HiddenAssetCategory.REBATE]: {
    highConfidenceGates: [
      ['state', 'zipCode', 'city', 'county'],
      [
        'hvacType',
        'waterHeaterType',
        'heatPumpInstalled',
        'heatPumpWaterHeaterInstalled',
        'insulationUpgrade',
        'windowUpgrade',
      ],
    ],
    mediumConfidenceGates: [
      ['state', 'zipCode', 'city', 'county'],
    ],
  },

  /**
   * UTILITY_INCENTIVE
   * Utility provider or fine-grained geography strongly gates HIGH.
   * Any broader geography is enough for MEDIUM.
   */
  [HiddenAssetCategory.UTILITY_INCENTIVE]: {
    highConfidenceGates: [
      ['utilityProvider', 'gasProvider', 'zipCode'],  // provider or ZIP required
    ],
    mediumConfidenceGates: [
      ['state', 'zipCode', 'city', 'utilityProvider', 'county'],
    ],
  },

  /**
   * INSURANCE_DISCOUNT
   * Feature signals (roof, security, etc.) gate HIGH — absence of all feature data
   * means we can't support a high-confidence discount claim.
   */
  [HiddenAssetCategory.INSURANCE_DISCOUNT]: {
    highConfidenceGates: [
      [
        'roofAge',
        'roofType',
        'roofMaterial',
        'hasSecuritySystem',
        'hasLeakSensors',
        'sprinklerSystem',
        'fireAlarm',
        'impactWindows',
        'shutters',
        'roofStraps',
        'hasSumpPumpBackup',
        'sumpPumpInstalled',
      ],
    ],
    mediumConfidenceGates: [
      [
        'roofAge',
        'roofType',
        'roofMaterial',
        'hasSecuritySystem',
        'hasLeakSensors',
        'inHurricaneZone',
        'inFloodZone',
        'sprinklerSystem',
        'fireAlarm',
        'impactWindows',
        'shutters',
      ],
    ],
  },

  /**
   * ENERGY_CREDIT
   * Equipment presence is critical — without any energy feature data the claim
   * is unsupported. Geography alone is not sufficient for HIGH.
   */
  [HiddenAssetCategory.ENERGY_CREDIT]: {
    highConfidenceGates: [
      [
        'hasSolarInstalled',
        'heatPumpInstalled',
        'heatPumpWaterHeaterInstalled',
        'hasEvCharger',
        'insulationUpgrade',
        'windowUpgrade',
      ],
    ],
    mediumConfidenceGates: [
      [
        'hasSolarInstalled',
        'heatPumpInstalled',
        'heatPumpWaterHeaterInstalled',
        'hasEvCharger',
        'hvacType',
        'waterHeaterType',
        'insulationUpgrade',
        'windowUpgrade',
      ],
    ],
  },

  /**
   * LOCAL_GRANT
   * Specific city/county geography required for HIGH (state alone is too broad).
   * Any location data is enough for MEDIUM.
   */
  [HiddenAssetCategory.LOCAL_GRANT]: {
    highConfidenceGates: [
      ['city', 'county'],
      ['yearBuilt', 'isPrimaryResidence', 'assessedValue'],
    ],
    mediumConfidenceGates: [
      ['city', 'county', 'state', 'zipCode'],
    ],
  },

  /**
   * HISTORIC_BENEFIT
   * Historic district flag or registry status gates HIGH — year built alone
   * is weak evidence. For MEDIUM, at least some age or district signal is needed.
   */
  [HiddenAssetCategory.HISTORIC_BENEFIT]: {
    highConfidenceGates: [
      ['inHistoricDistrict', 'historicRegistryStatus'],  // district/registry required
      ['yearBuilt'],
    ],
    mediumConfidenceGates: [
      ['yearBuilt', 'inHistoricDistrict', 'historicRegistryStatus', 'city'],
    ],
  },

  /**
   * STORM_RESILIENCE
   * Hazard zone data gates HIGH — without knowing whether the property
   * is actually in a hazard zone we can't justify a high claim.
   */
  [HiddenAssetCategory.STORM_RESILIENCE]: {
    highConfidenceGates: [
      ['inHurricaneZone', 'inFloodZone', 'inWildfireZone'],
    ],
    mediumConfidenceGates: [
      ['inHurricaneZone', 'inFloodZone', 'inWildfireZone', 'state', 'county', 'zipCode'],
    ],
  },
};

// ============================================================================
// CONFIDENCE CAP APPLICATION
// ============================================================================

function gateAllMissing(gate: ConfidenceGate, attrs: PropertyAttributeMap): boolean {
  return gate.every((key) => attrs[key] === null || attrs[key] === undefined);
}

/**
 * Applies category-specific attribute-presence caps to a confidence level.
 *
 * If key attribute families required for a confidence tier are entirely absent
 * from the property record, the confidence level is capped downward.
 * This prevents inflating confidence when critical signals are unknown.
 */
export function applyConfidenceCaps(
  level: HiddenAssetConfidenceLevel,
  category: HiddenAssetCategory,
  attrs: PropertyAttributeMap,
): HiddenAssetConfidenceLevel {
  if (level === HiddenAssetConfidenceLevel.LOW) return level;

  const policy = CATEGORY_CONFIDENCE_POLICIES[category];
  if (!policy) return level;

  // HIGH → MEDIUM if any high-confidence gate has zero non-null attributes
  if (level === HiddenAssetConfidenceLevel.HIGH) {
    const highGateFails = policy.highConfidenceGates.some((gate) =>
      gateAllMissing(gate, attrs),
    );
    if (highGateFails) level = HiddenAssetConfidenceLevel.MEDIUM;
  }

  // MEDIUM → LOW if any medium-confidence gate has zero non-null attributes
  if (level === HiddenAssetConfidenceLevel.MEDIUM) {
    const mediumGateFails = policy.mediumConfidenceGates.some((gate) =>
      gateAllMissing(gate, attrs),
    );
    if (mediumGateFails) level = HiddenAssetConfidenceLevel.LOW;
  }

  return level;
}

// ============================================================================
// FRESHNESS PENALTY
// ============================================================================

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const TWO_YEARS_MS = 2 * ONE_YEAR_MS;

/**
 * Applies a staleness penalty to confidence when lastVerifiedAt is old.
 *
 * Rationale: incentive programs change frequently. Treating stale registry
 * data as high-confidence could mislead homeowners.
 *
 * Penalty schedule:
 *   null                  → no penalty (newly added program, assume fresh)
 *   ≤ 12 months old       → no penalty
 *   12–24 months old      → HIGH capped at MEDIUM
 *   > 24 months old       → all levels capped at LOW
 */
export function applyFreshnessPenalty(
  level: HiddenAssetConfidenceLevel,
  lastVerifiedAt: Date | null,
): HiddenAssetConfidenceLevel {
  if (lastVerifiedAt === null) return level;

  const ageMs = Date.now() - lastVerifiedAt.getTime();

  if (ageMs > TWO_YEARS_MS) {
    return HiddenAssetConfidenceLevel.LOW;
  }
  if (ageMs > ONE_YEAR_MS && level === HiddenAssetConfidenceLevel.HIGH) {
    return HiddenAssetConfidenceLevel.MEDIUM;
  }

  return level;
}

/**
 * Returns a UI-safe freshness note when program data is stale.
 * Returns null when data is acceptably fresh.
 */
export function getFreshnessNote(lastVerifiedAt: Date | null): string | null {
  if (lastVerifiedAt === null) return null;

  const ageMs = Date.now() - lastVerifiedAt.getTime();

  if (ageMs > TWO_YEARS_MS) {
    return 'Program data may be outdated — verify current eligibility with the official source.';
  }
  if (ageMs > ONE_YEAR_MS) {
    return 'Program data was last verified over a year ago — check for current availability.';
  }

  return null;
}

// ============================================================================
// ELIGIBILITY LABELS
// ============================================================================

/**
 * Returns a cautious, frontend-safe eligibility label for a confidence level.
 * Language intentionally avoids certainty to align with the product rule that
 * all detections are potential benefits, not guaranteed approvals.
 */
export function getEligibilityLabel(level: HiddenAssetConfidenceLevel): string {
  switch (level) {
    case HiddenAssetConfidenceLevel.HIGH:
      return 'Likely eligible';
    case HiddenAssetConfidenceLevel.MEDIUM:
      return 'Possibly eligible';
    case HiddenAssetConfidenceLevel.LOW:
      return 'Worth verifying';
    default:
      return 'Worth verifying';
  }
}
