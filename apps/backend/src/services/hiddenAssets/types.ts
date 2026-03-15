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
 * All fields are nullable — missing data causes lower confidence, not crashes.
 */
export interface PropertyAttributeMap {
  // Geography
  state: string | null;
  city: string | null;
  zipCode: string | null;
  county: string | null; // not yet in Property schema; always null for now
  country: string;

  // Ownership / classification
  propertyType: string | null;
  isPrimaryResidence: boolean | null;
  yearBuilt: number | null;
  squareFootage: number | null;

  // Systems
  hvacType: string | null;
  waterHeaterType: string | null;
  roofType: string | null;
  roofAge: number | null; // derived from roofReplacementYear

  // Safety / smart home
  hasSecuritySystem: boolean | null;
  hasSolarInstalled: boolean | null; // not yet in Property schema
  hasEvCharger: boolean | null;      // not yet in Property schema
  hasLeakSensors: boolean | null;    // not yet in Property schema
  hasIrrigation: boolean | null;
  hasSumpPumpBackup: boolean | null;

  // Utility
  utilityProvider: string | null; // not yet in Property schema
  primaryHeatingFuel: string | null;

  // Special zones / registries
  inHistoricDistrict: boolean | null; // not yet in Property schema
  inHurricaneZone: boolean | null;    // not yet in Property schema
  inFloodZone: boolean | null;        // not yet in Property schema
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
  activeOnly?: boolean;
  includeDismissed?: boolean;
  includeExpired?: boolean;
}

export interface UpdateMatchStatusInput {
  status: PropertyHiddenAssetMatchStatus;
}

// ============================================================================
// RESPONSE DTO TYPES
// ============================================================================

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
  lastEvaluatedAt: string;
  firstDetectedAt: string;
  dismissedAt: string | null;
  claimedAt: string | null;
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
