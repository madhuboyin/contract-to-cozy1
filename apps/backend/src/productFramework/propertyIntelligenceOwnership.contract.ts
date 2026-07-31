import type { RecommendationSafetyTier } from './recommendationGovernance.contract';

export const PROPERTY_INTELLIGENCE_QUESTION_OWNERS = {
  NEEDS_ATTENTION_NOW: 'HOME_ACTIONS',
  CURRENT_HOME_STATE: 'STATUS_BOARD',
  HOME_FACTS_AND_EVIDENCE: 'HOME_RECORD',
  SYSTEM_LIFECYCLE_AND_CAPITAL_TIMING: 'CAPITAL_TIMELINE',
  WHAT_IF_SCENARIOS: 'HOME_DIGITAL_TWIN',
  CHANGED_SINCE_LAST_REVIEW: 'HOME_BRIEFING',
  ACTUALLY_HAPPENED_TO_HOME: 'HOME_TIMELINE',
  CURRENT_ENVIRONMENTAL_CONDITIONS: 'ENVIRONMENT_REPORT',
  LONG_TERM_HAZARD_CONTEXT: 'ENVIRONMENT_REPORT',
  PAST_HAZARDS_NEAR_PROPERTY: 'PAST_HAZARD_EXPOSURE',
  CHANGES_AROUND_PROPERTY: 'AROUND_YOUR_HOME',
  SAFE_SELECTIVE_SHARING: 'PROPERTY_BRIEF',
} as const;

export type PropertyIntelligenceQuestion =
  keyof typeof PROPERTY_INTELLIGENCE_QUESTION_OWNERS;

export type PropertyIntelligenceOwner =
  typeof PROPERTY_INTELLIGENCE_QUESTION_OWNERS[PropertyIntelligenceQuestion];

export type PropertyIntelligenceSafetyInstance = {
  activeEmergency?: boolean;
  possibleStructuralStress?: boolean;
  insuranceOrValueImplication?: boolean;
  sharesSensitivePropertyData?: boolean;
  verifiedHistoryRead?: boolean;
};

/**
 * Safety follows the observation and proposed action, not the route that
 * happens to present it. The highest applicable consequence wins.
 */
export function derivePropertyIntelligenceSafetyTier(
  instance: PropertyIntelligenceSafetyInstance,
): RecommendationSafetyTier {
  if (instance.activeEmergency || instance.possibleStructuralStress) {
    return 'SAFETY_EMERGENCY';
  }
  if (instance.insuranceOrValueImplication || instance.sharesSensitivePropertyData) {
    return 'MATERIAL_FINANCIAL';
  }
  return 'LOW_CONSEQUENCE';
}

export const PROPERTY_INTELLIGENCE_CANONICAL_RULES = {
  actionPriorityOwner: 'HOME_ACTIONS',
  currentStateOwner: 'STATUS_BOARD',
  durableHistoryOwner: 'HOME_TIMELINE',
  environmentalTruthOwner: 'ENVIRONMENT_REPORT',
  scenarioOwner: 'HOME_DIGITAL_TWIN',
  briefingMustReferenceCanonicalTruth: true,
  externalObservationIsNotPropertyDamage: true,
  unavailableCoverageIsNotAllClear: true,
  compositeHomeScoreAllowed: false,
} as const;
