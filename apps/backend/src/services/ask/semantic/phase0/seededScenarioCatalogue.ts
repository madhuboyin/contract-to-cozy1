/**
 * Phase 0 Bullets 8 & 9 (FR-EVAL-1, §5, §18 Phase 0, §19 Artifacts #17 & #18, §20):
 * - Seeded Property Scenario Archetypes
 * - Independent Semantic Scenario Families Across All 14 Domains
 * - Exact Current Failures Regression Catalogue (labelled CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF)
 */
import { ASK_SEMANTIC_DOMAINS, type SemanticDomainId } from './semanticOntologyBaseline';

export const ASK_SEEDED_SCENARIO_CATALOGUE_VERSION = 'phase0-seeded-scenarios-1.0.0' as const;

export type SeededDataStateVariant = 'POPULATED' | 'EMPTY_OR_MISSING' | 'UNKNOWN' | 'CONFLICTED';

export interface SeededPropertyArchetype {
  readonly archetypeId: string;
  readonly title: string;
  readonly description: string;
  readonly supportedDataStates: readonly SeededDataStateVariant[];
  readonly supportedRoles: readonly ('VIEWER' | 'CONTRIBUTOR' | 'OWNER')[];
  readonly domainsCovered: readonly SemanticDomainId[];
}

export const ASK_SEEDED_PROPERTY_ARCHETYPES: readonly SeededPropertyArchetype[] = Object.freeze([
  {
    archetypeId: 'property.seeded.complete_single_family',
    title: 'Populated single-family home across all 14 domains',
    description: 'Contains verified inventory items, active/expired warranties, homeowner insurance policy, open/overdue maintenance tasks, open water-damage claim with documents, tax bills across 3 years, reserve fund, active project with contractor quotes, recall match, inspection findings, home events, and household roles.',
    supportedDataStates: ['POPULATED'],
    supportedRoles: ['VIEWER', 'CONTRIBUTOR', 'OWNER'],
    domainsCovered: ASK_SEMANTIC_DOMAINS.filter((d) => d.domainId !== 'domain.safety_boundary').map((d) => d.domainId),
  },
  {
    archetypeId: 'property.seeded.missing_and_unknown_states',
    title: 'Home with unrecorded fields and UNKNOWN relationship states',
    description: 'Contains appliances with null serialNumber/modelNumber, items with coverageEvidenceStatus=UNKNOWN_NEEDS_REVIEW, claims missing required documents, and uninitialized reserve fund.',
    supportedDataStates: ['EMPTY_OR_MISSING', 'UNKNOWN'],
    supportedRoles: ['VIEWER', 'CONTRIBUTOR', 'OWNER'],
    domainsCovered: [
      'domain.property_profile',
      'domain.inventory',
      'domain.warranties_coverage',
      'domain.claims',
      'domain.documents_records',
      'domain.ownership_costs_finance',
    ],
  },
  {
    archetypeId: 'property.seeded.conflicted_and_dual_parent_auth',
    title: 'Home with conflicting legacy links, conflicting duplicate scalars, and restricted child documents',
    description: 'Contains InventoryItem rows where warrantyId disagrees with Warranty.inventoryItemId, model disagrees with modelNumber, InsurancePolicy.deductibleAmount disagrees with deductibleCents, and a ClaimDocument referencing an OWNER-only PropertyRecord.',
    supportedDataStates: ['CONFLICTED', 'POPULATED'],
    supportedRoles: ['VIEWER', 'CONTRIBUTOR', 'OWNER'],
    domainsCovered: [
      'domain.inventory',
      'domain.warranties_coverage',
      'domain.insurance_policies',
      'domain.claims',
      'domain.documents_records',
    ],
  },
  {
    archetypeId: 'property.seeded.buyer_and_seller_lifecycle',
    title: 'Home with active buyer acquisition checklist and seller preparation case',
    description: 'Contains HomeBuyerChecklist with open tasks and contingency milestones alongside PropertySaleCase with sale readiness items and cosmetic prep profile.',
    supportedDataStates: ['POPULATED', 'EMPTY_OR_MISSING'],
    supportedRoles: ['VIEWER', 'CONTRIBUTOR', 'OWNER'],
    domainsCovered: ['domain.buyer_journey', 'domain.seller_preparation', 'domain.projects_quotes_vendors'],
  },
] as const);

export interface IndependentSemanticScenarioFamily {
  readonly familyId: string;
  readonly domainId: SemanticDomainId;
  readonly requestClass: 'DATA_QUERY' | 'ANALYSIS_OR_DECISION' | 'WORKFLOW_OR_COMMAND';
  readonly targetKind: 'QUERY' | 'CAPABILITY' | 'COMMAND';
  readonly semanticJobOrRelationId: string;
  readonly canonicalPrompt: string;
  readonly paraphrases: readonly string[];
  readonly adjacentNegatives: readonly string[];
  readonly seededArchetypeIds: readonly string[];
  readonly requiredDataStateVariants: readonly SeededDataStateVariant[];
  readonly expectedPlanSummary: {
    readonly subjectEntityId: string;
    readonly projection: 'DETAIL' | 'LIST' | 'COUNT' | 'EXISTS' | 'AGGREGATE' | 'COMPARE' | 'CAPABILITY_RESULT' | 'COMMAND_PREVIEW';
    readonly polarity: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
    readonly requiredSlots: readonly string[];
  };
}

export const ASK_CROSS_DOMAIN_SEMANTIC_FAMILIES: readonly IndependentSemanticScenarioFamily[] = Object.freeze([
  {
    familyId: 'family.property_profile.roof_and_structure_facts',
    domainId: 'domain.property_profile',
    requestClass: 'DATA_QUERY',
    targetKind: 'QUERY',
    semanticJobOrRelationId: 'field.home.roofReplacementYear',
    canonicalPrompt: 'When was my roof replaced and what is the roof type?',
    paraphrases: ['what year was the roof installed on my house?', 'tell me my home roof type and replacement year'],
    adjacentNegatives: ['should I repair or replace my roof?', 'which roof warranty is expiring?'],
    seededArchetypeIds: ['property.seeded.complete_single_family', 'property.seeded.missing_and_unknown_states'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING'],
    expectedPlanSummary: { subjectEntityId: 'entity.property', projection: 'DETAIL', polarity: 'POSITIVE', requiredSlots: [] },
  },
  {
    familyId: 'family.inventory.warranty_relation_negative',
    domainId: 'domain.inventory',
    requestClass: 'DATA_QUERY',
    targetKind: 'QUERY',
    semanticJobOrRelationId: 'relation.inventory_item.warranty',
    canonicalPrompt: 'list items without warranty',
    paraphrases: [
      "list down all items which don't have warranty",
      'provide details of all items without warranty',
      'how many appliances are not having warranty',
      'which of my appliances have no warranty',
    ],
    adjacentNegatives: ['which items are having warranty', 'what are my warranty coverage gaps?', 'what is my insurance deductible?'],
    seededArchetypeIds: [
      'property.seeded.complete_single_family',
      'property.seeded.missing_and_unknown_states',
      'property.seeded.conflicted_and_dual_parent_auth',
    ],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING', 'UNKNOWN', 'CONFLICTED'],
    expectedPlanSummary: { subjectEntityId: 'entity.inventory_item', projection: 'LIST', polarity: 'NEGATIVE', requiredSlots: [] },
  },
  {
    familyId: 'family.inventory.warranty_relation_positive',
    domainId: 'domain.warranties_coverage',
    requestClass: 'DATA_QUERY',
    targetKind: 'QUERY',
    semanticJobOrRelationId: 'relation.inventory_item.warranty',
    canonicalPrompt: 'which items are having warranty',
    paraphrases: ['which appliances have warranties', 'do any appliances have a warranty?'],
    adjacentNegatives: ['list items without warranty', 'when does my home insurance policy expire?'],
    seededArchetypeIds: ['property.seeded.complete_single_family', 'property.seeded.conflicted_and_dual_parent_auth'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING', 'UNKNOWN', 'CONFLICTED'],
    expectedPlanSummary: { subjectEntityId: 'entity.inventory_item', projection: 'LIST', polarity: 'POSITIVE', requiredSlots: [] },
  },
  {
    familyId: 'family.maintenance.upcoming_and_category_tasks',
    domainId: 'domain.maintenance',
    requestClass: 'DATA_QUERY',
    targetKind: 'QUERY',
    semanticJobOrRelationId: 'query.maintenance_task.status_and_window',
    canonicalPrompt: 'what maintenance is due next month?',
    paraphrases: ['show plumbing and electrical tasks', 'which appliances have overdue maintenance?'],
    adjacentNegatives: ['mark the gutter task complete', 'what buyer deadlines are due before closing?'],
    seededArchetypeIds: ['property.seeded.complete_single_family', 'property.seeded.missing_and_unknown_states'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING'],
    expectedPlanSummary: { subjectEntityId: 'entity.maintenance_task', projection: 'LIST', polarity: 'POSITIVE', requiredSlots: [] },
  },
  {
    familyId: 'family.insurance_policies.deductible_and_expiry',
    domainId: 'domain.insurance_policies',
    requestClass: 'DATA_QUERY',
    targetKind: 'QUERY',
    semanticJobOrRelationId: 'field.policy.deductible',
    canonicalPrompt: 'what is my insurance deductible and when does my policy expire?',
    paraphrases: ['who is my insurance carrier and what is the deductible?', 'when does my homeowners insurance renew?'],
    adjacentNegatives: ['which appliances have no warranty?', 'what claims are still open?'],
    seededArchetypeIds: ['property.seeded.complete_single_family', 'property.seeded.conflicted_and_dual_parent_auth'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING', 'CONFLICTED'],
    expectedPlanSummary: { subjectEntityId: 'entity.insurance_policy', projection: 'DETAIL', polarity: 'POSITIVE', requiredSlots: [] },
  },
  {
    familyId: 'family.claims.open_claims_and_documents',
    domainId: 'domain.claims',
    requestClass: 'DATA_QUERY',
    targetKind: 'QUERY',
    semanticJobOrRelationId: 'relation.claim.claim_document',
    canonicalPrompt: 'show the documents for my water-damage claim',
    paraphrases: ['what claims are open and what documents are missing?', 'when is the next follow-up on my water damage claim?'],
    adjacentNegatives: ['show all home records', 'when does my warranty expire?'],
    seededArchetypeIds: ['property.seeded.complete_single_family', 'property.seeded.conflicted_and_dual_parent_auth'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING', 'UNKNOWN'],
    expectedPlanSummary: { subjectEntityId: 'entity.claim', projection: 'LIST', polarity: 'POSITIVE', requiredSlots: ['claimId'] },
  },
  {
    familyId: 'family.documents_records.record_verification_and_versions',
    domainId: 'domain.documents_records',
    requestClass: 'DATA_QUERY',
    targetKind: 'QUERY',
    semanticJobOrRelationId: 'relation.property_record.record_version',
    canonicalPrompt: 'what is the verification status and latest version of my roof invoice record?',
    paraphrases: ['which appliances don’t have a manual or receipt?', 'show the scan status of my deed record'],
    adjacentNegatives: ['show the documents for my water-damage claim', 'export my home report'],
    seededArchetypeIds: ['property.seeded.complete_single_family', 'property.seeded.conflicted_and_dual_parent_auth'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING'],
    expectedPlanSummary: { subjectEntityId: 'entity.property_record', projection: 'DETAIL', polarity: 'POSITIVE', requiredSlots: ['recordId'] },
  },
  {
    familyId: 'family.ownership_costs_finance.tax_bill_comparison',
    domainId: 'domain.ownership_costs_finance',
    requestClass: 'DATA_QUERY',
    targetKind: 'QUERY',
    semanticJobOrRelationId: 'query.property_tax_bill.compare_periods',
    canonicalPrompt: "compare this year's tax bill with last year's",
    paraphrases: ['how has my property tax bill changed over the years?', 'what was my property tax assessment last year vs this year?'],
    adjacentNegatives: ['start a property tax appeal', 'how long until owning beats renting?'],
    seededArchetypeIds: ['property.seeded.complete_single_family', 'property.seeded.missing_and_unknown_states'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING'],
    expectedPlanSummary: { subjectEntityId: 'entity.property_tax_bill', projection: 'COMPARE', polarity: 'POSITIVE', requiredSlots: [] },
  },
  {
    familyId: 'family.ownership_costs_finance.own_rent_and_refinance_breakeven',
    domainId: 'domain.ownership_costs_finance',
    requestClass: 'ANALYSIS_OR_DECISION',
    targetKind: 'CAPABILITY',
    semanticJobOrRelationId: 'job.own_rent_break_even',
    canonicalPrompt: 'how long until owning beats renting?',
    paraphrases: ['would refinancing break even within three years?', 'what is my reserve fund shortfall?'],
    adjacentNegatives: ["compare this year's tax bill with last year's", 'what did I pay for my dishwasher?'],
    seededArchetypeIds: ['property.seeded.complete_single_family', 'property.seeded.missing_and_unknown_states'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING'],
    expectedPlanSummary: { subjectEntityId: 'entity.property', projection: 'CAPABILITY_RESULT', polarity: 'POSITIVE', requiredSlots: ['horizonYears'] },
  },
  {
    familyId: 'family.projects_quotes_vendors.quote_comparison_and_permits',
    domainId: 'domain.projects_quotes_vendors',
    requestClass: 'ANALYSIS_OR_DECISION',
    targetKind: 'CAPABILITY',
    semanticJobOrRelationId: 'job.quote_comparison_review',
    canonicalPrompt: 'compare these two kitchen contractor quotes',
    paraphrases: ['which active projects still need a permit?', 'is this HVAC repair quote fair for my area?'],
    adjacentNegatives: ['should I repair the furnace or replace it?', 'what maintenance is due next month?'],
    seededArchetypeIds: ['property.seeded.complete_single_family', 'property.seeded.buyer_and_seller_lifecycle'],
    requiredDataStateVariants: ['POPULATED', 'UNKNOWN'],
    expectedPlanSummary: { subjectEntityId: 'entity.property', projection: 'CAPABILITY_RESULT', polarity: 'POSITIVE', requiredSlots: ['quoteWorkspaceId'] },
  },
  {
    familyId: 'family.risks_recalls_inspections.recalls_and_inspection_findings',
    domainId: 'domain.risks_recalls_inspections',
    requestClass: 'ANALYSIS_OR_DECISION',
    targetKind: 'CAPABILITY',
    semanticJobOrRelationId: 'job.recall_review',
    canonicalPrompt: 'do I have recalls and which items are affected?',
    paraphrases: ['what environmental risks affect this home this week?', 'which inspection findings still need action?'],
    adjacentNegatives: ['list items without warranty', 'what are my buyer contingency deadlines?'],
    seededArchetypeIds: ['property.seeded.complete_single_family', 'property.seeded.missing_and_unknown_states'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING'],
    expectedPlanSummary: { subjectEntityId: 'entity.inventory_item', projection: 'CAPABILITY_RESULT', polarity: 'POSITIVE', requiredSlots: [] },
  },
  {
    familyId: 'family.inventory.replacement_guidance_decision',
    domainId: 'domain.inventory',
    requestClass: 'ANALYSIS_OR_DECISION',
    targetKind: 'CAPABILITY',
    semanticJobOrRelationId: 'job.replacement_guidance',
    canonicalPrompt: 'should I repair the furnace or replace it?',
    paraphrases: ['my furnace is dying—what should I do?', 'is it worth repairing my water heater or replacing it?'],
    adjacentNegatives: ['when was my furnace installed?', 'I smell gas near the furnace'],
    seededArchetypeIds: ['property.seeded.complete_single_family', 'property.seeded.missing_and_unknown_states'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING'],
    expectedPlanSummary: { subjectEntityId: 'entity.inventory_item', projection: 'CAPABILITY_RESULT', polarity: 'POSITIVE', requiredSlots: ['inventoryItemId'] },
  },
  {
    familyId: 'family.timeline_home_events.recent_events_and_provenance',
    domainId: 'domain.timeline_home_events',
    requestClass: 'DATA_QUERY',
    targetKind: 'QUERY',
    semanticJobOrRelationId: 'query.home_event.timeline',
    canonicalPrompt: 'what home events were recorded this year?',
    paraphrases: ['show recent changes to my home timeline', 'when was the roof replacement event logged?'],
    adjacentNegatives: ['when does my warranty expire?', 'what maintenance is due next month?'],
    seededArchetypeIds: ['property.seeded.complete_single_family'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING'],
    expectedPlanSummary: { subjectEntityId: 'entity.property', projection: 'LIST', polarity: 'POSITIVE', requiredSlots: [] },
  },
  {
    familyId: 'family.buyer_journey.contingency_deadlines_and_tasks',
    domainId: 'domain.buyer_journey',
    requestClass: 'DATA_QUERY',
    targetKind: 'QUERY',
    semanticJobOrRelationId: 'relation.buyer_checklist.buyer_task',
    canonicalPrompt: 'what are my contingency deadlines?',
    paraphrases: ['what buyer deadlines are due before closing?', 'what stage is my home buying checklist in?'],
    adjacentNegatives: ['what do I still need to finish before listing the house?', 'what maintenance is due next month?'],
    seededArchetypeIds: ['property.seeded.buyer_and_seller_lifecycle'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING'],
    expectedPlanSummary: { subjectEntityId: 'entity.buyer_task', projection: 'LIST', polarity: 'POSITIVE', requiredSlots: [] },
  },
  {
    familyId: 'family.seller_preparation.readiness_and_prep_profile',
    domainId: 'domain.seller_preparation',
    requestClass: 'DATA_QUERY',
    targetKind: 'QUERY',
    semanticJobOrRelationId: 'relation.sale_case.readiness_item',
    canonicalPrompt: 'what do I still need to finish before listing the house?',
    paraphrases: ['what is my staging readiness and target list date?', 'which sale readiness items are still open?'],
    adjacentNegatives: ['what buyer deadlines are due before closing?', 'how long until owning beats renting?'],
    seededArchetypeIds: ['property.seeded.buyer_and_seller_lifecycle'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING'],
    expectedPlanSummary: { subjectEntityId: 'entity.sale_readiness_item', projection: 'LIST', polarity: 'POSITIVE', requiredSlots: [] },
  },
  {
    familyId: 'family.account_household_preferences.saved_results_and_work',
    domainId: 'domain.account_household_preferences',
    requestClass: 'DATA_QUERY',
    targetKind: 'CAPABILITY',
    semanticJobOrRelationId: 'job.saved_results',
    canonicalPrompt: 'show my saved items',
    paraphrases: ['show my saved results and bookmarks', 'what open work items do I have in Ask Cozy?'],
    adjacentNegatives: ['list items without warranty', 'show all appliances in my inventory'],
    seededArchetypeIds: ['property.seeded.complete_single_family'],
    requiredDataStateVariants: ['POPULATED', 'EMPTY_OR_MISSING'],
    expectedPlanSummary: { subjectEntityId: 'entity.property', projection: 'CAPABILITY_RESULT', polarity: 'POSITIVE', requiredSlots: [] },
  },
] as const);

export interface Phase0ContainmentRegressionCase {
  readonly regressionId: string;
  readonly frdSectionRef: string;
  readonly evidenceClassification: 'CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF';
  readonly prompt: string;
  readonly failureClassSummary: string;
  readonly expectedContainmentBehavior: string;
}

export const ASK_PHASE0_CONTAINMENT_REGRESSION_CASES: readonly Phase0ContainmentRegressionCase[] = Object.freeze([
  {
    regressionId: 'containment.warranty.negative_paraphrase_list_down',
    frdSectionRef: '§2 Failure #1 / §17.2 #6',
    evidenceClassification: 'CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF',
    prompt: "list down all items which don't have warranty",
    failureClassSummary: 'Natural negative relation phrasing previously fell through Shape 9 regex and triggered remote fallback claims.',
    expectedContainmentBehavior: 'Resolves deterministically to QUERY entity.inventory_item LIST relation.inventory_item.warranty NEGATIVE with grammarComplete=true.',
  },
  {
    regressionId: 'containment.warranty.negative_projection_detail',
    frdSectionRef: '§2 Failure #1 / §20',
    evidenceClassification: 'CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF',
    prompt: 'provide details of all items without warranty',
    failureClassSummary: 'Detail projection over negative warranty relation was not preserved consistently.',
    expectedContainmentBehavior: 'Resolves deterministically to QUERY entity.inventory_item DETAIL relation.inventory_item.warranty NEGATIVE with grammarComplete=true.',
  },
  {
    regressionId: 'containment.warranty.negative_projection_count',
    frdSectionRef: '§2 Failure #1 / §20',
    evidenceClassification: 'CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF',
    prompt: 'how many appliances are not having warranty',
    failureClassSummary: 'Progressive aspect negation ("not having") missed narrow regex list.',
    expectedContainmentBehavior: 'Resolves deterministically to QUERY entity.inventory_item COUNT relation.inventory_item.warranty NEGATIVE with grammarComplete=true.',
  },
  {
    regressionId: 'containment.warranty.positive_relation_symmetry',
    frdSectionRef: '§2 Failure #1 / §17.2 #6',
    evidenceClassification: 'CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF',
    prompt: 'which items are having warranty',
    failureClassSummary: 'Positive relation symmetry was missing when only negative absence was handled.',
    expectedContainmentBehavior: 'Resolves deterministically to QUERY entity.inventory_item LIST relation.inventory_item.warranty POSITIVE with grammarComplete=true.',
  },
  {
    regressionId: 'containment.warranty.possessive_homeowner_phrasing',
    frdSectionRef: '§2 Failure #1 / FR-PLAN-7',
    evidenceClassification: 'CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF',
    prompt: 'which of my appliances do not have a warranty',
    failureClassSummary: 'Possessive/conversational determiners ("my") must not be treated as unconsumed meaning spans.',
    expectedContainmentBehavior: 'Resolves deterministically to QUERY entity.inventory_item LIST relation.inventory_item.warranty NEGATIVE with unresolvedSpans=[] and grammarComplete=true.',
  },
  {
    regressionId: 'containment.warranty.conflicting_legacy_links_never_guessed',
    frdSectionRef: '§2 Failure #2 / §17.2 #1 / FR-QUERY-7',
    evidenceClassification: 'CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF',
    prompt: 'how many appliances have no warranty?',
    failureClassSummary: 'Competing InventoryItem.warrantyId and Warranty.inventoryItemId links could produce contradictory answers across list/count/detail.',
    expectedContainmentBehavior: 'readTransitionalWarrantyLinks classifies contradicting links as CONFLICTED and excludes them from both confirmed-covered and confirmed-uncovered counts.',
  },
  {
    regressionId: 'containment.remote_fallback.fail_closed_on_provider_error',
    frdSectionRef: '§2 Failure #2 / §17.2 #2 / §18 Phase 1',
    evidenceClassification: 'CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF',
    prompt: 'Provide details of all items without warranty',
    failureClassSummary: 'When remote claim selection failed or timed out, selectAndRenderAskRemoteFallbackClaims previously returned the top 6 unrelated property facts (roof, event, cost comparisons).',
    expectedContainmentBehavior: 'selectAndRenderAskRemoteFallbackClaims returns [] (empty claim list) when the provider call throws or fails validation.',
  },
  {
    regressionId: 'containment.cross_domain.unsupported_multi_entity_not_coerced',
    frdSectionRef: '§2 Failure #3 / §17.2 #5',
    evidenceClassification: 'CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF',
    prompt: 'what claims are still open and what documents are missing?',
    failureClassSummary: 'Multi-entity cross-domain prompt must not be silently coerced into a single-entity inventory warranty query.',
    expectedContainmentBehavior: 'Warranty deterministic parser returns outcome=NONE_FITS with facets=[] rather than claiming an unrelated domain.',
  },
] as const);

export function validateSeededScenarioCatalogue(): string[] {
  const issues: string[] = [];
  const nonBoundaryDomains = ASK_SEMANTIC_DOMAINS
    .filter((d) => d.domainId !== 'domain.safety_boundary')
    .map((d) => d.domainId);

  const coveredDomains = new Set(ASK_CROSS_DOMAIN_SEMANTIC_FAMILIES.map((f) => f.domainId));
  for (const domainId of nonBoundaryDomains) {
    if (!coveredDomains.has(domainId)) {
      issues.push(`Domain ${domainId} has no independent semantic scenario family in ASK_CROSS_DOMAIN_SEMANTIC_FAMILIES`);
    }
  }

  const seenFamilyIds = new Set<string>();
  for (const family of ASK_CROSS_DOMAIN_SEMANTIC_FAMILIES) {
    if (seenFamilyIds.has(family.familyId)) {
      issues.push(`${family.familyId}: duplicate familyId`);
    }
    seenFamilyIds.add(family.familyId);
    if (family.paraphrases.length < 2) {
      issues.push(`${family.familyId}: must declare at least 2 paraphrases`);
    }
    if (family.adjacentNegatives.length < 2) {
      issues.push(`${family.familyId}: must declare at least 2 adjacentNegatives`);
    }
  }

  for (const regression of ASK_PHASE0_CONTAINMENT_REGRESSION_CASES) {
    if (regression.evidenceClassification !== 'CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF') {
      issues.push(`${regression.regressionId}: must be labelled CONTAINMENT_REGRESSION_NOT_COVERAGE_PROOF`);
    }
  }

  return issues;
}
