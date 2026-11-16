/**
 * ASK_COZY_CROSS_DOMAIN_SEMANTIC_ARCHITECTURE_FRD.md — §18 Phase 1 / FR-PLAN-7 / §19 Artifact #31
 *
 * Reproducible Phase 1 basic-read family selection manifest and deferred-family ledger.
 * Selects:
 * - All 4 known false-decline families (warranty/inventory relation, maintenance, item-cost, saved-result retrieval);
 * - At least one already-supported safe DETAIL, LIST, COUNT, EXISTS, or missing-relation family
 *   from each of the 11 §5 domain groups where the required canonical read exists;
 * - Records every deferred family with explicit deferral reason and target domain wave.
 */

export const ASK_BASIC_READ_FAMILY_MANIFEST_VERSION = '1.0.0' as const;

export type Section5DomainGroupId =
  | 'PROPERTY_CORE'
  | 'ROOMS_AND_AREAS'
  | 'INVENTORY_ITEMS'
  | 'HOME_SYSTEMS_AND_RISK'
  | 'MAINTENANCE'
  | 'PROTECTION'
  | 'FINANCE_TAX_AND_COST'
  | 'DOCUMENTS_AND_RECORDS'
  | 'TIMELINE_EVENTS_AND_MONITORING'
  | 'TRANSACTIONS_AND_PROJECTS'
  | 'OPERATIONS_AND_SAVED_WORK';

export const SECTION_5_DOMAIN_GROUP_IDS: readonly Section5DomainGroupId[] = Object.freeze([
  'PROPERTY_CORE',
  'ROOMS_AND_AREAS',
  'INVENTORY_ITEMS',
  'HOME_SYSTEMS_AND_RISK',
  'MAINTENANCE',
  'PROTECTION',
  'FINANCE_TAX_AND_COST',
  'DOCUMENTS_AND_RECORDS',
  'TIMELINE_EVENTS_AND_MONITORING',
  'TRANSACTIONS_AND_PROJECTS',
  'OPERATIONS_AND_SAVED_WORK',
]);

export type BasicReadFalseDeclineCategory =
  | 'WARRANTY_INVENTORY_RELATION'
  | 'MAINTENANCE_RETRIEVAL'
  | 'ITEM_COST_RETRIEVAL'
  | 'SAVED_RESULT_RETRIEVAL'
  | null;

export interface SelectedBasicReadFamily {
  readonly familyId: string;
  readonly domainGroupId: Section5DomainGroupId;
  readonly semanticDomainId: string;
  readonly subjectEntityId: string;
  readonly requestClass: 'DATA_QUERY' | 'CAPABILITY';
  readonly supportedProjections: ReadonlyArray<'DETAIL' | 'LIST' | 'COUNT' | 'EXISTS'>;
  readonly supportedPolarities: ReadonlyArray<'POSITIVE' | 'NEGATIVE'>;
  readonly relationOrFieldOrJobId: string;
  readonly canonicalAdapterKey: string;
  readonly falseDeclineCategory: BasicReadFalseDeclineCategory;
  readonly selectionRationale: string;
  readonly representativeExamples: readonly string[];
}

export interface DeferredBasicReadFamily {
  readonly familyId: string;
  readonly domainGroupId: Section5DomainGroupId;
  readonly description: string;
  readonly deferralReason:
    | 'REQUIRES_TEMPORAL_EXPIRATION_SEMANTICS'
    | 'REQUIRES_ENUM_STATUS_PREDICATE_COMPILATION'
    | 'REQUIRES_MULTI_HOP_BOOLEAN_QUERY_COMPILER'
    | 'REQUIRES_COMPOUND_MULTI_FACET_SEGMENTATION'
    | 'REQUIRES_CONSEQUENTIAL_WRITE_CONFIRMATION_ADMISSION';
  readonly targetRollout:
    | 'ROLLOUT_1_INVENTORY_AND_MAINTENANCE'
    | 'ROLLOUT_2_PROTECTION_AND_CLAIMS'
    | 'ROLLOUT_3_FINANCE_TAX_AND_PROPERTY_CORE'
    | 'ROLLOUT_4_TRANSACTIONS_PROJECTS_AND_RECORDS'
    | 'ROLLOUT_5_OPERATIONS_SAVED_WORK_AND_COMPOSITION';
  readonly representativePrompts: readonly string[];
}

export const SELECTED_BASIC_READ_FAMILIES: readonly SelectedBasicReadFamily[] = Object.freeze([
  {
    familyId: 'FAM_P1_PROPERTY_CORE_FACT_DETAIL',
    domainGroupId: 'PROPERTY_CORE',
    semanticDomainId: 'domain.property_core',
    subjectEntityId: 'entity.property',
    requestClass: 'DATA_QUERY',
    supportedProjections: ['DETAIL'],
    supportedPolarities: ['POSITIVE'],
    relationOrFieldOrJobId: 'field.property.year_built|field.property.living_area|field.property.roof_replacement_year',
    canonicalAdapterKey: 'data-point-read.read',
    falseDeclineCategory: null,
    selectionRationale: 'Safe single-point canonical read over Property scalar facts (yearBuilt, livingArea, roofReplacementYear).',
    representativeExamples: [
      'what is the year built of my home profile',
      'show details of the living area for my home profile',
    ],
  },
  {
    familyId: 'FAM_P1_ROOMS_LIST',
    domainGroupId: 'ROOMS_AND_AREAS',
    semanticDomainId: 'domain.rooms_areas',
    subjectEntityId: 'entity.inventory_room',
    requestClass: 'DATA_QUERY',
    supportedProjections: ['LIST', 'COUNT'],
    supportedPolarities: ['POSITIVE'],
    relationOrFieldOrJobId: 'entity.inventory_room',
    canonicalAdapterKey: 'data-point-read.read',
    falseDeclineCategory: null,
    selectionRationale: 'Safe canonical room list and count read over InventoryRoom.',
    representativeExamples: [
      'list rooms',
      'how many rooms',
    ],
  },
  {
    familyId: 'FAM_P1_WARRANTY_INVENTORY_RELATION',
    domainGroupId: 'INVENTORY_ITEMS',
    semanticDomainId: 'domain.inventory',
    subjectEntityId: 'entity.inventory_item',
    requestClass: 'DATA_QUERY',
    supportedProjections: ['LIST', 'DETAIL', 'COUNT', 'EXISTS'],
    supportedPolarities: ['POSITIVE', 'NEGATIVE'],
    relationOrFieldOrJobId: 'relation.inventory_item.warranty',
    canonicalAdapterKey: 'data-point-read.read',
    falseDeclineCategory: 'WARRANTY_INVENTORY_RELATION',
    selectionRationale: 'Known false-decline family #1: positive and negative inventory-item warranty relation across LIST, DETAIL, COUNT, and EXISTS.',
    representativeExamples: [
      "list down all items which don't have warranty",
      'provide details of all items without warranty',
      'how many appliances are not having warranty',
      'which items are having warranty',
    ],
  },
  {
    familyId: 'FAM_P1_INVENTORY_ITEM_COST_DETAIL',
    domainGroupId: 'INVENTORY_ITEMS',
    semanticDomainId: 'domain.inventory',
    subjectEntityId: 'entity.inventory_item',
    requestClass: 'DATA_QUERY',
    supportedProjections: ['DETAIL'],
    supportedPolarities: ['POSITIVE'],
    relationOrFieldOrJobId: 'field.inventory_item.purchase_cost|field.inventory_item.replacement_cost',
    canonicalAdapterKey: 'data-point-read.read',
    falseDeclineCategory: 'ITEM_COST_RETRIEVAL',
    selectionRationale: 'Known false-decline family #3: item-cost scalar lookup (purchaseCostCents and replacementCostCents) on InventoryItem.',
    representativeExamples: [
      'what is the purchase cost of my dishwasher',
      'show replacement cost for my furnace',
    ],
  },
  {
    familyId: 'FAM_P1_HOME_SYSTEMS_LIST',
    domainGroupId: 'HOME_SYSTEMS_AND_RISK',
    semanticDomainId: 'domain.home_systems_risk',
    subjectEntityId: 'entity.home_system',
    requestClass: 'DATA_QUERY',
    supportedProjections: ['LIST', 'DETAIL'],
    supportedPolarities: ['POSITIVE'],
    relationOrFieldOrJobId: 'entity.home_system',
    canonicalAdapterKey: 'data-point-read.read',
    falseDeclineCategory: null,
    selectionRationale: 'Safe canonical read over major home systems (HVAC, electrical panel, plumbing system).',
    representativeExamples: [
      'list home systems',
      'show details of my hvac system',
    ],
  },
  {
    familyId: 'FAM_P1_MAINTENANCE_DUE_LIST',
    domainGroupId: 'MAINTENANCE',
    semanticDomainId: 'domain.maintenance',
    subjectEntityId: 'entity.maintenance_task',
    requestClass: 'DATA_QUERY',
    supportedProjections: ['LIST', 'COUNT', 'DETAIL'],
    supportedPolarities: ['POSITIVE'],
    relationOrFieldOrJobId: 'field.maintenance_task.next_due_date|field.maintenance_task.priority',
    canonicalAdapterKey: 'data-point-read.read',
    falseDeclineCategory: 'MAINTENANCE_RETRIEVAL',
    selectionRationale: 'Known false-decline family #2: maintenance task retrieval (due, overdue, priority, list, count).',
    representativeExamples: [
      'list maintenance tasks due',
      'how many maintenance tasks are overdue',
      'show urgent maintenance tasks',
    ],
  },
  {
    familyId: 'FAM_P1_WARRANTY_LIST',
    domainGroupId: 'PROTECTION',
    semanticDomainId: 'domain.protection',
    subjectEntityId: 'entity.warranty',
    requestClass: 'DATA_QUERY',
    supportedProjections: ['LIST', 'COUNT', 'DETAIL'],
    supportedPolarities: ['POSITIVE'],
    relationOrFieldOrJobId: 'field.warranty.expiry_date',
    canonicalAdapterKey: 'data-point-read.read',
    falseDeclineCategory: null,
    selectionRationale: 'Safe canonical read over Warranty records and warranty expiration dates (distinct from insurance policies and claims).',
    representativeExamples: [
      'list warranties',
      'show warranty expiration date',
    ],
  },
  {
    familyId: 'FAM_P1_INSURANCE_POLICY_DETAIL',
    domainGroupId: 'PROTECTION',
    semanticDomainId: 'domain.protection',
    subjectEntityId: 'entity.insurance_policy',
    requestClass: 'DATA_QUERY',
    supportedProjections: ['DETAIL', 'LIST', 'COUNT'],
    supportedPolarities: ['POSITIVE'],
    relationOrFieldOrJobId: 'field.insurance_policy.deductible|field.insurance_policy.premium_amount|field.insurance_policy.expiry_date',
    canonicalAdapterKey: 'data-point-read.read',
    falseDeclineCategory: null,
    selectionRationale: 'Safe canonical read over InsurancePolicy records (deductible, premium, expiration date) kept strictly separate from Warranty and Claim.',
    representativeExamples: [
      'what is my insurance deductible',
      'list insurance policies',
    ],
  },
  {
    familyId: 'FAM_P1_FINANCE_TAX_DETAIL',
    domainGroupId: 'FINANCE_TAX_AND_COST',
    semanticDomainId: 'domain.finance_tax_cost',
    subjectEntityId: 'entity.tax_bill',
    requestClass: 'DATA_QUERY',
    supportedProjections: ['DETAIL', 'LIST', 'COUNT'],
    supportedPolarities: ['POSITIVE'],
    relationOrFieldOrJobId: 'field.tax_bill.tax_amount|field.reserve_fund.balance',
    canonicalAdapterKey: 'data-point-read.read',
    falseDeclineCategory: null,
    selectionRationale: 'Safe canonical read over PropertyTaxBillRecord, PropertyTaxAssessmentRecord, and HomeReserveFund.',
    representativeExamples: [
      'what is my property tax amount',
      'show reserve fund balance',
    ],
  },
  {
    familyId: 'FAM_P1_DOCUMENTS_RECORDS_LIST',
    domainGroupId: 'DOCUMENTS_AND_RECORDS',
    semanticDomainId: 'domain.documents_records',
    subjectEntityId: 'entity.property_record',
    requestClass: 'DATA_QUERY',
    supportedProjections: ['LIST', 'COUNT', 'DETAIL'],
    supportedPolarities: ['POSITIVE'],
    relationOrFieldOrJobId: 'entity.property_record',
    canonicalAdapterKey: 'data-point-read.read',
    falseDeclineCategory: null,
    selectionRationale: 'Safe canonical read over PropertyRecord and PropertyRecordVersion.',
    representativeExamples: [
      'list home records',
      'how many home records',
    ],
  },
  {
    familyId: 'FAM_P1_HOME_EVENTS_LIST',
    domainGroupId: 'TIMELINE_EVENTS_AND_MONITORING',
    semanticDomainId: 'domain.timeline_events_monitoring',
    subjectEntityId: 'entity.home_event',
    requestClass: 'DATA_QUERY',
    supportedProjections: ['LIST', 'COUNT'],
    supportedPolarities: ['POSITIVE'],
    relationOrFieldOrJobId: 'entity.home_event',
    canonicalAdapterKey: 'data-point-read.read',
    falseDeclineCategory: null,
    selectionRationale: 'Safe canonical read over HomeEvent timeline records.',
    representativeExamples: [
      'list home events',
      'how many timeline events',
    ],
  },
  {
    familyId: 'FAM_P1_TRANSACTIONS_CLOSING_LIST',
    domainGroupId: 'TRANSACTIONS_AND_PROJECTS',
    semanticDomainId: 'domain.transactions_projects',
    subjectEntityId: 'entity.buyer_task',
    requestClass: 'DATA_QUERY',
    supportedProjections: ['LIST', 'COUNT', 'DETAIL'],
    supportedPolarities: ['POSITIVE'],
    relationOrFieldOrJobId: 'field.buyer_task.due_date|entity.sale_readiness_item',
    canonicalAdapterKey: 'data-point-read.read',
    falseDeclineCategory: null,
    selectionRationale: 'Safe canonical read over HomeBuyerTask and SaleReadinessItem.',
    representativeExamples: [
      'list buyer tasks',
      'show sale readiness items',
    ],
  },
  {
    familyId: 'FAM_P1_SAVED_RESULTS_RETRIEVAL',
    domainGroupId: 'OPERATIONS_AND_SAVED_WORK',
    semanticDomainId: 'domain.operations_saved_work',
    subjectEntityId: 'entity.saved_result',
    requestClass: 'CAPABILITY',
    supportedProjections: ['LIST', 'COUNT'],
    supportedPolarities: ['POSITIVE'],
    relationOrFieldOrJobId: 'job.saved_results.lookup',
    canonicalAdapterKey: 'saved-results.read',
    falseDeclineCategory: 'SAVED_RESULT_RETRIEVAL',
    selectionRationale: 'Known false-decline family #4: saved-result retrieval over persisted Ask analyses and bookmarked results.',
    representativeExamples: [
      'show my saved results',
      'list saved analyses',
    ],
  },
]);

export const DEFERRED_BASIC_READ_FAMILIES: readonly DeferredBasicReadFamily[] = Object.freeze([
  {
    familyId: 'FAM_DEFERRED_OPEN_CLAIMS_FILTER',
    domainGroupId: 'PROTECTION',
    description: 'Filtered claim status queries such as open/closed/under-review claim predicates.',
    deferralReason: 'REQUIRES_ENUM_STATUS_PREDICATE_COMPILATION',
    targetRollout: 'ROLLOUT_2_PROTECTION_AND_CLAIMS',
    representativePrompts: ['what claims are still open?'],
  },
  {
    familyId: 'FAM_DEFERRED_EXPIRED_WARRANTY_TEMPORAL',
    domainGroupId: 'PROTECTION',
    description: 'Temporal warranty expiration vs absence of linked warranty record ("out of warranty", "expired next month").',
    deferralReason: 'REQUIRES_TEMPORAL_EXPIRATION_SEMANTICS',
    targetRollout: 'ROLLOUT_2_PROTECTION_AND_CLAIMS',
    representativePrompts: ['which appliances are out of warranty?', 'show appliances without warranty next month'],
  },
  {
    familyId: 'FAM_DEFERRED_CROSS_ENTITY_BOOLEAN_COMPOSITION',
    domainGroupId: 'INVENTORY_ITEMS',
    description: 'Surface natural-language connective parsing into multi-node AND/OR/NOT query plans.',
    deferralReason: 'REQUIRES_MULTI_HOP_BOOLEAN_QUERY_COMPILER',
    targetRollout: 'ROLLOUT_1_INVENTORY_AND_MAINTENANCE',
    representativePrompts: ['which kitchen appliances have neither a warranty nor a serial number?'],
  },
  {
    familyId: 'FAM_DEFERRED_MULTI_FACET_COMPOUND_QUERY',
    domainGroupId: 'OPERATIONS_AND_SAVED_WORK',
    description: 'Multi-facet up-to-6 clause semantic plan execution with cross-facet slot binding.',
    deferralReason: 'REQUIRES_COMPOUND_MULTI_FACET_SEGMENTATION',
    targetRollout: 'ROLLOUT_5_OPERATIONS_SAVED_WORK_AND_COMPOSITION',
    representativePrompts: ['show my overdue maintenance tasks and tell me whether my furnace has a warranty'],
  },
  {
    familyId: 'FAM_DEFERRED_CONSEQUENTIAL_COMMAND_PLANS',
    domainGroupId: 'MAINTENANCE',
    description: 'Semantic COMMAND plan synthesis for mutating domain commands.',
    deferralReason: 'REQUIRES_CONSEQUENTIAL_WRITE_CONFIRMATION_ADMISSION',
    targetRollout: 'ROLLOUT_1_INVENTORY_AND_MAINTENANCE',
    representativePrompts: ['mark the furnace filter task complete and set the cost to $45'],
  },
]);

export function verifyBasicReadFamilyManifestCompleteness(): {
  readonly valid: boolean;
  readonly missingDomainGroups: readonly Section5DomainGroupId[];
  readonly missingFalseDeclineCategories: readonly string[];
  readonly selectedCount: number;
  readonly deferredCount: number;
} {
  const coveredGroups = new Set(SELECTED_BASIC_READ_FAMILIES.map((family) => family.domainGroupId));
  const missingDomainGroups = SECTION_5_DOMAIN_GROUP_IDS.filter((groupId) => !coveredGroups.has(groupId));

  const requiredFalseDeclines = [
    'WARRANTY_INVENTORY_RELATION',
    'MAINTENANCE_RETRIEVAL',
    'ITEM_COST_RETRIEVAL',
    'SAVED_RESULT_RETRIEVAL',
  ] as const;
  const presentFalseDeclines = new Set(
    SELECTED_BASIC_READ_FAMILIES
      .map((family) => family.falseDeclineCategory)
      .filter((category): category is NonNullable<BasicReadFalseDeclineCategory> => category !== null),
  );
  const missingFalseDeclineCategories = requiredFalseDeclines.filter((cat) => !presentFalseDeclines.has(cat));

  return {
    valid: missingDomainGroups.length === 0 && missingFalseDeclineCategories.length === 0 && DEFERRED_BASIC_READ_FAMILIES.length > 0,
    missingDomainGroups,
    missingFalseDeclineCategories,
    selectedCount: SELECTED_BASIC_READ_FAMILIES.length,
    deferredCount: DEFERRED_BASIC_READ_FAMILIES.length,
  };
}
