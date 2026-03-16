// apps/backend/src/homeRenovationAdvisor/engine/confidence/confidence.service.ts
//
// Deterministic confidence scoring for the Home Renovation Risk Advisor.
// Maps data source quality + jurisdiction resolution + input completeness
// to AdvisorConfidenceLevel values.

import {
  AdvisorConfidenceLevel,
  AdvisorDataSourceType,
  RenovationJurisdictionLevel,
} from '@prisma/client';

// ============================================================================
// SOURCE-LEVEL CONFIDENCE
// Maps provider data source type to base confidence level.
// ============================================================================

export function scoreConfidenceFromSource(sourceType: AdvisorDataSourceType): AdvisorConfidenceLevel {
  switch (sourceType) {
    case AdvisorDataSourceType.API_VERIFIED:
      return AdvisorConfidenceLevel.HIGH;
    case AdvisorDataSourceType.CURATED_DATASET:
      return AdvisorConfidenceLevel.HIGH;
    case AdvisorDataSourceType.REGIONAL_INTERPOLATION:
      return AdvisorConfidenceLevel.MEDIUM;
    case AdvisorDataSourceType.INTERNAL_RULE:
      return AdvisorConfidenceLevel.MEDIUM;
    case AdvisorDataSourceType.USER_PROVIDED:
      return AdvisorConfidenceLevel.MEDIUM;
    case AdvisorDataSourceType.MANUAL_OVERRIDE:
      return AdvisorConfidenceLevel.MEDIUM;
    case AdvisorDataSourceType.UNKNOWN:
    default:
      return AdvisorConfidenceLevel.LOW;
  }
}

// ============================================================================
// JURISDICTION-LEVEL CONFIDENCE BONUS
// Better jurisdiction resolution improves confidence.
// ============================================================================

export function scoreConfidenceFromJurisdiction(
  level: RenovationJurisdictionLevel,
): AdvisorConfidenceLevel {
  switch (level) {
    case RenovationJurisdictionLevel.CITY:
    case RenovationJurisdictionLevel.ZIP:
      return AdvisorConfidenceLevel.HIGH;
    case RenovationJurisdictionLevel.COUNTY:
      return AdvisorConfidenceLevel.MEDIUM;
    case RenovationJurisdictionLevel.STATE:
      return AdvisorConfidenceLevel.LOW;
    case RenovationJurisdictionLevel.MULTI_LEVEL:
      return AdvisorConfidenceLevel.MEDIUM;
    case RenovationJurisdictionLevel.UNKNOWN:
    default:
      return AdvisorConfidenceLevel.UNAVAILABLE;
  }
}

// ============================================================================
// OVERALL SESSION CONFIDENCE
// Combines permit, tax, licensing module confidence levels.
// ============================================================================

export function computeOverallConfidence(
  permitConfidence: AdvisorConfidenceLevel,
  taxConfidence: AdvisorConfidenceLevel,
  licensingConfidence: AdvisorConfidenceLevel,
): AdvisorConfidenceLevel {
  const levels: AdvisorConfidenceLevel[] = ['HIGH', 'MEDIUM', 'LOW', 'UNAVAILABLE'];

  // Find the worst (highest index = lowest confidence) among all modules
  const worstIdx = Math.max(
    levels.indexOf(permitConfidence),
    levels.indexOf(taxConfidence),
    levels.indexOf(licensingConfidence),
  );

  // Overall is one step better than the worst module (bounded by weakest)
  // But if ALL modules are high, overall is high.
  const allHigh = [permitConfidence, taxConfidence, licensingConfidence].every(
    (c) => c === AdvisorConfidenceLevel.HIGH,
  );
  if (allHigh) return AdvisorConfidenceLevel.HIGH;

  // Majority rule — take the median confidence
  const sorted = [permitConfidence, taxConfidence, licensingConfidence].sort(
    (a, b) => levels.indexOf(a) - levels.indexOf(b),
  );
  return sorted[1]; // median
}

// ============================================================================
// CONFIDENCE LEVEL DOWNGRADE UTILITY
// ============================================================================

export function downgradeConfidence(
  level: AdvisorConfidenceLevel,
  steps: number = 1,
): AdvisorConfidenceLevel {
  const levels: AdvisorConfidenceLevel[] = ['HIGH', 'MEDIUM', 'LOW', 'UNAVAILABLE'];
  const idx = levels.indexOf(level);
  return levels[Math.min(idx + steps, levels.length - 1)];
}

// ============================================================================
// HUMAN-READABLE OVERALL CONFIDENCE REASON
// ============================================================================

export function buildOverallConfidenceReason(
  confidence: AdvisorConfidenceLevel,
  jurisdictionLevel: RenovationJurisdictionLevel,
  projectCostAssumed: boolean,
  modulesWithLowConfidence: string[],
): string {
  if (confidence === AdvisorConfidenceLevel.HIGH) {
    return 'High confidence: data was resolved at city-level jurisdiction with user-provided project cost.';
  }

  const reasons: string[] = [];

  if (jurisdictionLevel === RenovationJurisdictionLevel.STATE || jurisdictionLevel === RenovationJurisdictionLevel.UNKNOWN) {
    reasons.push('jurisdiction was only resolved at state level or below');
  }
  if (projectCostAssumed) {
    reasons.push('project cost was estimated from a national median');
  }
  if (modulesWithLowConfidence.length > 0) {
    reasons.push(`low-confidence data in: ${modulesWithLowConfidence.join(', ')}`);
  }

  if (reasons.length === 0) {
    return confidence === AdvisorConfidenceLevel.MEDIUM
      ? 'Medium confidence based on available inputs and national heuristics.'
      : 'Low confidence based on limited or unavailable data.';
  }

  return `${confidence === AdvisorConfidenceLevel.MEDIUM ? 'Medium' : 'Low'} confidence because ${reasons.join('; ')}.`;
}
