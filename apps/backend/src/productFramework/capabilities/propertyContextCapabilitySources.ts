import type { PropertyContextSnapshot } from '../../modules/propertyContext';
import type { CapabilityPersonalizationSource } from './capabilityRecommendationContext';

/**
 * Converts reviewed Home Record facts into narrow recommendation sources
 * without exposing raw fact values to the candidate matcher.
 */
export function buildPropertyContextCapabilitySources(
  snapshot: PropertyContextSnapshot,
): CapabilityPersonalizationSource[] {
  const propertyUse = snapshot.facts['core.propertyUse'];
  if (
    propertyUse?.state !== 'KNOWN'
    || propertyUse.value !== 'FOR_SALE'
  ) return [];

  return [{
    id: `property-context:${snapshot.propertyId}:sale-intent`,
    definitionCode: 'SELLER_SALE_INTENT_ACTIVE',
    status: 'ACTIVE',
    recommendationVersion: snapshot.contextVersion,
    contextVersion: snapshot.contextVersion,
    lastEvaluatedAt: snapshot.generatedAt,
  }];
}

