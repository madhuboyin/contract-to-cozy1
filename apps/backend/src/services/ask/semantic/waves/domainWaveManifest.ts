import { ASK_SEMANTIC_DOMAINS, type SemanticDomainId } from '../phase0/semanticOntologyBaseline';
import { ASK_SHARED_SEMANTIC_LEXICON } from '../sharedSemanticLexicon';
import type { SemanticFacet } from '../semanticRequestPlan';

export type SemanticWaveId =
  | 'WAVE_1_INVENTORY_AND_MAINTENANCE'
  | 'WAVE_2_PROTECTION_AND_CLAIMS'
  | 'WAVE_3_FINANCE_TAX_AND_PROPERTY_CORE'
  | 'WAVE_4_TRANSACTIONS_PROJECTS_AND_RECORDS'
  | 'WAVE_5_OPERATIONS_SAVED_WORK_AND_COMPOSITION';

export type FacetExecutionOwner = 'NEW_STACK' | 'LEGACY_STACK' | 'UNRESOLVED';

export interface DomainLanguageCoverageProfile {
  readonly profileId: string;
  readonly languageCode: 'en-US';
  readonly paraphraseFamiliesCovered: number;
  readonly ambiguousCoordinationClarification: boolean;
  readonly boundedTypoTolerance: boolean;
  readonly note: string;
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
  readonly legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK' | 'MANIFEST_GATED_LEGACY_ADAPTER' | 'RETAINED_SAFETY_BOUNDARY';
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

export const DOMAIN_LANGUAGE_COVERAGE_PROFILES: readonly DomainLanguageCoverageProfile[] = Object.freeze([
  {
    profileId: 'lang-profile.en-us.wave1-inventory-maintenance',
    languageCode: 'en-US',
    paraphraseFamiliesCovered: 8,
    ambiguousCoordinationClarification: true,
    boundedTypoTolerance: true,
    note: 'Separate from correctness state: measures English phrasing, typo, morphology, and Boolean coordination coverage.',
  },
  {
    profileId: 'lang-profile.en-us.wave2-protection-claims',
    languageCode: 'en-US',
    paraphraseFamiliesCovered: 6,
    ambiguousCoordinationClarification: true,
    boundedTypoTolerance: true,
    note: 'Enforces strict separation across warranty, insurance, policy, coverage, and claim tokens.',
  },
  {
    profileId: 'lang-profile.en-us.wave3-finance-tax-risk',
    languageCode: 'en-US',
    paraphraseFamiliesCovered: 7,
    ambiguousCoordinationClarification: false,
    boundedTypoTolerance: false,
    note: 'Covers repair aggregates, YoY tax comparisons, break-even jobs, environmental risks, and recalls.',
  },
  {
    profileId: 'lang-profile.en-us.wave4-transactions-projects-records',
    languageCode: 'en-US',
    paraphraseFamiliesCovered: 7,
    ambiguousCoordinationClarification: true,
    boundedTypoTolerance: false,
    note: 'Covers buyer deadlines, seller readiness, permit unknown vs confirmed-not-required, quotes, and inspection findings.',
  },
  {
    profileId: 'lang-profile.en-us.wave5-operations-composition',
    languageCode: 'en-US',
    paraphraseFamiliesCovered: 6,
    ambiguousCoordinationClarification: true,
    boundedTypoTolerance: false,
    note: 'Covers up to 6-facet composition, saved results, role visibility, and DOMAIN_NOT_SEARCHED overflow reporting.',
  },
  {
    profileId: 'lang-profile.en-us.safety-boundary',
    languageCode: 'en-US',
    paraphraseFamiliesCovered: 4,
    ambiguousCoordinationClarification: false,
    boundedTypoTolerance: false,
    note: 'Stage 0 emergency, legal/tax/medical advice refusal, and restricted-request guardrail coverage.',
  },
]);

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
    registeredRelationIds: [
      'relation.warranty.self',
      'relation.claim.self',
      'relation.claim.claim_document',
    ],
    registeredJobIds: [
      'query.warranty.filter',
      'query.insurance_policy.field_read',
      'query.claim.filter',
      'query.claim.documents',
    ],
    canonicalExecutorId: 'cross-domain-wave-executor',
  },
  {
    waveId: 'WAVE_3_FINANCE_TAX_AND_PROPERTY_CORE',
    order: 3,
    phaseLabel: 'Phase 4A / Wave 3',
    title: 'Property Core, Finance/Tax/Cost, Timeline Events & Risks/Recalls',
    domainIds: [
      'domain.property_profile',
      'domain.ownership_costs_finance',
      'domain.risks_recalls_inspections',
      'domain.timeline_home_events',
    ],
    registeredRelationIds: [
      'relation.home_event.repair_expense',
      'relation.property_tax_bill.period',
      'relation.recall.inventory_item',
    ],
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
    domainIds: [
      'domain.documents_records',
      'domain.projects_quotes_vendors',
      'domain.buyer_journey',
      'domain.seller_preparation',
    ],
    registeredRelationIds: [
      'relation.buyer_checklist.buyer_task',
      'relation.sale_case.readiness_item',
      'relation.project.permit',
      'relation.inspection_report.finding',
    ],
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
    registeredJobIds: [
      'job.saved_results.lookup',
      'job.safety.boundary_refusal',
    ],
    canonicalExecutorId: 'cross-domain-wave-executor',
  },
]);

export const DOMAIN_ENABLEMENT_RECORDS: readonly DomainEnablementRecord[] = Object.freeze([
  {
    domainId: 'domain.property_profile',
    waveId: 'WAVE_3_FINANCE_TAX_AND_PROPERTY_CORE',
    correctnessState: 'ENABLED_FOR_DECLARED_SCOPE',
    legacyAdapterId: 'dataPoint.property_profile.read',
    legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
    languageCoverageProfileId: 'lang-profile.en-us.wave3-finance-tax-risk',
    acceptanceCriteriaIds: ['FR-ONT-1', 'FR-QUERY-1'],
  },
  {
    domainId: 'domain.inventory',
    waveId: 'WAVE_1_INVENTORY_AND_MAINTENANCE',
    correctnessState: 'ENABLED_FOR_DECLARED_SCOPE',
    legacyAdapterId: 'dataPoint.inventory.read',
    legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
    languageCoverageProfileId: 'lang-profile.en-us.wave1-inventory-maintenance',
    acceptanceCriteriaIds: ['ROW-1', 'ROW-2', 'ROW-3', 'ROW-4', 'ROW-5', 'ROW-9', 'ROW-15', 'ROW-18', 'ROW-28'],
  },
  {
    domainId: 'domain.maintenance',
    waveId: 'WAVE_1_INVENTORY_AND_MAINTENANCE',
    correctnessState: 'ENABLED_FOR_DECLARED_SCOPE',
    legacyAdapterId: 'dataPoint.maintenance.read',
    legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
    languageCoverageProfileId: 'lang-profile.en-us.wave1-inventory-maintenance',
    acceptanceCriteriaIds: ['ROW-6', 'ROW-7', 'ROW-8', 'FR-CAP-4'],
  },
  {
    domainId: 'domain.warranties_coverage',
    waveId: 'WAVE_2_PROTECTION_AND_CLAIMS',
    correctnessState: 'ENABLED_FOR_DECLARED_SCOPE',
    legacyAdapterId: 'dataPoint.warranty.read',
    legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
    languageCoverageProfileId: 'lang-profile.en-us.wave2-protection-claims',
    acceptanceCriteriaIds: ['ROW-4', 'ROW-13', 'ROW-14', 'FR-QUERY-7'],
  },
  {
    domainId: 'domain.insurance_policies',
    waveId: 'WAVE_2_PROTECTION_AND_CLAIMS',
    correctnessState: 'ENABLED_FOR_DECLARED_SCOPE',
    legacyAdapterId: 'legacy.insurance_policy.deductible_and_terms',
    legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
    languageCoverageProfileId: 'lang-profile.en-us.wave2-protection-claims',
    acceptanceCriteriaIds: ['ROW-13', 'FR-ONT-6'],
  },
  {
    domainId: 'domain.claims',
    waveId: 'WAVE_2_PROTECTION_AND_CLAIMS',
    correctnessState: 'ENABLED_FOR_DECLARED_SCOPE',
    legacyAdapterId: 'dataPoint.claim.read',
    legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
    languageCoverageProfileId: 'lang-profile.en-us.wave2-protection-claims',
    acceptanceCriteriaIds: ['ROW-12', 'ROW-14', 'ROW-16'],
  },
  {
    domainId: 'domain.documents_records',
    waveId: 'WAVE_4_TRANSACTIONS_PROJECTS_AND_RECORDS',
    correctnessState: 'ENABLED_FOR_DECLARED_SCOPE',
    legacyAdapterId: 'dataPoint.documents.read',
    legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
    languageCoverageProfileId: 'lang-profile.en-us.wave4-transactions-projects-records',
    acceptanceCriteriaIds: ['ROW-9', 'ROW-16', 'FR-ENT-4'],
  },
  {
    domainId: 'domain.ownership_costs_finance',
    waveId: 'WAVE_3_FINANCE_TAX_AND_PROPERTY_CORE',
    correctnessState: 'ENABLED_FOR_DECLARED_SCOPE',
    legacyAdapterId: 'dataPoint.finance_tax.read',
    legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
    languageCoverageProfileId: 'lang-profile.en-us.wave3-finance-tax-risk',
    acceptanceCriteriaIds: ['ROW-10', 'ROW-11', 'ROW-14', 'ROW-19', 'ROW-25'],
  },
  {
    domainId: 'domain.projects_quotes_vendors',
    waveId: 'WAVE_4_TRANSACTIONS_PROJECTS_AND_RECORDS',
    correctnessState: 'ENABLED_FOR_DECLARED_SCOPE',
    legacyAdapterId: 'dataPoint.projects_quotes.read',
    legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
    languageCoverageProfileId: 'lang-profile.en-us.wave4-transactions-projects-records',
    acceptanceCriteriaIds: ['ROW-14', 'ROW-26', 'ROW-27'],
  },
  {
    domainId: 'domain.risks_recalls_inspections',
    waveId: 'WAVE_3_FINANCE_TAX_AND_PROPERTY_CORE',
    correctnessState: 'ENABLED_FOR_DECLARED_SCOPE',
    legacyAdapterId: 'dataPoint.risks_recalls_inspections.read',
    legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
    languageCoverageProfileId: 'lang-profile.en-us.wave3-finance-tax-risk',
    acceptanceCriteriaIds: ['ROW-17', 'ROW-28', 'ROW-29'],
  },
  {
    domainId: 'domain.timeline_home_events',
    waveId: 'WAVE_3_FINANCE_TAX_AND_PROPERTY_CORE',
    correctnessState: 'ENABLED_FOR_DECLARED_SCOPE',
    legacyAdapterId: 'dataPoint.timeline_events.read',
    legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
    languageCoverageProfileId: 'lang-profile.en-us.wave3-finance-tax-risk',
    acceptanceCriteriaIds: ['ROW-10'],
  },
  {
    domainId: 'domain.buyer_journey',
    waveId: 'WAVE_4_TRANSACTIONS_PROJECTS_AND_RECORDS',
    correctnessState: 'ENABLED_FOR_DECLARED_SCOPE',
    legacyAdapterId: 'dataPoint.buyer.read',
    legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
    languageCoverageProfileId: 'lang-profile.en-us.wave4-transactions-projects-records',
    acceptanceCriteriaIds: ['ROW-20', 'ROW-23'],
  },
  {
    domainId: 'domain.seller_preparation',
    waveId: 'WAVE_4_TRANSACTIONS_PROJECTS_AND_RECORDS',
    correctnessState: 'ENABLED_FOR_DECLARED_SCOPE',
    legacyAdapterId: 'dataPoint.seller.read',
    legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
    languageCoverageProfileId: 'lang-profile.en-us.wave4-transactions-projects-records',
    acceptanceCriteriaIds: ['ROW-24'],
  },
  {
    domainId: 'domain.account_household_preferences',
    waveId: 'WAVE_5_OPERATIONS_SAVED_WORK_AND_COMPOSITION',
    correctnessState: 'ENABLED_FOR_DECLARED_SCOPE',
    legacyAdapterId: 'dataPoint.saved_results.read',
    legacyRecognizerDisposition: 'RETIRED_INTO_SEMANTIC_STACK',
    languageCoverageProfileId: 'lang-profile.en-us.wave5-operations-composition',
    acceptanceCriteriaIds: ['ROW-22'],
  },
  {
    domainId: 'domain.safety_boundary',
    waveId: 'WAVE_5_OPERATIONS_SAVED_WORK_AND_COMPOSITION',
    correctnessState: 'ENABLED_FOR_DECLARED_SCOPE',
    legacyAdapterId: 'safety.boundary.prefilter',
    legacyRecognizerDisposition: 'RETAINED_SAFETY_BOUNDARY',
    languageCoverageProfileId: 'lang-profile.en-us.safety-boundary',
    acceptanceCriteriaIds: ['ROW-21'],
  },
]);

export const OFFLINE_LEXICON_ENRICHMENT_PROPOSALS: readonly OfflineLexiconEnrichmentProposal[] = Object.freeze([
  {
    proposalId: 'lex-enrich-001',
    source: 'DICTIONARY_VARIANT',
    targetSemanticId: 'entity.inventory_item',
    targetRole: 'ENTITY',
    candidatePhrase: 'hot water tank',
    status: 'APPROVED',
    reason: 'Unique alias for water heater with zero collision across domains or protection families.',
  },
  {
    proposalId: 'lex-enrich-002',
    source: 'TRANSCRIPT_PROPOSED',
    targetSemanticId: 'field.warranty.expiry_date',
    targetRole: 'FIELD',
    candidatePhrase: 'warranty ends',
    status: 'APPROVED',
    reason: 'Disjoint warranty phrasing; passes protection token separation check.',
  },
  {
    proposalId: 'lex-enrich-003',
    source: 'TRANSCRIPT_PROPOSED',
    targetSemanticId: 'entity.warranty',
    targetRole: 'ENTITY',
    candidatePhrase: 'insurance coverage',
    status: 'REJECTED_COLLISION',
    reason: 'Violates strict separation between warranty, insurance, and coverage tokens.',
  },
  {
    proposalId: 'lex-enrich-004',
    source: 'DICTIONARY_VARIANT',
    targetSemanticId: 'entity.property_record',
    targetRole: 'ENTITY',
    candidatePhrase: 'warranty',
    status: 'REJECTED_COLLISION',
    reason: 'Collides with canonical label of entity.warranty in generated shared lexicon.',
  },
]);

/** Maps lexicon/plan candidate domain IDs onto canonical 15 §5 domain IDs. */
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

/**
 * Assigns an exclusive execution owner per facet during full-enablement or mixed-migration
 * waves (§19 #37): enabled domains route to NEW_STACK, explicitly specified non-enabled
 * eligible facets route to their manifest LEGACY_STACK adapter, and remaining unenabled
 * facets become explicitly labelled UNRESOLVED (never silently double-executed).
 */
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
      return {
        facetId: facet.id,
        domainId,
        owner: 'NEW_STACK' as const,
        adapterId: 'cross-domain-wave-executor',
        reasonCode: 'DOMAIN_ENABLED_NEW_STACK' as const,
      };
    }

    if (allowLegacy && enablement?.legacyAdapterId && enablement.legacyAdapterId.startsWith('legacy.')) {
      return {
        facetId: facet.id,
        domainId,
        owner: 'LEGACY_STACK' as const,
        adapterId: enablement.legacyAdapterId,
        reasonCode: 'ELIGIBLE_LEGACY_ADAPTER' as const,
      };
    }

    return {
      facetId: facet.id,
      domainId,
      owner: 'UNRESOLVED' as const,
      adapterId: 'none',
      reasonCode: 'NO_ENABLED_OWNER' as const,
    };
  });
}

export function verifyDomainWaveManifestIntegrity(): {
  readonly valid: boolean;
  readonly issues: readonly string[];
} {
  const issues: string[] = [];
  const allDomainIds = new Set(ASK_SEMANTIC_DOMAINS.map((domain) => domain.domainId));
  const waveAssignedDomains = new Map<SemanticDomainId, SemanticWaveId>();

  for (const wave of DOMAIN_WAVE_MANIFEST) {
    for (const domainId of wave.domainIds) {
      if (!allDomainIds.has(domainId)) {
        issues.push(`Wave ${wave.waveId} references unknown domain ${domainId}`);
      }
      const existing = waveAssignedDomains.get(domainId);
      if (existing) {
        issues.push(`Domain ${domainId} assigned to both ${existing} and ${wave.waveId}`);
      }
      waveAssignedDomains.set(domainId, wave.waveId);
    }
  }

  for (const domainId of allDomainIds) {
    if (!waveAssignedDomains.has(domainId)) {
      issues.push(`Domain ${domainId} is not assigned to any wave`);
    }
    const enablement = DOMAIN_ENABLEMENT_RECORDS.find((record) => record.domainId === domainId);
    if (!enablement) {
      issues.push(`Domain ${domainId} is missing an enablement record`);
    } else if (!DOMAIN_LANGUAGE_COVERAGE_PROFILES.some((profile) => profile.profileId === enablement.languageCoverageProfileId)) {
      issues.push(`Domain ${domainId} references unknown language coverage profile ${enablement.languageCoverageProfileId}`);
    }
  }

  const canonicalPhrases = new Set(ASK_SHARED_SEMANTIC_LEXICON.map((item) => item.phrase));
  for (const proposal of OFFLINE_LEXICON_ENRICHMENT_PROPOSALS) {
    const collides = canonicalPhrases.has(proposal.candidatePhrase.toLowerCase())
      || (proposal.targetSemanticId.includes('warranty') && /\b(insurance|policy|coverage|claim)\b/i.test(proposal.candidatePhrase));
    if (collides && proposal.status !== 'REJECTED_COLLISION') {
      issues.push(`Lexicon enrichment ${proposal.proposalId} must be REJECTED_COLLISION`);
    }
    if (!collides && proposal.status !== 'APPROVED') {
      issues.push(`Lexicon enrichment ${proposal.proposalId} marked rejected without collision`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
