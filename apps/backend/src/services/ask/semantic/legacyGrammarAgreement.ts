import type { Shape789Plan } from '../dataPoint/dataPointShapes789';
import { parseDeterministicSemanticRequest } from './deterministicSemanticParser';
import type { SemanticFacet, SemanticRequestPlan } from './semanticRequestPlan';

export interface LegacyGrammarAgreement {
  readonly outcome: 'AGREE' | 'DISAGREE';
  readonly reasonCode: string;
  readonly plan: SemanticRequestPlan;
  readonly facet: SemanticFacet | null;
}

/** Independent admission evidence for the first migrated legacy family. */
export function warrantyShapeGrammarAgreement(message: string, legacy: Shape789Plan): LegacyGrammarAgreement {
  const plan = parseDeterministicSemanticRequest(message);
  const facet = plan.outcome === 'MATCH' && plan.facets.length === 1 ? plan.facets[0] : null;
  if (legacy.shape !== 'NO_WARRANTY') return { outcome: 'DISAGREE', reasonCode: 'LEGACY_FAMILY_NOT_MIGRATED', plan, facet };
  if (!facet) return { outcome: 'DISAGREE', reasonCode: 'GRAMMAR_DID_NOT_MATCH', plan, facet };
  if (!facet.confidenceSignals.grammarComplete) return { outcome: 'DISAGREE', reasonCode: 'GRAMMAR_HAS_UNRESOLVED_MEANING', plan, facet };
  if (facet.requestClass !== 'DATA_QUERY'
    || facet.subject?.entityId !== 'entity.inventory_item'
    || facet.relations.length !== 1
    || facet.relations[0].semanticRelationId !== 'relation.inventory_item.warranty'
    || facet.polarity !== 'NEGATIVE') {
    return { outcome: 'DISAGREE', reasonCode: 'GRAMMAR_MEANING_MISMATCH', plan, facet };
  }
  const expectedProjection = legacy.count ? 'COUNT' : 'LIST';
  if (facet.projection !== expectedProjection) return { outcome: 'DISAGREE', reasonCode: 'GRAMMAR_PROJECTION_MISMATCH', plan, facet };
  // The first subset represents absence of a linked record. Expiration is a
  // different predicate and remains withheld until that grammar is registered.
  if (legacy.currentOnly) return { outcome: 'DISAGREE', reasonCode: 'CURRENT_WARRANTY_PREDICATE_NOT_MIGRATED', plan, facet };
  return { outcome: 'AGREE', reasonCode: 'LEGACY_AND_TYPED_GRAMMAR_AGREE', plan, facet };
}
