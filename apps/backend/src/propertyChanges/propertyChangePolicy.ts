import type {
  PropertyChangeSignals,
  PropertyChangeSourceHealth,
} from './propertyChange.contracts';

export const PROPERTY_CHANGE_MATERIALITY_RULES_VERSION = 'property-change-materiality-v1';
export const PROPERTY_CHANGE_BRIEFING_RULES_VERSION = 'property-change-briefing-v1';

export type PropertyChangeMateriality =
  | 'INFORMATIONAL'
  | 'MEANINGFUL'
  | 'IMPORTANT'
  | 'URGENT';

export type MaterialityDecision = {
  materiality: PropertyChangeMateriality;
  reasonCodes: string[];
  rulesVersion: typeof PROPERTY_CHANGE_MATERIALITY_RULES_VERSION;
};

export type BriefingDecision = {
  eligibility: 'ELIGIBLE' | 'DEFERRED' | 'INELIGIBLE';
  reasonCodes: string[];
  rulesVersion: typeof PROPERTY_CHANGE_BRIEFING_RULES_VERSION;
};

export function derivePropertyChangeMateriality(
  signals: PropertyChangeSignals,
): MaterialityDecision {
  if (
    signals.urgentSafetyCondition
    || signals.canonicalActionPriority === 'NOW'
  ) {
    return {
      materiality: 'URGENT',
      reasonCodes: [
        signals.urgentSafetyCondition
          ? 'URGENT_SAFETY_CONDITION'
          : 'CANONICAL_ACTION_NOW',
      ],
      rulesVersion: PROPERTY_CHANGE_MATERIALITY_RULES_VERSION,
    };
  }
  if (
    signals.propertyEffectConfirmed
    || signals.canonicalActionPriority === 'SOON'
    || (signals.homeownerRelevant && signals.lifecycleAdvanced)
  ) {
    const reasonCodes = [];
    if (signals.propertyEffectConfirmed) reasonCodes.push('PROPERTY_EFFECT_CONFIRMED');
    if (signals.canonicalActionPriority === 'SOON') reasonCodes.push('CANONICAL_ACTION_SOON');
    if (signals.homeownerRelevant && signals.lifecycleAdvanced) {
      reasonCodes.push('RELEVANT_LIFECYCLE_ADVANCED');
    }
    return {
      materiality: 'IMPORTANT',
      reasonCodes,
      rulesVersion: PROPERTY_CHANGE_MATERIALITY_RULES_VERSION,
    };
  }
  if (
    signals.homeownerRelevant
    || signals.canonicalActionPriority === 'PLAN'
  ) {
    return {
      materiality: 'MEANINGFUL',
      reasonCodes: [
        signals.homeownerRelevant
          ? 'HOMEOWNER_RELEVANT'
          : 'CANONICAL_ACTION_PLAN',
      ],
      rulesVersion: PROPERTY_CHANGE_MATERIALITY_RULES_VERSION,
    };
  }
  return {
    materiality: 'INFORMATIONAL',
    reasonCodes: ['NO_MATERIAL_HOMEOWNER_DELTA'],
    rulesVersion: PROPERTY_CHANGE_MATERIALITY_RULES_VERSION,
  };
}

export function deriveBriefingEligibility(input: {
  materiality: PropertyChangeMateriality;
  confidence: number | null;
  sourceHealth: PropertyChangeSourceHealth;
  superseded?: boolean;
}): BriefingDecision {
  if (input.superseded) {
    return {
      eligibility: 'INELIGIBLE',
      reasonCodes: ['CHANGE_SUPERSEDED'],
      rulesVersion: PROPERTY_CHANGE_BRIEFING_RULES_VERSION,
    };
  }
  if (input.materiality === 'INFORMATIONAL') {
    return {
      eligibility: 'INELIGIBLE',
      reasonCodes: ['BELOW_BRIEFING_MATERIALITY'],
      rulesVersion: PROPERTY_CHANGE_BRIEFING_RULES_VERSION,
    };
  }
  if (
    input.sourceHealth === 'UNAVAILABLE'
    || input.sourceHealth === 'NOT_CONFIGURED'
    || input.sourceHealth === 'STALE'
  ) {
    return {
      eligibility: 'DEFERRED',
      reasonCodes: [`SOURCE_${input.sourceHealth}`],
      rulesVersion: PROPERTY_CHANGE_BRIEFING_RULES_VERSION,
    };
  }
  if (input.confidence != null && input.confidence < 0.5) {
    return {
      eligibility: 'DEFERRED',
      reasonCodes: ['CONFIDENCE_BELOW_BRIEFING_THRESHOLD'],
      rulesVersion: PROPERTY_CHANGE_BRIEFING_RULES_VERSION,
    };
  }
  return {
    eligibility: 'ELIGIBLE',
    reasonCodes: [
      input.sourceHealth === 'DEGRADED'
        ? 'MATERIAL_CHANGE_WITH_DEGRADED_SOURCE'
        : 'MATERIAL_CHANGE_CURRENT_SOURCE',
    ],
    rulesVersion: PROPERTY_CHANGE_BRIEFING_RULES_VERSION,
  };
}
