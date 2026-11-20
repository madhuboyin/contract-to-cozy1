import { parseDeterministicSemanticRequest } from './deterministicSemanticParser';
import type { SemanticFacet, SemanticRequestPlan } from './semanticRequestPlan';

export interface LegacyGrammarAgreement {
  readonly outcome: 'AGREE' | 'DISAGREE';
  readonly reasonCode: string;
  readonly plan: SemanticRequestPlan;
  readonly facet: SemanticFacet | null;
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
  options?: { readonly namedLabels?: readonly string[] },
): LegacyGrammarAgreement {
  const plan = parseDeterministicSemanticRequest(message, options?.namedLabels?.length ? { namedLabels: options.namedLabels } : undefined);
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

export const PRISMA_ENTITY_TO_BASIC_READ_SUBJECT: Readonly<Record<string, string>> = Object.freeze({
  Property: 'entity.property',
  InventoryRoom: 'entity.inventory_room',
  InventoryItem: 'entity.inventory_item',
  HomeSystem: 'entity.home_system',
  PropertyMaintenanceTask: 'entity.maintenance_task',
  Warranty: 'entity.warranty',
  InsurancePolicy: 'entity.insurance_policy',
  PropertyTaxBillRecord: 'entity.tax_bill',
  PropertyTaxAssessmentRecord: 'entity.tax_assessment',
  HomeReserveFund: 'entity.reserve_fund',
  PropertyRecord: 'entity.property_record',
  PropertyRecordVersion: 'entity.property_record',
  Document: 'entity.property_record',
  HomeEvent: 'entity.home_event',
  HomeBuyerTask: 'entity.buyer_task',
  SaleReadinessItem: 'entity.sale_readiness_item',
  Claim: 'entity.claim',
  HomeBuyerChecklist: 'entity.buyer_checklist',
  ClaimChecklistItem: 'entity.claim_checklist_item',
  ClaimTimelineEvent: 'entity.claim_timeline_event',
  ClaimDocument: 'entity.claim_document',
  BuyerJourneyMilestone: 'entity.buyer_milestone',
  PropertySalePrepProfile: 'entity.sale_prep_profile',
  PropertySaleCase: 'entity.sale_case',
});

export function dataPointReadGrammarAgreement(
  message: string,
  spec: {
    readonly prismaEntity: string;
    readonly projection: 'DETAIL' | 'LIST' | 'COUNT' | 'EXISTS';
    readonly polarity?: 'POSITIVE' | 'NEGATIVE';
  },
  options?: { readonly namedLabels?: readonly string[] },
): LegacyGrammarAgreement | null {
  let subjectEntityId = PRISMA_ENTITY_TO_BASIC_READ_SUBJECT[spec.prismaEntity];
  if (!subjectEntityId) return null;
  if (spec.prismaEntity === 'InventoryItem') {
    const precheck = parseDeterministicSemanticRequest(message);
    if (precheck.outcome === 'MATCH' && precheck.facets[0]?.subject?.entityId === 'entity.home_system') {
      subjectEntityId = 'entity.home_system';
    }
  }
  return verifyLegacyCandidateGrammarAgreement(message, {
    requestClass: 'DATA_QUERY',
    subjectEntityId,
    polarity: spec.polarity ?? 'POSITIVE',
    projection: spec.projection,
  }, options);
}

export function savedResultsGrammarAgreement(
  message: string,
  projection: 'LIST' | 'COUNT' = 'LIST',
): LegacyGrammarAgreement {
  return verifyLegacyCandidateGrammarAgreement(message, {
    requestClass: 'CAPABILITY',
    subjectEntityId: 'entity.saved_result',
    jobMatch: 'job.saved_results.lookup',
    polarity: 'POSITIVE',
    projection,
  });
}

export interface LegacySemanticComparisonInput {
  readonly prompt: string;
  readonly legacyOperationId: string;
  readonly legacyQueryEntity?: string | null;
  readonly legacyQueryProjection?: 'DETAIL' | 'LIST' | 'COUNT' | 'EXISTS' | null;
  readonly legacyPointEntity?: string | null;
  readonly legacyPointField?: string | null;
  readonly typedMatched: boolean;
  readonly typedDomainId: string | null;
  readonly typedRequestClass: 'DATA_QUERY' | 'CAPABILITY' | 'COMMAND' | null;
  readonly typedSubjectEntityIds: readonly string[];
  readonly typedSemanticRelationIds: readonly string[];
  readonly typedJobMatch: string | null;
  readonly typedPolarity: 'POSITIVE' | 'NEGATIVE' | 'UNKNOWN' | null;
  readonly typedProjection: string | null;
  readonly typedMaterialFilterIds?: readonly string[];
  readonly typedRequiredSlots?: readonly string[];
}

export interface LegacySemanticComparisonOutcome {
  readonly status: 'AGREED' | 'DISAGREED_COLLISION' | 'GRAMMAR_EXPANDED' | 'BOTH_UNMATCHED';
  readonly matchedLegacyProducer: 'QUERY_PLAN' | 'DATA_POINT' | 'OPERATION_ROUTER' | 'NONE';
  readonly dimensionsCompared: readonly string[];
  readonly mismatches: readonly string[];
  readonly reasonCode: string;
}

const DOMAIN_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'domain.inventory': 'domain.inventory_appliances',
  'domain.maintenance': 'domain.maintenance_tasks',
  'domain.warranties_coverage': 'domain.warranties_protection',
  'domain.insurance_policies': 'domain.insurance_coverage',
  'domain.claims': 'domain.claims_resolutions',
  'domain.buyer_journey': 'domain.buyer_readiness',
});

const SUBJECT_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'entity.property_tax_bill': 'entity.tax_bill',
});

function canonicalAgreementDomain(domainId: string | null | undefined): string | null {
  if (!domainId) return null;
  return DOMAIN_ALIASES[domainId] ?? domainId;
}

function canonicalAgreementSubject(subjectId: string): string {
  return SUBJECT_ALIASES[subjectId] ?? subjectId;
}

interface LegacyOperationSemanticSpec {
  readonly domainIds: readonly string[];
  readonly requestClass: 'DATA_QUERY' | 'CAPABILITY' | 'COMMAND';
  readonly subjectEntityIds: readonly string[];
  readonly jobMatches: readonly string[];
  readonly polarity: 'POSITIVE' | 'NEGATIVE';
  readonly projections: readonly ('DETAIL' | 'LIST' | 'COUNT' | 'EXISTS' | 'ANALYSIS')[];
  readonly requiredMaterialFilters?: readonly string[];
  readonly requiredSlots?: readonly string[];
}

const LEGACY_OPERATION_SEMANTIC_SPECS: Readonly<Record<string, LegacyOperationSemanticSpec>> = Object.freeze({
  MAINTENANCE_STATUS: {
    domainIds: ['domain.maintenance_tasks'],
    requestClass: 'CAPABILITY',
    subjectEntityIds: ['entity.maintenance_task'],
    jobMatches: ['job.maintenance.list', 'job.maintenance.due_window', 'job.maintenance.status', 'query.maintenance_task.filter'],
    polarity: 'POSITIVE',
    projections: ['LIST', 'DETAIL', 'COUNT'],
  },
  MAINTENANCE_TASK_CREATE: {
    domainIds: ['domain.maintenance_tasks'],
    requestClass: 'COMMAND',
    subjectEntityIds: ['entity.maintenance_task'],
    jobMatches: ['job.maintenance.create'],
    polarity: 'POSITIVE',
    projections: ['LIST', 'DETAIL'],
  },
  HVAC_DECISION_START: {
    domainIds: ['domain.inventory_appliances'],
    requestClass: 'CAPABILITY',
    subjectEntityIds: ['entity.inventory_item', 'entity.home_system'],
    jobMatches: ['job.inventory.replacement_guidance'],
    polarity: 'POSITIVE',
    projections: ['ANALYSIS', 'DETAIL', 'LIST'],
  },
  INVENTORY_LOOKUP: {
    domainIds: ['domain.inventory_appliances'],
    requestClass: 'DATA_QUERY',
    subjectEntityIds: ['entity.inventory_item'],
    jobMatches: ['query.inventory_item.list', 'job.inventory.lookup'],
    polarity: 'POSITIVE',
    projections: ['LIST', 'DETAIL', 'COUNT'],
  },
  INCIDENT_CLAIM_STATUS: {
    domainIds: ['domain.claims_resolutions'],
    requestClass: 'DATA_QUERY',
    subjectEntityIds: ['entity.claim'],
    jobMatches: ['query.claim.open_status', 'query.claim.filter', 'job.claims.list'],
    polarity: 'POSITIVE',
    projections: ['LIST', 'DETAIL', 'COUNT'],
  },
  BUYER_DOCUMENT_READINESS: {
    domainIds: ['domain.buyer_readiness'],
    requestClass: 'DATA_QUERY',
    subjectEntityIds: ['entity.buyer_checklist', 'entity.buyer_task'],
    jobMatches: ['job.buyer.document_readiness', 'query.buyer_task.before_closing'],
    polarity: 'POSITIVE',
    projections: ['LIST', 'DETAIL', 'EXISTS'],
  },
  BUYER_DEADLINES: {
    domainIds: ['domain.buyer_readiness'],
    requestClass: 'DATA_QUERY',
    subjectEntityIds: ['entity.buyer_task', 'entity.buyer_checklist'],
    jobMatches: ['query.buyer_task.before_closing', 'job.buyer.deadlines'],
    polarity: 'POSITIVE',
    projections: ['LIST', 'DETAIL'],
  },
  PERMIT_TRACKER_STATUS: {
    domainIds: ['domain.projects_quotes_vendors'],
    requestClass: 'DATA_QUERY',
    subjectEntityIds: ['entity.project', 'entity.permit'],
    jobMatches: ['query.project.needs_permit', 'query.permit.filter'],
    polarity: 'POSITIVE',
    projections: ['LIST', 'DETAIL'],
  },
  QUOTE_COMPARISON_REVIEW: {
    domainIds: ['domain.projects_quotes_vendors'],
    requestClass: 'CAPABILITY',
    subjectEntityIds: ['entity.contractor_quote', 'entity.quote'],
    jobMatches: ['job.projects.quote_comparison'],
    polarity: 'POSITIVE',
    projections: ['LIST', 'ANALYSIS', 'DETAIL'],
  },
  RECALL_REVIEW: {
    domainIds: ['domain.risks_recalls_inspections'],
    requestClass: 'DATA_QUERY',
    subjectEntityIds: ['entity.recall', 'entity.recall_match', 'entity.inventory_item'],
    jobMatches: ['job.risk.recall_review'],
    polarity: 'POSITIVE',
    projections: ['LIST', 'DETAIL', 'EXISTS'],
  },
  SAVED_RESULTS: {
    domainIds: ['domain.account_household_preferences'],
    requestClass: 'CAPABILITY',
    subjectEntityIds: ['entity.saved_result'],
    jobMatches: ['job.saved_results.lookup'],
    polarity: 'POSITIVE',
    projections: ['LIST', 'COUNT'],
  },
  PROPERTY_SUMMARY: {
    domainIds: ['domain.property_profile'],
    requestClass: 'CAPABILITY',
    subjectEntityIds: ['entity.property'],
    jobMatches: ['job.property.summary'],
    polarity: 'POSITIVE',
    projections: ['DETAIL', 'LIST'],
  },
});

const ENTITY_TO_EXPECTED_DOMAINS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  Property: ['domain.property_profile'],
  InventoryRoom: ['domain.property_profile', 'domain.inventory_appliances'],
  InventoryItem: ['domain.inventory_appliances', 'domain.warranties_protection'],
  HomeSystem: ['domain.inventory_appliances', 'domain.warranties_protection'],
  PropertyMaintenanceTask: ['domain.maintenance_tasks'],
  Warranty: ['domain.warranties_protection'],
  InsurancePolicy: ['domain.insurance_coverage'],
  PropertyTaxBillRecord: ['domain.ownership_costs_finance'],
  PropertyTaxAssessmentRecord: ['domain.ownership_costs_finance'],
  HomeReserveFund: ['domain.ownership_costs_finance'],
  PropertyRecord: ['domain.documents_records'],
  PropertyRecordVersion: ['domain.documents_records'],
  Document: ['domain.documents_records'],
  HomeEvent: ['domain.home_timeline_history'],
  HomeBuyerTask: ['domain.buyer_readiness'],
  HomeBuyerChecklist: ['domain.buyer_readiness'],
  SaleReadinessItem: ['domain.seller_preparation'],
  Claim: ['domain.claims_resolutions'],
});

const COMPARED_DIMENSIONS = Object.freeze([
  'semanticJob',
  'domain',
  'subjectEntity',
  'relation',
  'polarity',
  'projection',
  'materialFilters',
  'requiredSlots',
]);

/**
 * FR-EVAL-3 #29: Compares legacy recognizer candidates against the typed semantic
 * plan across semantic job, domain, subject entity, relation, polarity, projection,
 * material filters, and required slots (not mere co-occurrence).
 */
export function evaluateLegacyVsSemanticGrammarAgreement(
  input: LegacySemanticComparisonInput,
): LegacySemanticComparisonOutcome {
  const matchedLegacyProducer: LegacySemanticComparisonOutcome['matchedLegacyProducer'] =
    input.legacyQueryEntity
        ? 'QUERY_PLAN'
        : input.legacyPointEntity
          ? 'DATA_POINT'
          : input.legacyOperationId !== 'GROUNDED_GUIDANCE' && input.legacyOperationId !== 'DATA_POINT_READ'
            ? 'OPERATION_ROUTER'
            : 'NONE';

  if (matchedLegacyProducer === 'NONE') {
    return input.typedMatched
      ? {
          status: 'GRAMMAR_EXPANDED',
          matchedLegacyProducer: 'NONE',
          dimensionsCompared: COMPARED_DIMENSIONS,
          mismatches: [],
          reasonCode: 'GRAMMAR_EXPANDED_OVER_LEGACY',
        }
      : {
          status: 'BOTH_UNMATCHED',
          matchedLegacyProducer: 'NONE',
          dimensionsCompared: COMPARED_DIMENSIONS,
          mismatches: [],
          reasonCode: 'BOTH_UNMATCHED',
        };
  }

  if (!input.typedMatched) {
    return {
      status: 'DISAGREED_COLLISION',
      matchedLegacyProducer,
      dimensionsCompared: COMPARED_DIMENSIONS,
      mismatches: ['typed_plan_unmatched'],
      reasonCode: 'LEGACY_MATCHED_WITHOUT_TYPED_PLAN',
    };
  }

  const mismatches: string[] = [];
  const normalizedDomain = canonicalAgreementDomain(input.typedDomainId);
  const normalizedSubjects = input.typedSubjectEntityIds.map(canonicalAgreementSubject);

  if (matchedLegacyProducer === 'QUERY_PLAN' || matchedLegacyProducer === 'DATA_POINT') {
    const prismaEntity = input.legacyQueryEntity ?? input.legacyPointEntity ?? '';
    const expectedSubject = PRISMA_ENTITY_TO_BASIC_READ_SUBJECT[prismaEntity];
    const expectedDomains = ENTITY_TO_EXPECTED_DOMAINS[prismaEntity] ?? [];
    const expectedProj =
      matchedLegacyProducer === 'QUERY_PLAN'
        ? input.legacyQueryProjection ?? 'LIST'
        : 'DETAIL';

    if (expectedSubject && !normalizedSubjects.includes(expectedSubject)) {
      mismatches.push(`subject:${input.typedSubjectEntityIds.join(',') || 'none'}!==${expectedSubject}`);
    }
    if (expectedDomains.length > 0 && (!normalizedDomain || !expectedDomains.includes(normalizedDomain))) {
      mismatches.push(`domain:${input.typedDomainId ?? 'none'}notin[${expectedDomains.join(',')}]`);
    }
    if (input.typedPolarity && input.typedPolarity !== 'POSITIVE') {
      mismatches.push(`polarity:${input.typedPolarity}!==POSITIVE`);
    }
    if (input.typedProjection && input.typedProjection !== expectedProj) {
      mismatches.push(`projection:${input.typedProjection}!==${expectedProj}`);
    }
    if (matchedLegacyProducer === 'DATA_POINT' && input.typedJobMatch?.includes('compare')) {
      mismatches.push(`semanticJob:scalar_data_point(${input.legacyPointField ?? 'unknown'})!==${input.typedJobMatch}`);
    }
    if ((input.typedMaterialFilterIds?.length ?? 0) > 0 && matchedLegacyProducer === 'DATA_POINT' && !input.legacyPointField) {
      mismatches.push('materialFilters:unrepresented_in_scalar_data_point');
    }
    const pointAgreement = dataPointReadGrammarAgreement(input.prompt, {
      prismaEntity,
      projection: expectedProj,
      polarity: 'POSITIVE',
    });
    if (pointAgreement && pointAgreement.outcome !== 'AGREE' && (!normalizedDomain || !expectedDomains.includes(normalizedDomain))) {
      mismatches.push(`grammar:${pointAgreement.reasonCode}`);
    }
  } else if (matchedLegacyProducer === 'OPERATION_ROUTER') {
    const spec = LEGACY_OPERATION_SEMANTIC_SPECS[input.legacyOperationId];
    if (!spec) {
      mismatches.push(`unmapped_legacy_operation:${input.legacyOperationId}`);
    } else {
      if (!normalizedDomain || !spec.domainIds.includes(normalizedDomain)) {
        mismatches.push(`domain:${input.typedDomainId ?? 'none'}!==${spec.domainIds.join('|')}`);
      }
      if (input.typedRequestClass && input.typedRequestClass !== spec.requestClass) {
        mismatches.push(`requestClass:${input.typedRequestClass}!==${spec.requestClass}`);
      }
      if (!normalizedSubjects.some((id) => spec.subjectEntityIds.includes(id))) {
        mismatches.push(`subject:${input.typedSubjectEntityIds.join(',') || 'none'}!==${spec.subjectEntityIds.join('|')}`);
      }
      if (!input.typedJobMatch || !spec.jobMatches.includes(input.typedJobMatch)) {
        mismatches.push(`semanticJob:${input.typedJobMatch ?? 'none'}!==${spec.jobMatches.join('|')}`);
      }
      if (input.typedPolarity && input.typedPolarity !== spec.polarity) {
        mismatches.push(`polarity:${input.typedPolarity}!==${spec.polarity}`);
      }
      if (input.typedProjection && !spec.projections.includes(input.typedProjection as 'DETAIL' | 'LIST' | 'COUNT' | 'EXISTS' | 'ANALYSIS')) {
        mismatches.push(`projection:${input.typedProjection}!==${spec.projections.join('|')}`);
      }
      if (spec.requiredMaterialFilters?.length) {
        const filters = input.typedMaterialFilterIds ?? [];
        if (!spec.requiredMaterialFilters.every((f) => filters.includes(f))) {
          mismatches.push(`materialFilters:missing_${spec.requiredMaterialFilters.join(',')}`);
        }
      }
      if (spec.requiredSlots?.length) {
        const slots = input.typedRequiredSlots ?? [];
        if (!spec.requiredSlots.every((s) => slots.includes(s))) {
          mismatches.push(`requiredSlots:missing_${spec.requiredSlots.join(',')}`);
        }
      }
    }
  }

  return mismatches.length === 0
    ? {
        status: 'AGREED',
        matchedLegacyProducer,
        dimensionsCompared: COMPARED_DIMENSIONS,
        mismatches: [],
        reasonCode: 'LEGACY_AND_TYPED_SEMANTIC_AGREE',
      }
    : {
        status: 'DISAGREED_COLLISION',
        matchedLegacyProducer,
        dimensionsCompared: COMPARED_DIMENSIONS,
        mismatches,
        reasonCode: `LEGACY_GRAMMAR_SEMANTIC_MISMATCH:${mismatches[0]}`,
      };
}
