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
  if (legacy.shape !== 'NO_WARRANTY' && legacy.shape !== 'HAS_WARRANTY') return { outcome: 'DISAGREE', reasonCode: 'LEGACY_FAMILY_NOT_MIGRATED', plan, facet };
  if (!facet) return { outcome: 'DISAGREE', reasonCode: 'GRAMMAR_DID_NOT_MATCH', plan, facet };
  if (!facet.confidenceSignals.grammarComplete) return { outcome: 'DISAGREE', reasonCode: 'GRAMMAR_HAS_UNRESOLVED_MEANING', plan, facet };
  if (facet.requestClass !== 'DATA_QUERY'
    || facet.subject?.entityId !== 'entity.inventory_item'
    || facet.relations.length !== 1
    || facet.relations[0].semanticRelationId !== 'relation.inventory_item.warranty'
    || facet.polarity !== (legacy.shape === 'NO_WARRANTY' ? 'NEGATIVE' : 'POSITIVE')) {
    return { outcome: 'DISAGREE', reasonCode: 'GRAMMAR_MEANING_MISMATCH', plan, facet };
  }
  const expectedProjection = legacy.count ? 'COUNT' : legacy.detail ? 'DETAIL' : legacy.exists ? 'EXISTS' : 'LIST';
  if (facet.projection !== expectedProjection) return { outcome: 'DISAGREE', reasonCode: 'GRAMMAR_PROJECTION_MISMATCH', plan, facet };
  // The first subset represents absence of a linked record. Expiration is a
  // different predicate and remains withheld until that grammar is registered.
  if (legacy.shape === 'NO_WARRANTY' && legacy.currentOnly) return { outcome: 'DISAGREE', reasonCode: 'CURRENT_WARRANTY_PREDICATE_NOT_MIGRATED', plan, facet };
  return { outcome: 'AGREE', reasonCode: 'LEGACY_AND_TYPED_GRAMMAR_AGREE', plan, facet };
}

export interface LegacyReadCandidateSpec {
  readonly requestClass: 'DATA_QUERY' | 'CAPABILITY';
  readonly subjectEntityId: string;
  readonly semanticRelationId?: string | null;
  readonly jobMatch?: string | null;
  readonly polarity: 'POSITIVE' | 'NEGATIVE';
  readonly projection: 'DETAIL' | 'LIST' | 'COUNT' | 'EXISTS';
  readonly materialFilterIds?: readonly string[];
  readonly requiredSlots?: readonly string[];
}

/**
 * FR-CAP-3 / §18 Phase 1: Requires legacy candidates to agree with the
 * independently constructed grammar plan on semantic job/relation, subject,
 * polarity, projection, material filters, and required slots.
 */
export function verifyLegacyCandidateGrammarAgreement(
  message: string,
  candidate: LegacyReadCandidateSpec,
): LegacyGrammarAgreement {
  const plan = parseDeterministicSemanticRequest(message);
  const facet = plan.outcome === 'MATCH' && plan.facets.length === 1 ? plan.facets[0] : null;
  if (!facet) return { outcome: 'DISAGREE', reasonCode: 'GRAMMAR_DID_NOT_MATCH', plan, facet };
  if (!facet.confidenceSignals.grammarComplete) return { outcome: 'DISAGREE', reasonCode: 'GRAMMAR_HAS_UNRESOLVED_MEANING', plan, facet };
  if (facet.requestClass !== candidate.requestClass) return { outcome: 'DISAGREE', reasonCode: 'GRAMMAR_REQUEST_CLASS_MISMATCH', plan, facet };
  if (facet.subject?.entityId !== candidate.subjectEntityId) return { outcome: 'DISAGREE', reasonCode: 'GRAMMAR_SUBJECT_MISMATCH', plan, facet };
  if (candidate.semanticRelationId) {
    if (facet.relations.length !== 1 || facet.relations[0].semanticRelationId !== candidate.semanticRelationId) {
      return { outcome: 'DISAGREE', reasonCode: 'GRAMMAR_RELATION_MISMATCH', plan, facet };
    }
  }
  if (candidate.jobMatch && facet.evidence.jobMatch !== candidate.jobMatch) {
    return { outcome: 'DISAGREE', reasonCode: 'GRAMMAR_JOB_MISMATCH', plan, facet };
  }
  if (facet.polarity !== candidate.polarity) return { outcome: 'DISAGREE', reasonCode: 'GRAMMAR_POLARITY_MISMATCH', plan, facet };
  if (facet.projection !== candidate.projection) return { outcome: 'DISAGREE', reasonCode: 'GRAMMAR_PROJECTION_MISMATCH', plan, facet };

  const expectedFilters = [...new Set(candidate.materialFilterIds ?? [])].sort();
  const actualFilters = [...new Set([
    ...facet.fields.map((field) => field.fieldId),
    ...facet.relations.map((rel) => rel.predicateId),
  ])].sort();
  if (expectedFilters.length > 0 && expectedFilters.some((filterId) => !actualFilters.includes(filterId))) {
    return { outcome: 'DISAGREE', reasonCode: 'GRAMMAR_MATERIAL_FILTER_MISMATCH', plan, facet };
  }

  const expectedSlots = [...new Set(candidate.requiredSlots ?? [])].sort();
  const actualSlots = [...new Set(facet.requiredSlots.map((slot) => slot.slotId))].sort();
  if (expectedSlots.join('|') !== actualSlots.join('|')) {
    return { outcome: 'DISAGREE', reasonCode: 'GRAMMAR_REQUIRED_SLOTS_MISMATCH', plan, facet };
  }

  return { outcome: 'AGREE', reasonCode: 'LEGACY_AND_TYPED_GRAMMAR_AGREE', plan, facet };
}
