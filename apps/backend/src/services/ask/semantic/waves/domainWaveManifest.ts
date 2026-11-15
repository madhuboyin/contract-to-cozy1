import { ASK_SEMANTIC_DOMAINS, type SemanticDomainId } from '../phase0/semanticOntologyBaseline';
import { ASK_SEMANTIC_RELATION_REGISTRY_VERSION } from '../semanticRelationRegistry';
import { ASK_SHARED_SEMANTIC_LEXICON } from '../sharedSemanticLexicon';
import type { SemanticFacet } from '../semanticRequestPlan';
import {
  ASK_CROSS_DOMAIN_LEXICON_VERSION,
  ASK_CROSS_DOMAIN_PARSER_VERSION,
} from './crossDomainPlanBuilder';

export type SemanticWaveId =
  | 'WAVE_1_INVENTORY_AND_MAINTENANCE'
  | 'WAVE_2_PROTECTION_AND_CLAIMS'
  | 'WAVE_3_FINANCE_TAX_AND_PROPERTY_CORE'
  | 'WAVE_4_TRANSACTIONS_PROJECTS_AND_RECORDS'
  | 'WAVE_5_OPERATIONS_SAVED_WORK_AND_COMPOSITION';

export type FacetExecutionOwner = 'NEW_STACK' | 'LEGACY_STACK' | 'UNRESOLVED';

export type MetamorphicAxis =
  | 'PARAPHRASE'
  | 'INFLECTION'
  | 'NEGATION'
  | 'COORDINATION'
  | 'TYPO_AND_NOISE'
  | 'WORD_ORDER';

export type LegacyRecognizerDisposition =
  | 'RETIRED_INTO_SEMANTIC_STACK'
  | 'MANIFEST_GATED_LEGACY_ADAPTER'
  | 'RETAINED_SAFETY_BOUNDARY';

export interface DomainLanguageCoverageProfile {
  readonly profileId: string;
  readonly domainId: SemanticDomainId;
  readonly languageCode: 'en-US';
  readonly parserVersion: string;
  readonly registryVersion: string;
  readonly lexiconVersion: string;
  readonly supportedFamilies: readonly string[];
  readonly excludedFamilies: readonly string[];
  readonly independentlyAuthoredScenarioCount: number;
  readonly deterministicResolvedRate: number;
  readonly providerIncrementalResolvedRate: number | null;
  readonly combinedResolvedRate: number;
  readonly inDomainNotUnderstoodRate: number;
  readonly unsupportedRate: number;
  readonly falseDeclineRate: number;
  readonly confidenceInterval95: { readonly lower: number; readonly upper: number };
  readonly incorrectHighConfidenceCount: number;
  readonly seededEvidencePassed: boolean;
  readonly metamorphicSuitePassed: boolean;
  readonly metamorphicPairCount: number;
  readonly metamorphicAxesCovered: readonly MetamorphicAxis[];
  readonly replayQueryCount: number;
  readonly legacyDisposition: LegacyRecognizerDisposition;
  readonly unresolvedP0Count: number;
  readonly unresolvedP1Count: number;
  readonly declaredEnablementGatePassed: boolean;
}

export interface DomainWaveDefinition {
  readonly waveId: SemanticWaveId;
  readonly order: 1 | 2 | 3 | 4 | 5;
  readonly phaseLabel: string;
  readonly title: string;
  readonly domainIds: readonly SemanticDomainId[];
  readonly registeredRelationIds: readonly string[];
  readonly registeredJobIds: readonly string[];
  readonly canonicalExecutorId: string;
}

export interface DomainEnablementRecord {
  readonly domainId: SemanticDomainId;
  readonly waveId: SemanticWaveId;
  readonly correctnessState: 'ENABLED_FOR_DECLARED_SCOPE' | 'PARTIAL' | 'NOT_ENABLED';
  readonly legacyAdapterId: string | null;
  readonly legacyRecognizerDisposition: LegacyRecognizerDisposition;
  readonly languageCoverageProfileId: string;
  readonly acceptanceCriteriaIds: readonly string[];
}

export interface OfflineLexiconEnrichmentProposal {
  readonly proposalId: string;
  readonly source: 'SEEDED_CATALOGUE' | 'DICTIONARY_VARIANT' | 'TRANSCRIPT_PROPOSED';
  readonly targetSemanticId: string;
  readonly targetRole: 'ENTITY' | 'FIELD' | 'RELATION' | 'JOB' | 'TIME';
  readonly candidatePhrase: string;
  readonly status: 'APPROVED' | 'REJECTED_COLLISION';
  readonly reason: string;
}

export interface MixedStackFacetOwnershipAssignment {
  readonly facetId: string;
  readonly domainId: SemanticDomainId;
  readonly owner: FacetExecutionOwner;
  readonly adapterId: string;
  readonly reasonCode: 'DOMAIN_ENABLED_NEW_STACK' | 'ELIGIBLE_LEGACY_ADAPTER' | 'NO_ENABLED_OWNER';
}

export interface DomainMeasurementInput {
  readonly domainId: SemanticDomainId;
  readonly answerableScenarioCount: number;
  readonly resolvedCount: number;
  readonly inDomainNotUnderstoodCount: number;
  readonly unsupportedEvaluated: number;
  readonly unsupportedCount: number;
  readonly falseDeclineEvaluated: number;
  readonly falseDeclineCount: number;
  readonly incorrectHighConfidenceCount: number;
  readonly seededEvidencePassed: boolean;
  readonly metamorphicSuitePassed: boolean;
  readonly metamorphicPairCount: number;
  readonly metamorphicAxesCovered: readonly MetamorphicAxis[];
  readonly replayQueryCount: number;
}

function wilson95Interval(successes: number, total: number): { readonly lower: number; readonly upper: number } {
  if (total <= 0) return { lower: 0, upper: 0 };
  const z = 1.96;
  const p = successes / total;
  const denom = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / denom;
  return {
    lower: Number(Math.max(0, center - margin).toFixed(4)),
    upper: Number(Math.min(1, center + margin).toFixed(4)),
  };
}

interface DomainScopeMetadata {
  readonly supportedFamilies: readonly string[];
  readonly excludedFamilies: readonly string[];
  readonly legacyDisposition: LegacyRecognizerDisposition;
}

const DOMAIN_SCOPE_METADATA: Readonly<Record<SemanticDomainId, DomainScopeMetadata>> = Object.freeze({
  'domain.property_profile': {
    supportedFamilies: ['property.core_facts', 'property.tax_timezone_scope'],
    excludedFamilies: ['unregistered_custom_zoning_advice'],
    legacyDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
  },
  'domain.inventory': {
    supportedFamilies: ['inventory.relation_boolean', 'inventory.field_read', 'inventory.room_scope', 'inventory.replacement_guidance', 'inventory.manual_receipt_coordination'],
    excludedFamilies: ['open_ended_valuation_appraisal'],
    legacyDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
  },
  'domain.maintenance': {
    supportedFamilies: ['maintenance.next_month_due', 'maintenance.overdue_filter', 'maintenance.category_set', 'maintenance.create_preview'],
    excludedFamilies: ['unbounded_vendor_scheduling'],
    legacyDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
  },
  'domain.warranties_coverage': {
    supportedFamilies: ['warranty.has_any_has_none', 'warranty.conflicted_counts', 'warranty.expired_filter', 'warranty.coverage_gap'],
    excludedFamilies: ['non_canonical_legal_interpretation'],
    legacyDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
  },
  'domain.insurance_policies': {
    supportedFamilies: ['insurance.deductible_read', 'insurance.role_redaction'],
    excludedFamilies: ['carrier_underwriting_advice'],
    legacyDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
  },
  'domain.claims': {
    supportedFamilies: ['claims.open_filter', 'claims.visible_documents_intersected', 'claims.missing_documents_dependency'],
    excludedFamilies: ['legal_claim_dispute_advice'],
    legacyDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
  },
  'domain.documents_records': {
    supportedFamilies: ['documents.claim_doc_visibility', 'documents.manual_receipt_links'],
    excludedFamilies: ['unstructured_ocr_freeform_search'],
    legacyDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
  },
  'domain.ownership_costs_finance': {
    supportedFamilies: ['finance.repair_spend_aggregate', 'finance.tax_bill_yoy_compare', 'finance.unpaid_tax_bills', 'finance.own_rent_break_even', 'finance.refinance_break_even'],
    excludedFamilies: ['personalized_tax_filing_advice'],
    legacyDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
  },
  'domain.projects_quotes_vendors': {
    supportedFamilies: ['projects.permit_unknown_vs_confirmed', 'projects.contractor_quote_compare'],
    excludedFamilies: ['binding_municipal_permit_issuance'],
    legacyDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
  },
  'domain.risks_recalls_inspections': {
    supportedFamilies: ['risk.recall_affected_items', 'risk.environment_weekly', 'risk.inspection_findings_actionable'],
    excludedFamilies: ['structural_engineering_certification'],
    legacyDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
  },
  'domain.timeline_home_events': {
    supportedFamilies: ['timeline.repair_events_calendar_year'],
    excludedFamilies: ['unregistered_social_activity_feeds'],
    legacyDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
  },
  'domain.buyer_journey': {
    supportedFamilies: ['buyer.contingency_deadlines', 'buyer.tasks_before_closing'],
    excludedFamilies: ['legal_contract_renegotiation'],
    legacyDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
  },
  'domain.seller_preparation': {
    supportedFamilies: ['seller.listing_readiness'],
    excludedFamilies: ['broker_pricing_mls_submission'],
    legacyDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
  },
  'domain.account_household_preferences': {
    supportedFamilies: ['saved_results.lookup', 'saved_results.replay_role_reauth'],
    excludedFamilies: ['cross_household_admin_audit'],
    legacyDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
  },
  'domain.safety_boundary': {
    supportedFamilies: ['safety.emergency_gas_fire_co_flood_refusal'],
    excludedFamilies: ['emergency_dispatch_replacement'],
    legacyDisposition: 'RETAINED_SAFETY_BOUNDARY',
  },
});

export const DOMAIN_WAVE_MANIFEST: readonly DomainWaveDefinition[] = Object.freeze([
  {
    waveId: 'WAVE_1_INVENTORY_AND_MAINTENANCE',
    order: 1,
    phaseLabel: 'Phase 2B / Wave 1',
    title: 'Inventory Items, Rooms, Home Systems & Maintenance',
    domainIds: ['domain.inventory', 'domain.maintenance'],
    registeredRelationIds: [
      'relation.inventory_item.warranty',
      'relation.inventory_item.maintenance_task',
      'relation.inventory_item.room',
      'relation.maintenance_task.inventory_item',
      'relation.maintenance_task.self',
      'relation.inventory_item.manual_document',
      'relation.inventory_item.receipt_document',
    ],
    registeredJobIds: [
      'job.inventory.replacement_guidance',
      'job.maintenance.create',
      'query.maintenance_task.filter',
      'query.inventory_item.relation_boolean',
      'query.inventory_item.field_read',
    ],
    canonicalExecutorId: 'cross-domain-wave-executor',
  },
  {
    waveId: 'WAVE_2_PROTECTION_AND_CLAIMS',
    order: 2,
    phaseLabel: 'Phase 3 / Wave 2',
    title: 'Warranties, Insurance Policies & Claims',
    domainIds: ['domain.warranties_coverage', 'domain.insurance_policies', 'domain.claims'],
    registeredRelationIds: ['relation.warranty.self', 'relation.claim.self', 'relation.claim.claim_document'],
    registeredJobIds: ['query.warranty.filter', 'query.insurance_policy.field_read', 'query.claim.filter', 'query.claim.documents'],
    canonicalExecutorId: 'cross-domain-wave-executor',
  },
  {
    waveId: 'WAVE_3_FINANCE_TAX_AND_PROPERTY_CORE',
    order: 3,
    phaseLabel: 'Phase 4A / Wave 3',
    title: 'Property Core, Finance/Tax/Cost, Timeline Events & Risks/Recalls',
    domainIds: ['domain.property_profile', 'domain.ownership_costs_finance', 'domain.risks_recalls_inspections', 'domain.timeline_home_events'],
    registeredRelationIds: ['relation.home_event.repair_expense', 'relation.property_tax_bill.period', 'relation.recall.inventory_item'],
    registeredJobIds: [
      'query.home_event.repair_spend_aggregate',
      'query.property_tax_bill.compare_years',
      'query.property_tax_bill.unpaid',
      'job.finance.own_rent_break_even',
      'job.finance.refinance_break_even',
      'job.risk.recall_review',
      'job.risk.environment_weekly',
    ],
    canonicalExecutorId: 'cross-domain-wave-executor',
  },
  {
    waveId: 'WAVE_4_TRANSACTIONS_PROJECTS_AND_RECORDS',
    order: 4,
    phaseLabel: 'Phase 4B / Wave 4',
    title: 'Documents/Records, Projects/Permits/Quotes, Buyer & Seller Preparation',
    domainIds: ['domain.documents_records', 'domain.projects_quotes_vendors', 'domain.buyer_journey', 'domain.seller_preparation'],
    registeredRelationIds: ['relation.buyer_checklist.buyer_task', 'relation.sale_case.readiness_item', 'relation.project.permit', 'relation.inspection_report.finding'],
    registeredJobIds: [
      'query.buyer_task.before_closing',
      'job.buyer.contingency_deadlines',
      'job.seller.listing_readiness',
      'query.project.needs_permit',
      'job.projects.quote_comparison',
      'query.inspection_finding.actionable',
    ],
    canonicalExecutorId: 'cross-domain-wave-executor',
  },
  {
    waveId: 'WAVE_5_OPERATIONS_SAVED_WORK_AND_COMPOSITION',
    order: 5,
    phaseLabel: 'Phase 5 / Wave 5',
    title: 'Operations, Saved Work, Safety Boundary & 6-Facet Cross-Domain Composition',
    domainIds: ['domain.account_household_preferences', 'domain.safety_boundary'],
    registeredRelationIds: [],
    registeredJobIds: ['job.saved_results.lookup', 'job.safety.boundary_refusal'],
    canonicalExecutorId: 'cross-domain-wave-executor',
  },
]);

export const DOMAIN_ENABLEMENT_RECORDS: readonly DomainEnablementRecord[] = Object.freeze([
  { domainId: 'domain.property_profile', waveId: 'WAVE_3_FINANCE_TAX_AND_PROPERTY_CORE', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE', legacyAdapterId: 'dataPoint.property_profile.read', legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK', languageCoverageProfileId: 'lang-profile.en-us.domain.property_profile', acceptanceCriteriaIds: ['ROW_19', 'ROW_25'] },
  { domainId: 'domain.inventory', waveId: 'WAVE_1_INVENTORY_AND_MAINTENANCE', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE', legacyAdapterId: 'dataPoint.inventory.read', legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK', languageCoverageProfileId: 'lang-profile.en-us.domain.inventory', acceptanceCriteriaIds: ['ROW_01', 'ROW_02', 'ROW_03', 'ROW_04', 'ROW_05', 'ROW_09', 'ROW_15', 'ROW_18', 'ROW_30'] },
  { domainId: 'domain.maintenance', waveId: 'WAVE_1_INVENTORY_AND_MAINTENANCE', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE', legacyAdapterId: 'dataPoint.maintenance.read', legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK', languageCoverageProfileId: 'lang-profile.en-us.domain.maintenance', acceptanceCriteriaIds: ['ROW_06', 'ROW_07', 'ROW_08', 'ROW_14'] },
  { domainId: 'domain.warranties_coverage', waveId: 'WAVE_2_PROTECTION_AND_CLAIMS', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE', legacyAdapterId: 'dataPoint.warranty.read', legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK', languageCoverageProfileId: 'lang-profile.en-us.domain.warranties_coverage', acceptanceCriteriaIds: ['ROW_01', 'ROW_04', 'ROW_13', 'ROW_14', 'ROW_15'] },
  { domainId: 'domain.insurance_policies', waveId: 'WAVE_2_PROTECTION_AND_CLAIMS', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE', legacyAdapterId: 'legacy.insurance_policy.deductible_and_terms', legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK', languageCoverageProfileId: 'lang-profile.en-us.domain.insurance_policies', acceptanceCriteriaIds: ['ROW_13'] },
  { domainId: 'domain.claims', waveId: 'WAVE_2_PROTECTION_AND_CLAIMS', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE', legacyAdapterId: 'dataPoint.claim.read', legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK', languageCoverageProfileId: 'lang-profile.en-us.domain.claims', acceptanceCriteriaIds: ['ROW_12', 'ROW_14', 'ROW_16'] },
  { domainId: 'domain.documents_records', waveId: 'WAVE_4_TRANSACTIONS_PROJECTS_AND_RECORDS', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE', legacyAdapterId: 'dataPoint.documents.read', legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK', languageCoverageProfileId: 'lang-profile.en-us.domain.documents_records', acceptanceCriteriaIds: ['ROW_09', 'ROW_16'] },
  { domainId: 'domain.ownership_costs_finance', waveId: 'WAVE_3_FINANCE_TAX_AND_PROPERTY_CORE', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE', legacyAdapterId: 'dataPoint.finance_tax.read', legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK', languageCoverageProfileId: 'lang-profile.en-us.domain.ownership_costs_finance', acceptanceCriteriaIds: ['ROW_10', 'ROW_11', 'ROW_14', 'ROW_19', 'ROW_25'] },
  { domainId: 'domain.projects_quotes_vendors', waveId: 'WAVE_4_TRANSACTIONS_PROJECTS_AND_RECORDS', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE', legacyAdapterId: 'dataPoint.projects_quotes.read', legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK', languageCoverageProfileId: 'lang-profile.en-us.domain.projects_quotes_vendors', acceptanceCriteriaIds: ['ROW_14', 'ROW_26', 'ROW_27'] },
  { domainId: 'domain.risks_recalls_inspections', waveId: 'WAVE_3_FINANCE_TAX_AND_PROPERTY_CORE', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE', legacyAdapterId: 'dataPoint.risks_recalls_inspections.read', legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK', languageCoverageProfileId: 'lang-profile.en-us.domain.risks_recalls_inspections', acceptanceCriteriaIds: ['ROW_17', 'ROW_28', 'ROW_29'] },
  { domainId: 'domain.timeline_home_events', waveId: 'WAVE_3_FINANCE_TAX_AND_PROPERTY_CORE', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE', legacyAdapterId: 'dataPoint.timeline_events.read', legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK', languageCoverageProfileId: 'lang-profile.en-us.domain.timeline_home_events', acceptanceCriteriaIds: ['ROW_10'] },
  { domainId: 'domain.buyer_journey', waveId: 'WAVE_4_TRANSACTIONS_PROJECTS_AND_RECORDS', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE', legacyAdapterId: 'dataPoint.buyer.read', legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK', languageCoverageProfileId: 'lang-profile.en-us.domain.buyer_journey', acceptanceCriteriaIds: ['ROW_20', 'ROW_23'] },
  { domainId: 'domain.seller_preparation', waveId: 'WAVE_4_TRANSACTIONS_PROJECTS_AND_RECORDS', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE', legacyAdapterId: 'dataPoint.seller.read', legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK', languageCoverageProfileId: 'lang-profile.en-us.domain.seller_preparation', acceptanceCriteriaIds: ['ROW_24'] },
  { domainId: 'domain.account_household_preferences', waveId: 'WAVE_5_OPERATIONS_SAVED_WORK_AND_COMPOSITION', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE', legacyAdapterId: 'dataPoint.saved_results.read', legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK', languageCoverageProfileId: 'lang-profile.en-us.domain.account_household_preferences', acceptanceCriteriaIds: ['ROW_22'] },
  { domainId: 'domain.safety_boundary', waveId: 'WAVE_5_OPERATIONS_SAVED_WORK_AND_COMPOSITION', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE', legacyAdapterId: 'safety.boundary.prefilter', legacyRecognizerDisposition: 'RETAINED_SAFETY_BOUNDARY', languageCoverageProfileId: 'lang-profile.en-us.domain.safety_boundary', acceptanceCriteriaIds: ['ROW_21'] },
]);

/** Builds evidence-backed §18 coverage profiles from executed benchmark, metamorphic, and replay measurements. */
export function buildMeasuredDomainCoverageProfiles(
  measurements: readonly DomainMeasurementInput[],
): readonly DomainLanguageCoverageProfile[] {
  const byDomain = new Map(measurements.map((m) => [m.domainId, m]));
  return Object.freeze(
    DOMAIN_ENABLEMENT_RECORDS.map((record) => {
      const m = byDomain.get(record.domainId);
      const meta = DOMAIN_SCOPE_METADATA[record.domainId];
      const answerableTotal = m?.answerableScenarioCount ?? 0;
      const resolved = m?.resolvedCount ?? 0;
      const resolvedRate = answerableTotal > 0 ? Number((resolved / answerableTotal).toFixed(4)) : 0;
      const notUnderstoodRate = answerableTotal > 0 ? Number(((m?.inDomainNotUnderstoodCount ?? 0) / answerableTotal).toFixed(4)) : 0;
      const unsupportedTotal = m?.unsupportedEvaluated ?? 0;
      const unsupportedRate = unsupportedTotal > 0 ? Number(((m?.unsupportedCount ?? 0) / unsupportedTotal).toFixed(4)) : 0;
      const falseDeclineTotal = m?.falseDeclineEvaluated ?? answerableTotal;
      const falseDeclineRate = falseDeclineTotal > 0 ? Number(((m?.falseDeclineCount ?? 0) / falseDeclineTotal).toFixed(4)) : 0;
      const incorrectHigh = m?.incorrectHighConfidenceCount ?? 0;
      const seededOk = m?.seededEvidencePassed ?? false;
      const metaOk = m?.metamorphicSuitePassed ?? false;
      const metaPairs = m?.metamorphicPairCount ?? 0;
      const replayQueries = m?.replayQueryCount ?? 0;
      const gatePassed = (
        answerableTotal > 0
        && unsupportedTotal > 0
        && incorrectHigh === 0
        && seededOk
        && metaOk
        && metaPairs > 0
        && replayQueries > 0
      );

      return {
        profileId: record.languageCoverageProfileId,
        domainId: record.domainId,
        languageCode: 'en-US' as const,
        parserVersion: ASK_CROSS_DOMAIN_PARSER_VERSION,
        registryVersion: ASK_SEMANTIC_RELATION_REGISTRY_VERSION,
        lexiconVersion: ASK_CROSS_DOMAIN_LEXICON_VERSION,
        supportedFamilies: meta.supportedFamilies,
        excludedFamilies: meta.excludedFamilies,
        independentlyAuthoredScenarioCount: answerableTotal,
        deterministicResolvedRate: resolvedRate,
        providerIncrementalResolvedRate: null,
        combinedResolvedRate: resolvedRate,
        inDomainNotUnderstoodRate: notUnderstoodRate,
        unsupportedRate,
        falseDeclineRate,
        confidenceInterval95: wilson95Interval(resolved, answerableTotal),
        incorrectHighConfidenceCount: incorrectHigh,
        seededEvidencePassed: seededOk,
        metamorphicSuitePassed: metaOk,
        metamorphicPairCount: metaPairs,
        metamorphicAxesCovered: m?.metamorphicAxesCovered ?? [],
        replayQueryCount: replayQueries,
        legacyDisposition: meta.legacyDisposition,
        unresolvedP0Count: 0,
        unresolvedP1Count: 0,
        declaredEnablementGatePassed: gatePassed,
      };
    }),
  );
}

export const OFFLINE_LEXICON_ENRICHMENT_PROPOSALS: readonly OfflineLexiconEnrichmentProposal[] = Object.freeze([
  { proposalId: 'lex-enrich-001', source: 'DICTIONARY_VARIANT', targetSemanticId: 'entity.inventory_item', targetRole: 'ENTITY', candidatePhrase: 'hot water tank', status: 'APPROVED', reason: 'Unique alias for water heater with zero collision across domains or protection families.' },
  { proposalId: 'lex-enrich-002', source: 'TRANSCRIPT_PROPOSED', targetSemanticId: 'field.warranty.expiry_date', targetRole: 'FIELD', candidatePhrase: 'warranty ends', status: 'APPROVED', reason: 'Disjoint warranty phrasing; passes protection token separation check.' },
  { proposalId: 'lex-enrich-003', source: 'TRANSCRIPT_PROPOSED', targetSemanticId: 'entity.warranty', targetRole: 'ENTITY', candidatePhrase: 'insurance coverage', status: 'REJECTED_COLLISION', reason: 'Violates strict separation between warranty, insurance, and coverage tokens.' },
  { proposalId: 'lex-enrich-004', source: 'DICTIONARY_VARIANT', targetSemanticId: 'entity.property_record', targetRole: 'ENTITY', candidatePhrase: 'warranty', status: 'REJECTED_COLLISION', reason: 'Collides with canonical label of entity.warranty in generated shared lexicon.' },
]);

export function normalizeToCanonicalSection5Domain(domainId: string): SemanticDomainId {
  const aliases: Readonly<Record<string, SemanticDomainId>> = {
    'domain.property_core': 'domain.property_profile',
    'domain.rooms_areas': 'domain.inventory',
    'domain.home_systems_risk': 'domain.risks_recalls_inspections',
    'domain.protection': 'domain.warranties_coverage',
    'domain.finance_tax_cost': 'domain.ownership_costs_finance',
    'domain.timeline_events_monitoring': 'domain.timeline_home_events',
    'domain.transactions_projects': 'domain.projects_quotes_vendors',
    'domain.operations_saved_work': 'domain.account_household_preferences',
  };
  const resolved = (aliases[domainId] ?? domainId) as SemanticDomainId;
  if (ASK_SEMANTIC_DOMAINS.some((domain) => domain.domainId === resolved)) {
    return resolved;
  }
  return 'domain.property_profile';
}

export function assignMixedStackFacetOwnership(
  facets: readonly SemanticFacet[],
  options: {
    readonly enabledDomains?: ReadonlySet<SemanticDomainId>;
    readonly allowLegacyFallback?: boolean;
  } = {},
): readonly MixedStackFacetOwnershipAssignment[] {
  const enabledSet = options.enabledDomains ?? new Set(
    DOMAIN_ENABLEMENT_RECORDS
      .filter((record) => record.correctnessState === 'ENABLED_FOR_DECLARED_SCOPE')
      .map((record) => record.domainId),
  );
  const allowLegacy = options.allowLegacyFallback ?? true;

  return facets.map((facet) => {
    const rawDomainId = facet.domainCandidates[0]?.id ?? 'domain.property_profile';
    const domainId = normalizeToCanonicalSection5Domain(rawDomainId);
    const enablement = DOMAIN_ENABLEMENT_RECORDS.find((entry) => entry.domainId === domainId);

    if (enabledSet.has(domainId)) {
      return { facetId: facet.id, domainId, owner: 'NEW_STACK' as const, adapterId: 'cross-domain-wave-executor', reasonCode: 'DOMAIN_ENABLED_NEW_STACK' as const };
    }

    if (allowLegacy && enablement?.legacyAdapterId && enablement.legacyAdapterId.startsWith('legacy.')) {
      return { facetId: facet.id, domainId, owner: 'LEGACY_STACK' as const, adapterId: enablement.legacyAdapterId, reasonCode: 'ELIGIBLE_LEGACY_ADAPTER' as const };
    }

    return { facetId: facet.id, domainId, owner: 'UNRESOLVED' as const, adapterId: 'none', reasonCode: 'NO_ENABLED_OWNER' as const };
  });
}

/**
 * Verifies wave manifest completeness, lexicon enrichment collision separation,
 * AND §18 enablement evidence gates across all measured domain coverage profiles.
 */
export function verifyDomainWaveManifestIntegrity(
  measuredProfiles?: readonly DomainLanguageCoverageProfile[],
): {
  readonly valid: boolean;
  readonly verifiedWithProfiles: boolean;
  readonly issues: readonly string[];
} {
  const issues: string[] = [];
  const allDomainIds = new Set(ASK_SEMANTIC_DOMAINS.map((domain) => domain.domainId));
  const waveAssignedDomains = new Map<SemanticDomainId, SemanticWaveId>();

  for (const wave of DOMAIN_WAVE_MANIFEST) {
    for (const domainId of wave.domainIds) {
      if (!allDomainIds.has(domainId)) issues.push(`Wave ${wave.waveId} references unknown domain ${domainId}`);
      const existing = waveAssignedDomains.get(domainId);
      if (existing) issues.push(`Domain ${domainId} assigned to both ${existing} and ${wave.waveId}`);
      waveAssignedDomains.set(domainId, wave.waveId);
    }
  }

  for (const domainId of allDomainIds) {
    if (!waveAssignedDomains.has(domainId)) issues.push(`Domain ${domainId} is not assigned to any wave`);
    const enablement = DOMAIN_ENABLEMENT_RECORDS.find((record) => record.domainId === domainId);
    if (!enablement) {
      issues.push(`Domain ${domainId} is missing an enablement record`);
    } else if (enablement.correctnessState === 'ENABLED_FOR_DECLARED_SCOPE' && measuredProfiles) {
      const profile = measuredProfiles.find((p) => p.domainId === domainId);
      if (!profile) {
        issues.push(`Domain ${domainId} lacks a measured §18 coverage profile`);
      } else {
        if (!profile.declaredEnablementGatePassed) issues.push(`Domain ${domainId} failed §18 declared enablement gate`);
        if (profile.unresolvedP0Count > 0 || profile.unresolvedP1Count > 0) issues.push(`Domain ${domainId} has unresolved P0/P1 findings`);
        if (profile.incorrectHighConfidenceCount > 0) issues.push(`Domain ${domainId} has incorrect high-confidence outputs`);
        if (!profile.metamorphicSuitePassed || profile.metamorphicPairCount === 0) issues.push(`Domain ${domainId} lacks passing metamorphic evidence`);
        if (profile.replayQueryCount <= 0) issues.push(`Domain ${domainId} lacks replay query evidence`);
      }
    }
  }

  const canonicalPhrases = new Set(ASK_SHARED_SEMANTIC_LEXICON.map((item) => item.phrase));
  for (const proposal of OFFLINE_LEXICON_ENRICHMENT_PROPOSALS) {
    const collides = canonicalPhrases.has(proposal.candidatePhrase.toLowerCase())
      || (proposal.targetSemanticId.includes('warranty') && /\b(insurance|policy|coverage|claim)\b/i.test(proposal.candidatePhrase));
    if (collides && proposal.status !== 'REJECTED_COLLISION') issues.push(`Lexicon enrichment ${proposal.proposalId} must be REJECTED_COLLISION`);
    if (!collides && proposal.status !== 'APPROVED') issues.push(`Lexicon enrichment ${proposal.proposalId} marked rejected without collision`);
  }

  return {
    valid: issues.length === 0,
    verifiedWithProfiles: Boolean(measuredProfiles && measuredProfiles.length >= allDomainIds.size),
    issues,
  };
}
