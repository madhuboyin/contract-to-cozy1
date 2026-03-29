import {
  HiddenAssetBenefitType,
  HiddenAssetCategory,
  HiddenAssetConfidenceLevel,
  HiddenAssetRegionType,
  HiddenAssetRuleOperator,
  PropertyHiddenAssetMatchStatus,
} from '@prisma/client';

// ============================================================================
// RULE ENGINE INPUT TYPES
// ============================================================================

/**
 * Normalized map of property attributes used by the rule engine.
 *
 * All fields are nullable — missing data causes lower confidence, not crashes.
 * Fields labelled "not yet in Property schema" will remain null until the schema
 * evolves; the resolver and confidence engine handle them gracefully.
 */
export interface PropertyAttributeMap {
  // ---------- Geography ----------
  state: string | null;
  city: string | null;
  zipCode: string | null;
  county: string | null;       // not yet in Property schema
  country: string;

  // ---------- Ownership / classification ----------
  propertyType: string | null;
  isPrimaryResidence: boolean | null;
  yearBuilt: number | null;
  squareFootage: number | null;
  assessedValue: number | null; // from lastAppraisedValue

  // ---------- Systems ----------
  hvacType: string | null;
  waterHeaterType: string | null;
  roofType: string | null;
  roofMaterial: string | null;  // alias for roofType; same data, friendlier alias
  roofAge: number | null;       // derived: currentYear − roofReplacementYear

  // ---------- Derived / inferred systems ----------
  heatPumpInstalled: boolean | null;            // derived: hvacType == HEAT_PUMP
  heatPumpWaterHeaterInstalled: boolean | null; // derived: waterHeaterType == HEAT_PUMP
  sumpPumpInstalled: boolean | null;            // from hasSumpPumpBackup

  // ---------- Safety / smart home ----------
  hasSecuritySystem: boolean | null;
  hasSolarInstalled: boolean | null;    // not yet in Property schema
  hasEvCharger: boolean | null;         // not yet in Property schema
  hasLeakSensors: boolean | null;       // not yet in Property schema
  sprinklerSystem: boolean | null;      // not yet in Property schema
  fireAlarm: boolean | null;            // proxy: hasSmokeDetectors
  hasIrrigation: boolean | null;
  hasSumpPumpBackup: boolean | null;

  // ---------- Storm / resilience features ----------
  impactWindows: boolean | null;  // not yet in Property schema
  shutters: boolean | null;       // not yet in Property schema
  roofStraps: boolean | null;     // not yet in Property schema

  // ---------- Energy / upgrade signals ----------
  insulationUpgrade: boolean | null; // not yet in Property schema
  windowUpgrade: boolean | null;     // not yet in Property schema

  // ---------- Utility ----------
  utilityProvider: string | null;    // not yet in Property schema
  gasProvider: string | null;        // not yet in Property schema
  primaryHeatingFuel: string | null;

  // ---------- Special zones / registries ----------
  inHistoricDistrict: boolean | null;      // not yet in Property schema
  historicRegistryStatus: string | null;   // not yet in Property schema
  inHurricaneZone: boolean | null;         // not yet in Property schema
  inFloodZone: boolean | null;             // not yet in Property schema
  inWildfireZone: boolean | null;          // not yet in Property schema
}

// ============================================================================
// RULE ENGINE CONTEXT
// ============================================================================

/**
 * Evaluation context passed alongside the attribute map.
 * Provides category and freshness info needed for confidence caps.
 */
export interface EvalContext {
  category: HiddenAssetCategory;
  lastVerifiedAt: Date | null;
}

// ============================================================================
// RULE ENGINE OUTPUT TYPES
// ============================================================================

export interface SingleRuleEvalResult {
  matched: boolean;
  attributeMissing: boolean;
}

export interface ProgramEvalResult {
  programId: string;
  matched: boolean;
  confidenceLevel: HiddenAssetConfidenceLevel | null;
  matchedRuleCount: number;
  totalRuleCount: number;
  matchReasons: string[];
  estimatedValue: number | null;
  estimatedValueMin: number | null;
  estimatedValueMax: number | null;
}

export interface RuleEngineProgramInput {
  id: string;
  benefitEstimateMin: number | null;
  benefitEstimateMax: number | null;
  rules: Array<{
    id: string;
    attribute: string;
    operator: HiddenAssetRuleOperator;
    value: string;
    sortOrder: number;
  }>;
}

// ============================================================================
// REGION PAIR HELPER
// ============================================================================

export interface RegionPair {
  regionType: HiddenAssetRegionType;
  regionValue: string;
}

// ============================================================================
// SERVICE INPUT TYPES
// ============================================================================

export interface HiddenAssetMatchFilters {
  confidenceLevel?: HiddenAssetConfidenceLevel;
  category?: HiddenAssetCategory;
  status?: PropertyHiddenAssetMatchStatus;
  includeDismissed?: boolean;
  includeExpired?: boolean;
}

export interface UpdateMatchStatusInput {
  status: PropertyHiddenAssetMatchStatus;
}

// ============================================================================
// RESPONSE DTO TYPES
// ============================================================================

export interface HiddenAssetConfidenceCalibrationSummary {
  matchedRuleCount: number | null;
  totalRuleCount: number | null;
  /** Human-readable explanation of how confidence was scored for this match. */
  calibrationNote: string;
  /** Non-null when the homeowner has already claimed this program. */
  outcomeNote: string | null;
}

export interface HiddenAssetMatchDTO {
  id: string;
  propertyId: string;
  programId: string;
  programName: string;
  category: HiddenAssetCategory;
  description: string | null;
  benefitType: HiddenAssetBenefitType;
  estimatedValue: number | null;
  estimatedValueMin: number | null;
  estimatedValueMax: number | null;
  currency: string;
  confidenceLevel: HiddenAssetConfidenceLevel;
  /** Human-friendly confidence label. Never implies guaranteed approval. */
  eligibilityLabel: string;
  status: PropertyHiddenAssetMatchStatus;
  matchedRuleCount: number | null;
  totalRuleCount: number | null;
  matchReasons: string[] | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  eligibilityNotes: string | null;
  lastVerifiedAt: string | null;
  expiresAt: string | null;
  isProgramActive: boolean;
  /** Non-null when program data is stale. Surface to users as a caveat. */
  freshnessNote: string | null;
  lastEvaluatedAt: string;
  firstDetectedAt: string;
  dismissedAt: string | null;
  claimedAt: string | null;
  // Phase-3: confidence calibration transparency
  confidenceCalibrationSummary: HiddenAssetConfidenceCalibrationSummary;
}

export interface HiddenAssetMatchSummaryDTO {
  totalMatches: number;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
  categoryCounts: Partial<Record<HiddenAssetCategory, number>>;
  lastScanAt: string | null;
}

export interface HiddenAssetMatchListDTO {
  propertyId: string;
  matches: HiddenAssetMatchDTO[];
  summary: HiddenAssetMatchSummaryDTO;
}

export interface HiddenAssetProgramDetailDTO {
  id: string;
  name: string;
  category: HiddenAssetCategory;
  description: string | null;
  regionType: HiddenAssetRegionType;
  regionValue: string;
  benefitType: HiddenAssetBenefitType;
  benefitEstimateMin: number | null;
  benefitEstimateMax: number | null;
  currency: string;
  sourceUrl: string | null;
  sourceLabel: string | null;
  eligibilityNotes: string | null;
  isActive: boolean;
  expiresAt: string | null;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RefreshResultDTO {
  scanRunId: string;
  propertyId: string;
  programsEvaluated: number;
  matchesFound: number;
  matchesExpired: number;
  matchesInactivated: number;
  durationMs: number;
  matches: HiddenAssetMatchDTO[];
}
