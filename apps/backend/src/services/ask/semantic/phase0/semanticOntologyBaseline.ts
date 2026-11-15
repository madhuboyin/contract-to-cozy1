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

export const ASK_SEMANTIC_ONTOLOGY_BASELINE_VERSION = 'phase0-ontology-baseline-1.0.0' as const;

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
  { domainId: 'domain.property_profile', section5Order: 1, title: 'Property profile & structure', description: 'Systems, rooms, occupancy, location, utilities, HOA, permits, and home facts.', correctnessState: 'PARTIAL' },
  { domainId: 'domain.inventory', section5Order: 2, title: 'Inventory & home assets', description: 'Appliances, systems, materials, plants/outdoor items, specifications, age, lifecycle, and condition.', correctnessState: 'PARTIAL' },
  { domainId: 'domain.maintenance', section5Order: 3, title: 'Maintenance & seasonal care', description: 'Recurring tasks, seasonal checklists, habits, DIY projects, service history, and overdue/upcoming work.', correctnessState: 'PARTIAL' },
  { domainId: 'domain.warranties_coverage', section5Order: 4, title: 'Warranties & coverage', description: 'Warranties, coverage links, expirations, coverage gaps, and coverage analyses.', correctnessState: 'PARTIAL' },
  { domainId: 'domain.insurance_policies', section5Order: 5, title: 'Insurance policies', description: 'Carriers, terms, premiums, deductibles, limits, renewals, and policy comparisons.', correctnessState: 'PARTIAL' },
  { domainId: 'domain.claims', section5Order: 6, title: 'Claims', description: 'Open/closed claims, checklists, timeline events, documents, settlements, and follow-ups.', correctnessState: 'PARTIAL' },
  { domainId: 'domain.documents_records', section5Order: 7, title: 'Documents & home records', description: 'Uploads, versions, OCR/extracted facts, verification status, retention, and evidence links.', correctnessState: 'PARTIAL' },
  { domainId: 'domain.ownership_costs_finance', section5Order: 8, title: 'Ownership costs, taxes & financing', description: 'Reserve funds, capital timelines, expenses, budgets, property taxes, assessments, appeals, mortgages, equity, refinance, and sell/hold/rent.', correctnessState: 'PARTIAL' },
  { domainId: 'domain.projects_quotes_vendors', section5Order: 9, title: 'Projects, renovations, quotes & vendors', description: 'Renovation cases, compliance, permits, contractor quotes, negotiations, price radar, bookings, and reviews.', correctnessState: 'PARTIAL' },
  { domainId: 'domain.risks_recalls_inspections', section5Order: 10, title: 'Risks, recalls, incidents & inspections', description: 'Risk reports, mitigation plans, active incidents, recalls, inspection reports, findings, and neighbourhood/environmental radar.', correctnessState: 'PARTIAL' },
  { domainId: 'domain.timeline_home_events', section5Order: 11, title: 'Home timeline & events', description: 'Home events, property changes, provenance, streaks, and daily snapshots.', correctnessState: 'PARTIAL' },
  { domainId: 'domain.buyer_journey', section5Order: 12, title: 'Buyer journey', description: 'Checklists, tasks, contingency deadlines, milestones, inspection/loan/closing workspaces, and new-home setup.', correctnessState: 'PARTIAL' },
  { domainId: 'domain.seller_preparation', section5Order: 13, title: 'Seller preparation', description: 'Sale cases, readiness items, cosmetic/room prep profiles, staging, and target listing/closing dates.', correctnessState: 'PARTIAL' },
  { domainId: 'domain.account_household_preferences', section5Order: 14, title: 'Account, household, notifications & saved work', description: 'Household members, roles, preferences, notifications, saved results, work overview, and briefs.', correctnessState: 'PARTIAL' },
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

function inferSemanticDomainForOperation(operationId: string): SemanticDomainId {
  if (/^(EMERGENCY|LEGAL_TAX|MEDICAL|UNSUPPORTED|OUT_OF_SCOPE|RESTRICTED|BOUNDARY)/.test(operationId)) return 'domain.safety_boundary';
  if (/^(INVENTORY|APPLIANCE|ROOM|MATERIAL_SPEC|PLANT)/.test(operationId)) return 'domain.inventory';
  if (/^(MAINTENANCE|SEASONAL|DIY|HOME_HABIT)/.test(operationId)) return 'domain.maintenance';
  if (/^(WARRANTY|COVERAGE)/.test(operationId)) return 'domain.warranties_coverage';
  if (/^(INSURANCE|POLICY)/.test(operationId)) return 'domain.insurance_policies';
  if (/^(CLAIM|INCIDENT_CLAIM)/.test(operationId)) return 'domain.claims';
  if (/^(DOCUMENT|RECORD|HOME_RECORD)/.test(operationId)) return 'domain.documents_records';
  if (/^(OWNERSHIP_COST|RESERVE|CAPITAL|REFINANCE|MORTGAGE|TAX|SELL_HOLD_RENT|BREAK_EVEN|SAVINGS|EQUITY)/.test(operationId)) return 'domain.ownership_costs_finance';
  if (/^(PROJECT|RENOVATION|QUOTE|NEGOTIATION|PRICE_FINALIZATION|SERVICE_PRICE|BOOKING)/.test(operationId)) return 'domain.projects_quotes_vendors';
  if (/^(RISK|RECALL|INSPECTION|HAZARD|RADAR|HOME_EVENT_RADAR|NEIGHBORHOOD|DO_NOTHING)/.test(operationId)) return 'domain.risks_recalls_inspections';
  if (/^(HOME_EVENT|TIMELINE|PROPERTY_CHANGE)/.test(operationId)) return 'domain.timeline_home_events';
  if (/^(BUYER|NEW_HOME)/.test(operationId)) return 'domain.buyer_journey';
  if (/^(SELLER|SALE_)/.test(operationId)) return 'domain.seller_preparation';
  if (/^(HOUSEHOLD|NOTIFICATION|SAVED|WORK_OVERVIEW|PREFERENCE|BRIEF)/.test(operationId)) return 'domain.account_household_preferences';
  return 'domain.property_profile';
}

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
      domainId: isBoundary ? 'domain.safety_boundary' : inferSemanticDomainForOperation(operationId),
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

export function validateSemanticOntologyBaseline(): string[] {
  const issues: string[] = [];
  const entities = buildSemanticEntityRegistry();
  const fields = buildSemanticFieldRegistry();
  const capabilities = buildSemanticCapabilityInventory();

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
  if (ASK_SEMANTIC_RELATION_REGISTRY.length === 0) {
    issues.push('ASK_SEMANTIC_RELATION_REGISTRY must contain at least the transitional warranty relation');
  }
  if (Object.keys(ASK_DOMAIN_COMMAND_REGISTRY).length === 0 || Object.keys(SKILL_DEFINITIONS).length === 0) {
    issues.push('Domain command or skill registry failed to load');
  }

  return issues;
}
