import {
  HiddenAssetBeneficiaryScope,
  HiddenAssetBenefitPeriod,
  HiddenAssetBenefitType,
  HiddenAssetCategory,
  HiddenAssetConfidenceLevel,
  HiddenAssetFundingStatus,
  HiddenAssetRegionType,
  HiddenAssetRuleKind,
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
  county: string | null;
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
  sumpPumpInstalled: boolean | null;            // from hasSumpPump

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
  utilityProvider: string | null;
  gasProvider: string | null;
  primaryHeatingFuel: string | null;

  // ---------- Special zones / registries ----------
  inHistoricDistrict: boolean | null;
  historicRegistryStatus: string | null;
  inHurricaneZone: boolean | null;
  inFloodZone: boolean | null;
  inWildfireZone: boolean | null;
}

/**
 * Sensitive eligibility facts (audit section 9.6: income, disability, age,
 * veteran status, tax filing status, household composition, hardship,
 * immigration/other program-specific status). Deliberately NOT a field on
 * PropertyAttributeMap — these are never resolved from Property/homeowner
 * records broadly. A value only ever exists here when explicitly consented
 * and captured for one named match (see hiddenAssetSensitiveFacts.service.ts)
 * and the overlay passed into evaluateProgram is empty for every other
 * evaluation context (the initial broad scan across all programs never
 * receives one).
 */
export interface SensitiveAttributeMap {
  income: string | null;
  disability: boolean | null;
  age: number | null;
  veteranStatus: boolean | null;
  taxFilingStatus: string | null;
  householdComposition: string | null;
  hardshipStatus: boolean | null;
  immigrationStatus: string | null;
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
    kind: HiddenAssetRuleKind;
    groupKey: string | null;
  }>;
}

// ============================================================================
// EXPRESSION GROUP EVALUATION (mandatory / optional / disqualifying)
// ============================================================================

/**
 * Rules sharing a non-null groupKey are OR'd into one expression group; a
 * null groupKey makes a rule its own singleton group. A group's status
 * reflects whether ANY rule in it matched, or — when none matched — whether
 * the group is still unresolved (some attribute unknown) versus definitively
 * failed (every rule evaluable and false).
 */
export interface GroupEvalResult {
  groupKey: string;
  kind: HiddenAssetRuleKind;
  status: 'SATISFIED' | 'UNKNOWN' | 'NOT_SATISFIED';
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
  /** Non-null when the homeowner has marked this program as pursuing. */
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
  /** UNKNOWN means the period hasn't been reviewed — never assume recurring. */
  benefitPeriod: HiddenAssetBenefitPeriod;
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
  pursuedAt: string | null;
  // Phase-3: confidence calibration transparency
  confidenceCalibrationSummary: HiddenAssetConfidenceCalibrationSummary;
  propertyContextVersion: string | null;
  // program.version this match was last evaluated against — lets a stale
  // match be recognized as evaluated against superseded criteria even after
  // the live program has since changed.
  programVersionAtMatch: number | null;
  // Other currently-visible match IDs (on this property) whose program
  // shares this program's exclusionGroupKey — surfaced so a homeowner never
  // assumes all matched benefits stack. Never used to auto-hide a match.
  mutuallyExclusiveWith: string[];
  // Whether this benefit belongs to the property or the household (HSB-038)
  // — labeling only, not a matching-engine change.
  beneficiaryScope: HiddenAssetBeneficiaryScope;
}

export interface HiddenAssetMatchSummaryDTO {
  totalMatches: number;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
  categoryCounts: Partial<Record<HiddenAssetCategory, number>>;
  lastScanAt: string | null;
  /**
   * Number of reviewed programs evaluated during the last scan.
   * Null = never scanned. 0 = scanned, but the registry has no reviewed
   * programs for this property's region — a coverage gap, distinct from
   * "programs existed but none matched" (totalMatches === 0 with this > 0).
   */
  programsEvaluated: number | null;
}

export interface HiddenAssetMatchListDTO {
  propertyId: string;
  matches: HiddenAssetMatchDTO[];
  summary: HiddenAssetMatchSummaryDTO;
  propertyContextVersion: string | null;
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
  benefitPeriod: HiddenAssetBenefitPeriod;
  currency: string;
  sourceUrl: string | null;
  sourceLabel: string | null;
  eligibilityNotes: string | null;
  isActive: boolean;
  expiresAt: string | null;
  lastVerifiedAt: string | null;
  /** UNKNOWN never implies funding is available — only OPEN does. */
  fundingStatus: HiddenAssetFundingStatus;
  applicationWindowOpensAt: string | null;
  applicationWindowClosesAt: string | null;
  beneficiaryScope: HiddenAssetBeneficiaryScope;
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
  propertyContextVersion: string;
}

export interface CoverageSourceDTO {
  id: string;
  name: string;
  sourceKind: string;
  officialUrl: string;
  /** Null means never reviewed. */
  lastReviewedAt: string | null;
  /** True when past the source's own review SLA, or never reviewed. */
  stale: boolean;
}

/**
 * What was actually checked for a property: which reviewed sources cover
 * its region, and which benefit categories have no published program there.
 * The homeowner-facing answer to "a successful scan is not source coverage."
 */
export interface CoverageDTO {
  propertyId: string;
  generatedAt: string;
  regionsChecked: string[];
  sources: CoverageSourceDTO[];
  categoriesCovered: HiddenAssetCategory[];
  categoriesNotCovered: HiddenAssetCategory[];
}
