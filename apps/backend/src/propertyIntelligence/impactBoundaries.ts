import type { GeographicMatch } from './geoMatching';

export type BoundedImpactAssessment = {
  rulesVersion: 'geographic-match-v1';
  affectedEntities: string[];
  relevance: 'UNKNOWN';
  materiality: 'INFORMATIONAL';
  confidence: number;
  knownFactsUsed: Record<string, unknown>;
  missingFacts: string[];
  boundedExplanation: string;
};

export function buildGeographicMatchAssessment(
  observationType: string,
  match: GeographicMatch,
): BoundedImpactAssessment {
  return {
    rulesVersion: 'geographic-match-v1',
    affectedEntities: [],
    relevance: 'UNKNOWN',
    materiality: 'INFORMATIONAL',
    confidence: match.matchConfidence,
    knownFactsUsed: {
      observationType,
      matchMethod: match.matchMethod,
      geographicPrecision: match.geographicPrecision,
      matchedGeography: match.matchedGeography,
      distanceMiles: match.distanceMiles,
    },
    missingFacts: [
      'PROPERTY_EFFECT_EVIDENCE',
      'PROPERTY_VULNERABILITY_FACTS',
    ],
    boundedExplanation:
      'The source observation geographically matches this property. This does not confirm an effect on the home.',
  };
}
