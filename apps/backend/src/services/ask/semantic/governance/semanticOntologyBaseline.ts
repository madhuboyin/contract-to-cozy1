/**
 * Phase 0 Bullets 1 & 6 (FR-ONT-1..6, §5, §18 Phase 0, §19 Artifacts #1, #4, #5):
 * Authoritative Cross-Domain Ontology & Schema Reconciliation Baseline.
 *
 * Generates and validates:
 *   1. Cross-Domain Registry (all 14 §5 domains + safety/boundary domain);
 *   2. Entity Inventory (FR-ONT-1 metadata for the 20 catalogued Ask entities +
 *      reconciliation against all property-scoped Prisma models in entityDispositions.json);
 *   3. Field Inventory (FR-ONT-2 metadata for the 107 approved data points +
 *      reconciliation against Prisma scalar/enum fields and PROPERTY_FACT_CATALOG);
 *   4. Capability, Operation & Answer-Variant Inventory (FR-ONT-4 hierarchical mapping
 *      from domain -> requestClass -> semanticJobId -> capabilityId -> operationId
 *      and answer-contract evidence tiers from answerContractManifest.json).
 */
import { Prisma } from '@prisma/client';
import {
  DATA_POINT_DEFINITIONS,
  READABLE_FIELDS,
  RELATION_ENTITIES,
  type AudienceFloor,
  type DataPointEntity,
} from '../../dataPoint/dataPointCatalogue';
import {
  ASK_INTERNAL_OPERATION_IDS,
  ASK_OPERATION_DEFINITIONS,
  isAskMessageRoutableOperation,
  type AskOperationId,
} from '../../askOperationRegistry';
import { ASK_DOMAIN_COMMAND_REGISTRY, getAskDomainCommandByOperation } from '../../askDomainCommandRegistry';
import { SKILL_DEFINITIONS, getSkillForOperation } from '../../../skills/skillRegistry';
import { PROPERTY_FACT_CATALOG } from '../../../../modules/propertyContext/catalog/factCatalog';
import { ASK_SEMANTIC_RELATION_REGISTRY } from '../semanticRelationRegistry';
import { ASK_TRAVERSABLE_RELATION_PATH_MANIFEST } from './relationGovernanceBaseline';
import answerContractManifest from '../../answerContract/answerContractManifest.json';
import entityDispositionsManifest from '../../dataCatalogue/entityDispositions.json';

export const ASK_SEMANTIC_ONTOLOGY_BASELINE_VERSION = 'phase0-ontology-baseline-1.1.0' as const;

export type SemanticDomainId =
  | 'domain.property_profile'
  | 'domain.inventory'
  | 'domain.maintenance'
  | 'domain.warranties_coverage'
  | 'domain.insurance_policies'
  | 'domain.claims'
  | 'domain.documents_records'
  | 'domain.ownership_costs_finance'
  | 'domain.projects_quotes_vendors'
  | 'domain.risks_recalls_inspections'
  | 'domain.timeline_home_events'
  | 'domain.buyer_journey'
  | 'domain.seller_preparation'
  | 'domain.account_household_preferences'
  | 'domain.safety_boundary';

export interface SemanticDomainRegistration {
  readonly domainId: SemanticDomainId;
  readonly section5Order: number;
  readonly title: string;
  readonly description: string;
  readonly correctnessState: 'PARTIAL' | 'NOT_ENABLED' | 'ENABLED_FOR_DECLARED_SCOPE';
}

export const ASK_SEMANTIC_DOMAINS: readonly SemanticDomainRegistration[] = Object.freeze([
  { domainId: 'domain.property_profile', section5Order: 1, title: 'Property profile & structure', description: 'Systems, rooms, occupancy, location, utilities, HOA, permits, and home facts.', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE' },
  { domainId: 'domain.inventory', section5Order: 2, title: 'Inventory & home assets', description: 'Appliances, systems, materials, plants/outdoor items, specifications, age, lifecycle, and condition.', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE' },
  { domainId: 'domain.maintenance', section5Order: 3, title: 'Maintenance & seasonal care', description: 'Recurring tasks, seasonal checklists, habits, DIY projects, service history, and overdue/upcoming work.', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE' },
  { domainId: 'domain.warranties_coverage', section5Order: 4, title: 'Warranties & coverage', description: 'Warranties, coverage links, expirations, coverage gaps, and coverage analyses.', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE' },
  { domainId: 'domain.insurance_policies', section5Order: 5, title: 'Insurance policies', description: 'Carriers, terms, premiums, deductibles, limits, renewals, and policy comparisons.', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE' },
  { domainId: 'domain.claims', section5Order: 6, title: 'Claims', description: 'Open/closed claims, checklists, timeline events, documents, settlements, and follow-ups.', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE' },
  { domainId: 'domain.documents_records', section5Order: 7, title: 'Documents & home records', description: 'Uploads, versions, OCR/extracted facts, verification status, retention, and evidence links.', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE' },
  { domainId: 'domain.ownership_costs_finance', section5Order: 8, title: 'Ownership costs, taxes & financing', description: 'Reserve funds, capital timelines, expenses, budgets, property taxes, assessments, appeals, mortgages, equity, refinance, and sell/hold/rent.', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE' },
  { domainId: 'domain.projects_quotes_vendors', section5Order: 9, title: 'Projects, renovations, quotes & vendors', description: 'Renovation cases, compliance, permits, contractor quotes, negotiations, price radar, bookings, and reviews.', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE' },
  { domainId: 'domain.risks_recalls_inspections', section5Order: 10, title: 'Risks, recalls, incidents & inspections', description: 'Risk reports, mitigation plans, active incidents, recalls, inspection reports, findings, and neighbourhood/environmental radar.', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE' },
  { domainId: 'domain.timeline_home_events', section5Order: 11, title: 'Home timeline & events', description: 'Home events, property changes, provenance, streaks, and daily snapshots.', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE' },
  { domainId: 'domain.buyer_journey', section5Order: 12, title: 'Buyer journey', description: 'Checklists, tasks, contingency deadlines, milestones, inspection/loan/closing workspaces, and new-home setup.', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE' },
  { domainId: 'domain.seller_preparation', section5Order: 13, title: 'Seller preparation', description: 'Sale cases, readiness items, cosmetic/room prep profiles, staging, and target listing/closing dates.', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE' },
  { domainId: 'domain.account_household_preferences', section5Order: 14, title: 'Account, household, notifications & saved work', description: 'Household members, roles, preferences, notifications, saved results, work overview, and briefs.', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE' },
  { domainId: 'domain.safety_boundary', section5Order: 15, title: 'Safety & restricted-request boundary', description: 'Stage 0 emergency, legal/tax/medical advice refusal, and out-of-scope boundary responses.', correctnessState: 'ENABLED_FOR_DECLARED_SCOPE' },
] as const);

export interface SemanticEntityRegistration {
  readonly entityId: string;
  readonly prismaModel: DataPointEntity;
  readonly singularLabel: string;
  readonly pluralLabel: string;
  readonly domainId: SemanticDomainId;
  readonly propertyScopeRule: string;
  readonly minimumAudience: AudienceFloor;
  readonly sensitivityClass: 'HOME' | 'FINANCIAL' | 'PII';
  readonly identityFields: readonly string[];
  readonly safeDisplayFields: readonly string[];
  readonly supportedFieldIds: readonly string[];
  readonly supportedRelationIds: readonly string[];
  readonly resolverAdapterId: string;
  readonly queryAdapterId: string;
  readonly provenanceAdapterId: string;
}

const ENTITY_METADATA: Readonly<Record<DataPointEntity, {
  entityId: string;
  singularLabel: string;
  pluralLabel: string;
  domainId: SemanticDomainId;
  propertyScopeRule: string;
  identityFields: readonly string[];
  safeDisplayFields: readonly string[];
}>> = {
  Property: {
    entityId: 'entity.property',
    singularLabel: 'home',
    pluralLabel: 'homes',
    domainId: 'domain.property_profile',
    propertyScopeRule: 'Property.id === authorizedPropertyId',
    identityFields: ['id', 'name', 'address'],
    safeDisplayFields: ['name', 'city', 'state', 'yearBuilt', 'dwellingType'],
  },
  InventoryItem: {
    entityId: 'entity.inventory_item',
    singularLabel: 'inventory item',
    pluralLabel: 'inventory items',
    domainId: 'domain.inventory',
    propertyScopeRule: 'InventoryItem.propertyId === authorizedPropertyId',
    identityFields: ['id', 'name'],
    safeDisplayFields: ['name', 'category', 'condition', 'brand', 'modelNumber'],
  },
  Warranty: {
    entityId: 'entity.warranty',
    singularLabel: 'warranty',
    pluralLabel: 'warranties',
    domainId: 'domain.warranties_coverage',
    propertyScopeRule: 'Warranty.propertyId === authorizedPropertyId (or via InventoryItem.propertyId === authorizedPropertyId)',
    identityFields: ['id', 'providerName', 'category'],
    safeDisplayFields: ['providerName', 'category', 'startDate', 'expiryDate'],
  },
  InsurancePolicy: {
    entityId: 'entity.insurance_policy',
    singularLabel: 'insurance policy',
    pluralLabel: 'insurance policies',
    domainId: 'domain.insurance_policies',
    propertyScopeRule: 'InsurancePolicy.propertyId === authorizedPropertyId',
    identityFields: ['id', 'carrierName', 'coverageType'],
    safeDisplayFields: ['carrierName', 'coverageType', 'startDate', 'expiryDate'],
  },
  PropertyMaintenanceTask: {
    entityId: 'entity.maintenance_task',
    singularLabel: 'maintenance task',
    pluralLabel: 'maintenance tasks',
    domainId: 'domain.maintenance',
    propertyScopeRule: 'PropertyMaintenanceTask.propertyId === authorizedPropertyId',
    identityFields: ['id', 'title'],
    safeDisplayFields: ['title', 'status', 'priority', 'nextDueDate'],
  },
  HomeReserveFund: {
    entityId: 'entity.home_reserve_fund',
    singularLabel: 'home reserve fund',
    pluralLabel: 'home reserve funds',
    domainId: 'domain.ownership_costs_finance',
    propertyScopeRule: 'HomeReserveFund.propertyId === authorizedPropertyId (@unique singleton)',
    identityFields: ['id', 'propertyId'],
    safeDisplayFields: ['posture', 'horizonYears', 'lastRecalculatedAt'],
  },
  PropertyTaxBillRecord: {
    entityId: 'entity.property_tax_bill',
    singularLabel: 'property tax bill',
    pluralLabel: 'property tax bills',
    domainId: 'domain.ownership_costs_finance',
    propertyScopeRule: 'PropertyTaxBillRecord.propertyId === authorizedPropertyId && status === ACTIVE && supersededById === null',
    identityFields: ['id', 'taxYear'],
    safeDisplayFields: ['taxYear', 'issueDate', 'effectiveTaxRate'],
  },
  PropertyTaxAssessmentRecord: {
    entityId: 'entity.property_tax_assessment',
    singularLabel: 'property tax assessment',
    pluralLabel: 'property tax assessments',
    domainId: 'domain.ownership_costs_finance',
    propertyScopeRule: 'PropertyTaxAssessmentRecord.propertyId === authorizedPropertyId && status === ACTIVE && supersededById === null',
    identityFields: ['id', 'taxYear'],
    safeDisplayFields: ['taxYear', 'assessmentDate'],
  },
  PropertySalePrepProfile: {
    entityId: 'entity.sale_prep_profile',
    singularLabel: 'sale prep profile',
    pluralLabel: 'sale prep profiles',
    domainId: 'domain.seller_preparation',
    propertyScopeRule: 'PropertySalePrepProfile.propertyId === authorizedPropertyId (@unique singleton)',
    identityFields: ['id', 'propertyId'],
    safeDisplayFields: ['paintCondition', 'curbAppealCondition', 'flooringCondition', 'stagingReadiness'],
  },
  PropertySaleCase: {
    entityId: 'entity.sale_case',
    singularLabel: 'sale case',
    pluralLabel: 'sale cases',
    domainId: 'domain.seller_preparation',
    propertyScopeRule: 'PropertySaleCase.propertyId === authorizedPropertyId (@unique singleton)',
    identityFields: ['id', 'propertyId'],
    safeDisplayFields: ['status', 'targetListDate', 'targetCloseDate'],
  },
  SaleReadinessItem: {
    entityId: 'entity.sale_readiness_item',
    singularLabel: 'sale readiness item',
    pluralLabel: 'sale readiness items',
    domainId: 'domain.seller_preparation',
    propertyScopeRule: 'SaleReadinessItem.saleCase.propertyId === authorizedPropertyId',
    identityFields: ['id', 'title'],
    safeDisplayFields: ['category', 'requirementClass', 'status', 'dueAt'],
  },
  HomeBuyerChecklist: {
    entityId: 'entity.buyer_checklist',
    singularLabel: 'buyer checklist',
    pluralLabel: 'buyer checklists',
    domainId: 'domain.buyer_journey',
    propertyScopeRule: 'HomeBuyerChecklist.propertyId === authorizedPropertyId (@unique singleton)',
    identityFields: ['id', 'propertyId'],
    safeDisplayFields: ['status', 'stage', 'targetCloseDate', 'moveInDate'],
  },
  HomeBuyerTask: {
    entityId: 'entity.buyer_task',
    singularLabel: 'buyer task',
    pluralLabel: 'buyer tasks',
    domainId: 'domain.buyer_journey',
    propertyScopeRule: 'HomeBuyerTask.checklist.propertyId === authorizedPropertyId && applicability !== NOT_APPLICABLE',
    identityFields: ['id', 'title'],
    safeDisplayFields: ['status', 'priority', 'dueAt', 'completedAt'],
  },
  BuyerJourneyMilestone: {
    entityId: 'entity.buyer_milestone',
    singularLabel: 'buyer milestone',
    pluralLabel: 'buyer milestones',
    domainId: 'domain.buyer_journey',
    propertyScopeRule: 'BuyerJourneyMilestone.checklist.propertyId === authorizedPropertyId',
    identityFields: ['id', 'type'],
    safeDisplayFields: ['type', 'status', 'dueAt', 'completedAt'],
  },
  PropertyRecord: {
    entityId: 'entity.property_record',
    singularLabel: 'home record',
    pluralLabel: 'home records',
    domainId: 'domain.documents_records',
    propertyScopeRule: 'PropertyRecord.propertyId === authorizedPropertyId && lifecycleStatus === ACTIVE && trashedAt === null && visibleRecordWhere(role)',
    identityFields: ['id', 'title'],
    safeDisplayFields: ['title', 'recordType', 'verificationStatus', 'effectiveTo'],
  },
  PropertyRecordVersion: {
    entityId: 'entity.property_record_version',
    singularLabel: 'record version',
    pluralLabel: 'record versions',
    domainId: 'domain.documents_records',
    propertyScopeRule: 'PropertyRecordVersion.record.propertyId === authorizedPropertyId && parent PropertyRecord visible to role',
    identityFields: ['id', 'versionNumber'],
    safeDisplayFields: ['versionNumber', 'createdAt', 'scanStatus', 'integrityStatus'],
  },
  Claim: {
    entityId: 'entity.claim',
    singularLabel: 'claim',
    pluralLabel: 'claims',
    domainId: 'domain.claims',
    propertyScopeRule: 'Claim.propertyId === authorizedPropertyId',
    identityFields: ['id', 'title', 'type'],
    safeDisplayFields: ['type', 'status', 'incidentAt', 'openedAt', 'nextFollowUpAt'],
  },
  ClaimChecklistItem: {
    entityId: 'entity.claim_checklist_item',
    singularLabel: 'claim checklist step',
    pluralLabel: 'claim checklist steps',
    domainId: 'domain.claims',
    propertyScopeRule: 'ClaimChecklistItem.claim.propertyId === authorizedPropertyId (via named Claim)',
    identityFields: ['id', 'orderIndex'],
    safeDisplayFields: ['orderIndex', 'status', 'required', 'completedAt'],
  },
  ClaimTimelineEvent: {
    entityId: 'entity.claim_timeline_event',
    singularLabel: 'claim timeline event',
    pluralLabel: 'claim timeline events',
    domainId: 'domain.claims',
    propertyScopeRule: 'ClaimTimelineEvent.claim.propertyId === authorizedPropertyId && ClaimTimelineEvent.propertyId === authorizedPropertyId',
    identityFields: ['id', 'type'],
    safeDisplayFields: ['type', 'occurredAt'],
  },
  ClaimDocument: {
    entityId: 'entity.claim_document',
    singularLabel: 'claim document',
    pluralLabel: 'claim documents',
    domainId: 'domain.claims',
    propertyScopeRule: 'ClaimDocument.claim.propertyId === authorizedPropertyId INTERSECT ClaimDocument.document visibleRecordWhere(role)',
    identityFields: ['id', 'type'],
    safeDisplayFields: ['type', 'createdAt'],
  },
};

const ROLE_ORDER: Record<AudienceFloor, number> = { VIEWER: 1, CONTRIBUTOR: 2, OWNER: 3 };

export function buildSemanticEntityRegistry(): readonly SemanticEntityRegistration[] {
  const entities = Object.keys(ENTITY_METADATA) as DataPointEntity[];
  return entities.map((prismaModel) => {
    const meta = ENTITY_METADATA[prismaModel];
    const points = DATA_POINT_DEFINITIONS.filter((point) => point.entity === prismaModel);
    const minRank = Math.min(...points.map((point) => ROLE_ORDER[point.audience]));
    const minimumAudience: AudienceFloor = minRank === 3 ? 'OWNER' : minRank === 2 ? 'CONTRIBUTOR' : 'VIEWER';
    const hasFinancial = points.some((point) => point.sensitivity === 'FINANCIAL');
    const relations = ASK_TRAVERSABLE_RELATION_PATH_MANIFEST
      .filter((rel) => rel.sourceEntity === prismaModel || rel.targetEntity === prismaModel)
      .map((rel) => rel.semanticRelationId);

    return {
      entityId: meta.entityId,
      prismaModel,
      singularLabel: meta.singularLabel,
      pluralLabel: meta.pluralLabel,
      domainId: meta.domainId,
      propertyScopeRule: meta.propertyScopeRule,
      minimumAudience,
      sensitivityClass: hasFinancial ? 'FINANCIAL' : 'HOME',
      identityFields: meta.identityFields,
      safeDisplayFields: meta.safeDisplayFields,
      supportedFieldIds: points.map((point) => `field.${point.id}`),
      supportedRelationIds: [...new Set(relations)],
      resolverAdapterId: prismaModel === 'InventoryItem' ? 'property-entity-resolver' : 'data-point-entity-matcher',
      queryAdapterId: prismaModel in RELATION_ENTITIES ? 'data-point-relation-reader' : 'data-point-allowlisted-reader',
      provenanceAdapterId: 'semantic-execution-receipt-adapter',
    };
  });
}

export interface SemanticFieldRegistration {
  readonly fieldId: string;
  readonly canonicalDataPointId: string;
  readonly entityId: string;
  readonly prismaModel: DataPointEntity;
  readonly storageColumn: string;
  readonly prismaType: string;
  readonly valueFamily: string;
  readonly nullableInSchema: boolean;
  readonly enumVocabulary: readonly string[] | null;
  readonly supportedOperators: readonly string[];
  readonly projectionEligible: boolean;
  readonly sortEligible: boolean;
  readonly groupEligible: boolean;
  readonly aggregateEligible: boolean;
  readonly audienceFloor: AudienceFloor;
  readonly sensitivity: 'HOME' | 'FINANCIAL';
  readonly propertyContextFactKeys: readonly string[];
}

export function buildSemanticFieldRegistry(): readonly SemanticFieldRegistration[] {
  const modelsByName = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));
  const enumsByName = new Map(Prisma.dmmf.datamodel.enums.map((enumDef) => [enumDef.name, enumDef.values.map((v) => v.name)]));

  return DATA_POINT_DEFINITIONS.map((point) => {
    const model = modelsByName.get(point.entity);
    const schemaField = model?.fields.find((f) => f.name === point.field);
    const enumVocab = schemaField?.kind === 'enum' ? (enumsByName.get(schemaField.type) ?? null) : null;
    const ownerKey = `${point.entity}.${point.field}`;
    const matchingContextFacts = PROPERTY_FACT_CATALOG
      .filter((fact) => fact.canonicalOwner === ownerKey || fact.canonicalOwner.includes(ownerKey))
      .map((fact) => fact.key);

    const isNumericOrMoney = ['money', 'dollars', 'percent', 'number'].includes(point.family);
    const isDate = point.family === 'date';
    const operators = isNumericOrMoney
      ? ['EQ', 'NEQ', 'GT', 'GTE', 'LT', 'LTE', 'IS_NULL', 'IS_NOT_NULL']
      : isDate
        ? ['EQ', 'BEFORE', 'AFTER', 'BETWEEN', 'IS_NULL', 'IS_NOT_NULL']
        : ['EQ', 'NEQ', 'IN', 'IS_NULL', 'IS_NOT_NULL'];

    return {
      fieldId: `field.${point.id}`,
      canonicalDataPointId: point.id,
      entityId: ENTITY_METADATA[point.entity].entityId,
      prismaModel: point.entity,
      storageColumn: point.field,
      prismaType: schemaField?.type ?? 'UNKNOWN',
      valueFamily: point.family,
      nullableInSchema: schemaField ? !schemaField.isRequired : true,
      enumVocabulary: enumVocab,
      supportedOperators: operators,
      projectionEligible: true,
      sortEligible: isNumericOrMoney || isDate,
      groupEligible: point.family === 'enum',
      aggregateEligible: isNumericOrMoney,
      audienceFloor: point.audience,
      sensitivity: point.sensitivity,
      propertyContextFactKeys: matchingContextFacts,
    };
  });
}

export interface SchemaCatalogueReconciliationReport {
  readonly totalPrismaModels: number;
  readonly totalPrismaEnums: number;
  readonly propertyScopedEntityCount: number;
  readonly candidateEntityCount: number;
  readonly excludedDefaultEntityCount: number;
  readonly cataloguedDataPointEntityCount: number;
  readonly cataloguedDataPointFieldCount: number;
  readonly propertyFactCatalogCount: number;
  readonly propertyFactsMappedToDataPoints: readonly string[];
  readonly propertyFactsUncoveredByDataPointCatalogue: ReadonlyArray<{
    readonly factKey: string;
    readonly scope: string;
    readonly canonicalOwner: string;
    readonly reason: 'COLLECTION_OR_COMPOSITE_OWNER' | 'SCALAR_PROPERTY_FACT_NOT_IN_DATA_POINT_CATALOGUE' | 'ROLE_OR_DERIVED_FACT';
  }>;
}

export function buildSchemaCatalogueReconciliationReport(): SchemaCatalogueReconciliationReport {
  const dispositions = Object.entries(entityDispositionsManifest.entities);
  const candidateEntities = dispositions.filter(([, value]) => value.disposition === 'CANDIDATE');
  const excludedEntities = dispositions.filter(([, value]) => value.disposition === 'EXCLUDED_DEFAULT');

  const fields = buildSemanticFieldRegistry();
  const coveredFactKeys = new Set(fields.flatMap((field) => field.propertyContextFactKeys));

  const uncoveredFacts = PROPERTY_FACT_CATALOG
    .filter((fact) => !coveredFactKeys.has(fact.key))
    .map((fact) => {
      const hasDot = fact.canonicalOwner.includes('.') && !fact.canonicalOwner.startsWith('Derived ');
      const isRoleOrDerived = fact.canonicalOwner.startsWith('Derived ') || fact.canonicalOwner.startsWith('HouseholdMember.') || fact.canonicalOwner.startsWith('PropertyResponsibility.');
      return {
        factKey: fact.key,
        scope: fact.scope,
        canonicalOwner: fact.canonicalOwner,
        reason: isRoleOrDerived
          ? ('ROLE_OR_DERIVED_FACT' as const)
          : hasDot
            ? ('SCALAR_PROPERTY_FACT_NOT_IN_DATA_POINT_CATALOGUE' as const)
            : ('COLLECTION_OR_COMPOSITE_OWNER' as const),
      };
    });

  return {
    totalPrismaModels: Prisma.dmmf.datamodel.models.length,
    totalPrismaEnums: Prisma.dmmf.datamodel.enums.length,
    propertyScopedEntityCount: dispositions.length,
    candidateEntityCount: candidateEntities.length,
    excludedDefaultEntityCount: excludedEntities.length,
    cataloguedDataPointEntityCount: Object.keys(ENTITY_METADATA).length,
    cataloguedDataPointFieldCount: DATA_POINT_DEFINITIONS.length,
    propertyFactCatalogCount: PROPERTY_FACT_CATALOG.length,
    propertyFactsMappedToDataPoints: [...coveredFactKeys].sort(),
    propertyFactsUncoveredByDataPointCatalogue: uncoveredFacts,
  };
}

export interface SemanticCapabilityInventoryRow {
  readonly capabilityId: string;
  readonly semanticJobId: string;
  readonly operationId: AskOperationId;
  readonly domainId: SemanticDomainId;
  readonly requestClass: 'DATA_QUERY' | 'ANALYSIS_OR_DECISION' | 'WORKFLOW_OR_COMMAND' | 'BOUNDARY_OR_DISCOVERY';
  readonly effectClass: 'READ' | 'PREVIEW' | 'EFFECT';
  readonly messageRoutable: boolean;
  readonly propertyRoleFloor: string | null;
  readonly skillId: string | null;
  readonly domainCommandId: string | null;
  readonly answerContractEvidenceTier: string;
  readonly answerVariantCount: number;
}

/**
 * Authoritative, exhaustive domain ownership registry for all 231 AskOperationIds (FR-ONT-4).
 * Replaces heuristic operation-name prefix regexes and forbids default-domain fallback guessing.
 */
export const ASK_OPERATION_DOMAIN_OWNERSHIP: Readonly<Record<AskOperationId, SemanticDomainId>> = Object.freeze({
  // domain.safety_boundary
  EMERGENCY_BOUNDARY: 'domain.safety_boundary',
  UNSAFE_RESTRICTED_BOUNDARY: 'domain.safety_boundary',
  OUT_OF_SCOPE_BOUNDARY: 'domain.safety_boundary',
  GROUNDED_GUIDANCE: 'domain.safety_boundary',
  CAPABILITY_DISCOVERY: 'domain.safety_boundary',

  // domain.property_profile
  PROPERTY_SUMMARY: 'domain.property_profile',
  INTELLIGENCE_ENVELOPE_QUERY: 'domain.property_profile',
  DATA_POINT_READ: 'domain.property_profile',
  HOA_COMPLIANCE_STATUS: 'domain.property_profile',
  HOA_COMPLIANCE_COMMAND: 'domain.property_profile',
  PROPERTY_BRIEFS_LIST: 'domain.property_profile',
  PROPERTY_BRIEF_COMMAND: 'domain.property_profile',
  HOME_BRIEFING_SHARE_COMMAND: 'domain.property_profile',
  HOME_BRIEFING_COMMAND: 'domain.property_profile',
  HOME_BRIEFING_VIEW: 'domain.property_profile',
  HOME_BASICS_GUIDE: 'domain.property_profile',
  HOME_STATUS_BOARD: 'domain.property_profile',
  STATUS_BOARD_COMMAND: 'domain.property_profile',
  PROPERTY_PURCHASE_DATE_SET: 'domain.property_profile',
  PROPERTY_CONTEXT_AREA_CAPTURE: 'domain.property_profile',
  HOME_JOURNEY_SET: 'domain.property_profile',
  CAPTURE_FACT_CONFIRM: 'domain.property_profile',
  ENVIRONMENT_REPORT: 'domain.property_profile',
  ENVIRONMENT_REPORT_COMMAND: 'domain.property_profile',
  COMMUNITY_UPDATES: 'domain.property_profile',

  // domain.inventory
  INVENTORY_LOOKUP: 'domain.inventory',
  REPLACEMENT_GUIDANCE: 'domain.inventory',
  APPLIANCE_FAILURE_RISK: 'domain.inventory',
  MATERIAL_SPECS_LIST: 'domain.inventory',
  MATERIAL_SPEC_ADD: 'domain.inventory',
  MATERIAL_SPEC_UPDATE: 'domain.inventory',
  PLANT_CARE_OUTLOOK: 'domain.inventory',
  ROOM_PLANT_RECOMMENDATIONS: 'domain.inventory',
  HOME_PLANT_ADD: 'domain.inventory',
  ITEM_REPLACEMENT_COST: 'domain.inventory',
  ITEM_REPAIR_REPLACE_VERDICT: 'domain.inventory',
  INVENTORY_ITEM_CORRECT: 'domain.inventory',
  INVENTORY_ITEM_CREATE: 'domain.inventory',
  ROOM_RENAME: 'domain.inventory',
  ROOM_CREATE: 'domain.inventory',
  HVAC_DECISION_START: 'domain.inventory',
  HVAC_DECISION_CONTINUE: 'domain.inventory',
  HVAC_SPECIALIST_ENGAGE: 'domain.inventory',
  HVAC_DECISION_SCENARIO: 'domain.inventory',
  HVAC_DECISION_ABANDON: 'domain.inventory',
  HVAC_PREFERENCE_SAVE: 'domain.inventory',
  HVAC_PREFERENCE_FORGET: 'domain.inventory',
  HVAC_DECISION_OUTCOME_REPORT: 'domain.inventory',
  HVAC_DECISION_OUTCOME_VIEW: 'domain.inventory',
  HVAC_DECISION_OUTCOME_UNLINK: 'domain.inventory',

  // domain.maintenance
  MAINTENANCE_STATUS: 'domain.maintenance',
  MAINTENANCE_TASK_CREATE: 'domain.maintenance',
  MAINTENANCE_TASK_COMPLETE: 'domain.maintenance',
  MAINTENANCE_TASK_UPDATE: 'domain.maintenance',
  MAINTENANCE_FORECAST: 'domain.maintenance',
  MAINTENANCE_BUDGET_FORECAST: 'domain.maintenance',
  MAINTENANCE_TEMPLATES_BROWSE: 'domain.maintenance',
  MAINTENANCE_EVIDENCE_ATTACH: 'domain.maintenance',
  SEASONAL_HOME_CARE: 'domain.maintenance',
  SEASONAL_CHECKLIST_SETUP: 'domain.maintenance',
  SEASONAL_ITEM_COMMAND: 'domain.maintenance',
  DIY_PROJECTS: 'domain.maintenance',
  DIY_PROJECT_GUIDE: 'domain.maintenance',
  DIY_STEP_UPDATE: 'domain.maintenance',
  DIY_PROJECT_COMPLETE: 'domain.maintenance',
  DIY_PROJECT_ABANDON: 'domain.maintenance',
  DIY_TEMPLATE_BROWSE: 'domain.maintenance',
  DIY_PROJECT_START: 'domain.maintenance',
  DIY_COMPLETION_RECOVER: 'domain.maintenance',
  DIY_PROJECT_NOTE_COMMAND: 'domain.maintenance',
  DIY_SKILL_PROFILE_COMMAND: 'domain.maintenance',
  HOME_HABITS: 'domain.maintenance',
  HOME_HABIT_UPDATE: 'domain.maintenance',
  HOME_HABIT_PREFERENCES_COMMAND: 'domain.maintenance',
  HOME_HABITS_GENERATE: 'domain.maintenance',
  HOME_ACTIONS: 'domain.maintenance',
  OPERATIONAL_WORK_UPDATE: 'domain.maintenance',
  HOME_WORK_ITEM_COMMAND: 'domain.maintenance',
  HOME_WORK_ITEMS: 'domain.maintenance',
  WORK_REQUEST_COMMAND: 'domain.maintenance',
  WORK_OVERVIEW: 'domain.maintenance',
  HOME_DEADLINE_MONITOR: 'domain.maintenance',

  // domain.warranties_coverage
  WARRANTY_LOOKUP: 'domain.warranties_coverage',
  WARRANTY_UPDATE: 'domain.warranties_coverage',
  CAPTURE_WARRANTY_CONFIRM: 'domain.warranties_coverage',
  COVERAGE_GAPS: 'domain.warranties_coverage',
  COVERAGE_COMPARISON_STATUS: 'domain.warranties_coverage',
  COVERAGE_RECORD_CHECK: 'domain.warranties_coverage',
  COVERAGE_TERM_REVIEW: 'domain.warranties_coverage',
  COVERAGE_ANALYSIS_RUN: 'domain.warranties_coverage',
  COVERAGE_COMMAND: 'domain.warranties_coverage',
  COVERAGE_REVIEW_STATUS: 'domain.warranties_coverage',

  // domain.insurance_policies
  BUYER_INSURANCE_COMMAND: 'domain.insurance_policies',
  BUYER_INSURANCE_READINESS: 'domain.insurance_policies',

  // domain.claims
  INCIDENT_CLAIM_STATUS: 'domain.claims',
  CLAIM_FILE: 'domain.claims',
  CLAIM_TRANSITION: 'domain.claims',
  INCIDENT_CONTINUATION: 'domain.claims',
  CLAIM_ACTIVITY_COMMAND: 'domain.claims',
  CLAIM_CHECKLIST_VIEW: 'domain.claims',

  // domain.documents_records
  DOCUMENT_LOOKUP: 'domain.documents_records',
  DOCUMENT_PROMOTION_REVIEW: 'domain.documents_records',
  DOCUMENT_PROMOTION_CONFIRM: 'domain.documents_records',
  HOME_DIGITAL_WILL: 'domain.documents_records',
  HOME_DIGITAL_WILL_CREATE: 'domain.documents_records',
  HOME_RECORD_STATE_COMMAND: 'domain.documents_records',
  HOME_RECORD_EXPORT: 'domain.documents_records',
  HOME_RECORD_EXPORT_SHARE: 'domain.documents_records',
  HOME_RECORD_EXPORT_STATUS: 'domain.documents_records',
  CAPTURE_EVIDENCE_CONFIRM: 'domain.documents_records',

  // domain.ownership_costs_finance
  SAVINGS_OPPORTUNITIES: 'domain.ownership_costs_finance',
  SAVINGS_BENEFIT_COMMAND: 'domain.ownership_costs_finance',
  OWNERSHIP_COSTS: 'domain.ownership_costs_finance',
  OWNERSHIP_COST_COMMAND: 'domain.ownership_costs_finance',
  REFINANCE_ANALYSIS: 'domain.ownership_costs_finance',
  REFINANCE_RATE_MONITOR: 'domain.ownership_costs_finance',
  REFINANCE_COMMAND: 'domain.ownership_costs_finance',
  FINANCING_PROFILE_COMMAND: 'domain.ownership_costs_finance',
  FINANCING_OVERVIEW: 'domain.ownership_costs_finance',
  BREAK_EVEN_ANALYSIS: 'domain.ownership_costs_finance',
  CAPITAL_RESERVE_PLAN: 'domain.ownership_costs_finance',
  CAPITAL_ITEM_FUNDING_GOAL: 'domain.ownership_costs_finance',
  ITEM_RESERVE_ALLOCATION: 'domain.ownership_costs_finance',
  RESERVE_FUND_COMMAND: 'domain.ownership_costs_finance',
  CAPITAL_TIMELINE_COMMAND: 'domain.ownership_costs_finance',
  PROPERTY_TAX_APPEAL_READINESS: 'domain.ownership_costs_finance',
  PROPERTY_TAX_APPEAL_COMMAND: 'domain.ownership_costs_finance',
  PROPERTY_TAX_COMPARABLE_COMMAND: 'domain.ownership_costs_finance',

  // domain.projects_quotes_vendors
  PRICE_FINALIZATIONS_LIST: 'domain.projects_quotes_vendors',
  PRICE_FINALIZATION_COMMAND: 'domain.projects_quotes_vendors',
  HIRING_GUIDE: 'domain.projects_quotes_vendors',
  SERVICE_PRICE_CHECKS: 'domain.projects_quotes_vendors',
  SERVICE_PRICE_CHECK_RUN: 'domain.projects_quotes_vendors',
  PROJECT_TRACKER_PROJECTS: 'domain.projects_quotes_vendors',
  PROJECT_TRACKER_CREATE: 'domain.projects_quotes_vendors',
  PROJECT_TRACKER_COMMAND: 'domain.projects_quotes_vendors',
  HOME_UPGRADE_SCENARIOS: 'domain.projects_quotes_vendors',
  HOME_UPGRADE_COMMAND: 'domain.projects_quotes_vendors',
  NEGOTIATION_SHIELD_CASES: 'domain.projects_quotes_vendors',
  NEGOTIATION_SHIELD_CASE_START: 'domain.projects_quotes_vendors',
  NEGOTIATION_SHIELD_BUYER_COMMAND: 'domain.projects_quotes_vendors',
  NEGOTIATION_SHIELD_CASE_ATTACH: 'domain.projects_quotes_vendors',
  NEGOTIATION_SHIELD_CASE_UPDATE: 'domain.projects_quotes_vendors',
  NEGOTIATION_SHIELD_CASE_ANALYZE: 'domain.projects_quotes_vendors',
  QUOTE_COMPARISON_CREATE: 'domain.projects_quotes_vendors',
  QUOTE_COMPARISON_REVIEW: 'domain.projects_quotes_vendors',
  QUOTE_COMPARISON_COMMAND: 'domain.projects_quotes_vendors',
  RENOVATION_PERMIT_READINESS: 'domain.projects_quotes_vendors',
  RENOVATION_CASE_START: 'domain.projects_quotes_vendors',
  RENOVATION_READINESS_COMMAND: 'domain.projects_quotes_vendors',
  PERMIT_TRACKER_COMMAND: 'domain.projects_quotes_vendors',
  PERMIT_TRACKER_STATUS: 'domain.projects_quotes_vendors',

  // domain.risks_recalls_inspections
  INSPECTION_FINDINGS: 'domain.risks_recalls_inspections',
  INSPECTION_FINDING_UPDATE: 'domain.risks_recalls_inspections',
  INSPECTION_NEGOTIATION_PACKAGE: 'domain.risks_recalls_inspections',
  INSPECTION_FINDING_DECISION_COMMAND: 'domain.risks_recalls_inspections',
  INSPECTION_REPORT_FINDINGS: 'domain.risks_recalls_inspections',
  INSPECTION_REPORT_COMMAND: 'domain.risks_recalls_inspections',
  INSPECTION_REPORT_COMPARE: 'domain.risks_recalls_inspections',
  INSPECTION_REPORTS: 'domain.risks_recalls_inspections',
  INSPECTION_REPORT_REVIEW: 'domain.risks_recalls_inspections',
  INSPECTION_FINDINGS_CHECK: 'domain.risks_recalls_inspections',
  RECALL_REVIEW: 'domain.risks_recalls_inspections',
  RECALL_MATCH_UPDATE: 'domain.risks_recalls_inspections',
  DO_NOTHING_SIMULATION: 'domain.risks_recalls_inspections',
  DO_NOTHING_SCENARIO_COMMAND: 'domain.risks_recalls_inspections',
  DO_NOTHING_SIMULATION_RUN: 'domain.risks_recalls_inspections',
  PAST_HAZARD_EXPOSURE: 'domain.risks_recalls_inspections',
  PAST_HAZARD_OUTCOME_COMMAND: 'domain.risks_recalls_inspections',
  RISK_MITIGATION_PLAN: 'domain.risks_recalls_inspections',
  HOME_EVENT_RADAR_FEED: 'domain.risks_recalls_inspections',
  HOME_EVENT_RADAR_STATE: 'domain.risks_recalls_inspections',
  HOME_EVENT_RADAR_MARK_DONE: 'domain.risks_recalls_inspections',
  HOME_EVENT_RADAR_FEEDBACK: 'domain.risks_recalls_inspections',
  HOME_EVENT_RADAR_TASK: 'domain.risks_recalls_inspections',
  HOME_EVENT_RADAR_PREFERENCES: 'domain.risks_recalls_inspections',
  NEIGHBORHOOD_CHANGE_FEED: 'domain.risks_recalls_inspections',
  NEIGHBORHOOD_INTERACTION_COMMAND: 'domain.risks_recalls_inspections',

  // domain.timeline_home_events
  HOME_TIMELINE_EVENTS: 'domain.timeline_home_events',
  HOME_EVENT_CORRECT: 'domain.timeline_home_events',
  HOME_EVENT_UPDATE: 'domain.timeline_home_events',
  HOME_EVENT_VISIBILITY: 'domain.timeline_home_events',
  MAJOR_EVENT_ENTRY: 'domain.timeline_home_events',
  HOME_CHANGE_SUMMARY: 'domain.timeline_home_events',
  CAPTURE_EVENT_CONFIRM: 'domain.timeline_home_events',

  // domain.buyer_journey
  BUYER_CONTRACT_COMMAND: 'domain.buyer_journey',
  BUYER_CLOSING_DISCLOSURE_COMMAND: 'domain.buyer_journey',
  BUYER_LOAN_ESTIMATE_COMMAND: 'domain.buyer_journey',
  BUYER_PLAN_SETUP_COMMAND: 'domain.buyer_journey',
  BUYER_LOAN_ESTIMATES: 'domain.buyer_journey',
  BUYER_CLOSING_ITEM_COMMAND: 'domain.buyer_journey',
  BUYER_WALKTHROUGH_COMMAND: 'domain.buyer_journey',
  BUYER_PLAN_STATUS: 'domain.buyer_journey',
  BUYER_DEADLINES: 'domain.buyer_journey',
  BUYER_DOCUMENT_READINESS: 'domain.buyer_journey',
  BUYER_INSPECTION_REVIEW: 'domain.buyer_journey',
  BUYER_TASK_COMPLETE: 'domain.buyer_journey',
  BUYER_TASK_CREATE: 'domain.buyer_journey',
  BUYER_TASK_UPDATE: 'domain.buyer_journey',
  BUYER_MOVE_STATUS: 'domain.buyer_journey',
  BUYER_FINANCING_READINESS: 'domain.buyer_journey',
  BUYER_TITLE_ESCROW_READINESS: 'domain.buyer_journey',
  BUYER_WALKTHROUGH_READINESS: 'domain.buyer_journey',
  BUYER_DISCLOSURE_FUNDS_READINESS: 'domain.buyer_journey',
  BUYER_CLOSING_DAY_READINESS: 'domain.buyer_journey',
  BUYER_CONTRACT_TIMELINE: 'domain.buyer_journey',
  BUYER_NEGOTIATION_READINESS: 'domain.buyer_journey',
  BUYER_COST_READINESS: 'domain.buyer_journey',
  BUYER_FINDING_DISPOSITION: 'domain.buyer_journey',
  BUYER_LIFECYCLE_UPDATE: 'domain.buyer_journey',

  // domain.seller_preparation
  SELL_HOLD_RENT_ANALYSIS: 'domain.seller_preparation',
  SELL_HOLD_RENT_COMMAND: 'domain.seller_preparation',
  SELL_HOLD_RENT_GOAL_CAPTURE: 'domain.seller_preparation',
  SELLER_PREP_CHECKLIST: 'domain.seller_preparation',
  SELLER_PREP_ITEM_DECISION: 'domain.seller_preparation',
  SELLER_PREP_CASE_COMMAND: 'domain.seller_preparation',

  // domain.account_household_preferences
  GUIDANCE_JOURNEYS_LIST: 'domain.account_household_preferences',
  GUIDANCE_JOURNEY_CONTINUE: 'domain.account_household_preferences',
  GUIDANCE_STEP_SKIP: 'domain.account_household_preferences',
  GUIDANCE_STEP_ACKNOWLEDGE: 'domain.account_household_preferences',
  GUIDANCE_JOURNEY_DISMISS: 'domain.account_household_preferences',
  GUIDANCE_JOURNEY_CREATE: 'domain.account_household_preferences',
  GUIDANCE_STEP_DECLARE: 'domain.account_household_preferences',
  HOUSEHOLD_INVITATION: 'domain.account_household_preferences',
  HOUSEHOLD_ACCESS_SUMMARY: 'domain.account_household_preferences',
  SAVED_ARCHIVE_COMMAND: 'domain.account_household_preferences',
  SAVED_RESULTS: 'domain.account_household_preferences',
  NOTIFICATIONS_OVERVIEW: 'domain.account_household_preferences',
  NOTIFICATION_COMMAND: 'domain.account_household_preferences',
  NOTIFICATION_SETTINGS_OVERVIEW: 'domain.account_household_preferences',
  NOTIFICATION_SETTINGS_COMMAND: 'domain.account_household_preferences',
});

export const SKILL_DOMAIN_ALLOWED_SEMANTIC_DOMAINS: Readonly<Record<string, readonly SemanticDomainId[]>> =
  Object.freeze({
    HOME_CARE: [
      'domain.maintenance',
      'domain.warranties_coverage',
      'domain.risks_recalls_inspections',
      'domain.inventory',
      'domain.projects_quotes_vendors',
      'domain.property_profile',
      'domain.account_household_preferences',
      'domain.timeline_home_events',
      'domain.ownership_costs_finance',
    ],
    HOME_PROTECTION: [
      'domain.warranties_coverage',
      'domain.insurance_policies',
      'domain.claims',
      'domain.risks_recalls_inspections',
    ],
    HOME_FINANCE: ['domain.ownership_costs_finance', 'domain.projects_quotes_vendors'],
    HOME_INTELLIGENCE: [
      'domain.inventory',
      'domain.documents_records',
      'domain.property_profile',
      'domain.maintenance',
      'domain.account_household_preferences',
      'domain.timeline_home_events',
      'domain.warranties_coverage',
    ],
    HOME_PROJECTS: ['domain.projects_quotes_vendors'],
    HOME_TRANSACTION: [
      'domain.seller_preparation',
      'domain.timeline_home_events',
      'domain.buyer_journey',
    ],
    HOUSEHOLD: ['domain.account_household_preferences'],
  });

export function buildSemanticCapabilityInventory(): readonly SemanticCapabilityInventoryRow[] {
  const answerByOp = new Map(answerContractManifest.operations.map((entry) => [entry.operationId, entry]));
  const operationIds = Object.keys(ASK_OPERATION_DEFINITIONS).sort() as AskOperationId[];

  return operationIds.map((operationId) => {
    const def = ASK_OPERATION_DEFINITIONS[operationId];
    const domainCommand = getAskDomainCommandByOperation(operationId);
    const skill = getSkillForOperation(operationId);
    const answerEntry = answerByOp.get(operationId);
    const isBoundary = def.safetyClass.endsWith('_BOUNDARY') || def.propertyRoleFloor === null;
    const isCommand = Boolean(domainCommand) || def.family === 'COMMAND';

    const requestClass = isBoundary
      ? 'BOUNDARY_OR_DISCOVERY'
      : isCommand
        ? 'WORKFLOW_OR_COMMAND'
        : operationId === 'DATA_POINT_READ' || def.family === 'RECORD_QUERY' || def.family === 'STATUS_SUMMARY'
          ? 'DATA_QUERY'
          : 'ANALYSIS_OR_DECISION';

    const effectClass = ASK_INTERNAL_OPERATION_IDS.has(operationId) && domainCommand
      ? 'EFFECT'
      : isCommand
        ? 'PREVIEW'
        : 'READ';

    return {
      capabilityId: `capability.${operationId.toLowerCase()}`,
      semanticJobId: `job.${operationId.toLowerCase()}`,
      operationId,
      domainId: ASK_OPERATION_DOMAIN_OWNERSHIP[operationId],
      requestClass,
      effectClass,
      messageRoutable: isAskMessageRoutableOperation(operationId),
      propertyRoleFloor: def.propertyRoleFloor,
      skillId: skill?.id ?? null,
      domainCommandId: domainCommand?.id ?? null,
      answerContractEvidenceTier: answerEntry?.evidenceTier ?? 'UNREGISTERED',
      answerVariantCount: answerEntry?.emittedBlockIds?.length ?? 0,
    };
  });
}

export interface ValidateSemanticOntologyOptions {
  readonly unmappedOperationIds?: readonly string[];
}

export function validateSemanticOntologyBaseline(
  options: ValidateSemanticOntologyOptions = {},
): string[] {
  const issues: string[] = [];
  const entities = buildSemanticEntityRegistry();
  const fields = buildSemanticFieldRegistry();
  const capabilities = buildSemanticCapabilityInventory();
  const registeredDomains = new Set<SemanticDomainId>(ASK_SEMANTIC_DOMAINS.map((d) => d.domainId));

  if (ASK_SEMANTIC_DOMAINS.length < 14) {
    issues.push(`Expected at least 14 §5 domains, found ${ASK_SEMANTIC_DOMAINS.length}`);
  }
  if (entities.length !== 20) {
    issues.push(`Expected 20 catalogued DataPointEntity registrations, found ${entities.length}`);
  }
  if (fields.length !== DATA_POINT_DEFINITIONS.length) {
    issues.push(`Field registry count (${fields.length}) disagrees with DATA_POINT_DEFINITIONS (${DATA_POINT_DEFINITIONS.length})`);
  }
  for (const field of fields) {
    if (field.prismaType === 'UNKNOWN') {
      issues.push(`${field.fieldId}: storage column ${field.prismaModel}.${field.storageColumn} not found in Prisma DMMF`);
    }
    const readable = READABLE_FIELDS[field.prismaModel] ?? [];
    if (!readable.includes(field.storageColumn)) {
      issues.push(`${field.fieldId}: storage column ${field.prismaModel}.${field.storageColumn} missing from READABLE_FIELDS`);
    }
  }
  if (capabilities.length !== Object.keys(ASK_OPERATION_DEFINITIONS).length) {
    issues.push(`Capability inventory count (${capabilities.length}) disagrees with ASK_OPERATION_DEFINITIONS`);
  }

  // Verify exhaustive operation domain ownership (zero fallback guessing) and skill-domain consistency.
  const allOperationIds = new Set<string>([
    ...Object.keys(ASK_OPERATION_DEFINITIONS),
    ...(options.unmappedOperationIds ?? []),
  ]);
  for (const opId of allOperationIds) {
    const ownedDomain = (ASK_OPERATION_DOMAIN_OWNERSHIP as Record<string, SemanticDomainId | undefined>)[opId];
    if (!ownedDomain || !registeredDomains.has(ownedDomain)) {
      issues.push(
        `Operation '${opId}' is missing an explicit SemanticDomainId mapping in ASK_OPERATION_DOMAIN_OWNERSHIP.`,
      );
      continue;
    }
    if (opId in ASK_OPERATION_DEFINITIONS) {
      const skill = getSkillForOperation(opId as AskOperationId);
      if (skill) {
        const allowedDomains = SKILL_DOMAIN_ALLOWED_SEMANTIC_DOMAINS[skill.domain];
        if (!allowedDomains || !allowedDomains.includes(ownedDomain)) {
          issues.push(
            `Operation '${opId}' domain '${ownedDomain}' conflicts with skill '${skill.id}' domain '${skill.domain}'.`,
          );
        }
      }
    }
  }
  for (const mappedOp of Object.keys(ASK_OPERATION_DOMAIN_OWNERSHIP)) {
    if (!(mappedOp in ASK_OPERATION_DEFINITIONS)) {
      issues.push(
        `ASK_OPERATION_DOMAIN_OWNERSHIP contains stale operationId '${mappedOp}' not present in ASK_OPERATION_DEFINITIONS.`,
      );
    }
  }

  if (ASK_SEMANTIC_RELATION_REGISTRY.length === 0) {
    issues.push('ASK_SEMANTIC_RELATION_REGISTRY must contain at least the transitional warranty relation');
  }
  if (Object.keys(ASK_DOMAIN_COMMAND_REGISTRY).length === 0 || Object.keys(SKILL_DEFINITIONS).length === 0) {
    issues.push('Domain command or skill registry failed to load');
  }

  return issues;
}
