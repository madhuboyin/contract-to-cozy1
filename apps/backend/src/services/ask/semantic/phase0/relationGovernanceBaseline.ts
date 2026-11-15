/**
 * Phase 0 Bullets 4 & 5 (FR-ONT-3, FR-ONT-7, FR-ENT-4, FR-QUERY-6, §18 Phase 0, §19 Artifacts #6, #7, #24):
 * - Semantic Relation & Predicate Meaning-Tag Manifest
 * - Cross-Domain Duplicate Relationship-Definition Report (including direct storage access outside canonical adapters)
 * - Traversable Relation-Path Inventory, Bounds & Dual-Parent Authorization Audit
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { Prisma } from '@prisma/client';
import { ASK_SEMANTIC_RELATION_REGISTRY } from '../semanticRelationRegistry';
import { DATA_POINT_ITEM_ROW_CAP, DATA_POINT_RELATION_CHILD_CAP, DATA_POINT_RELATION_PARENT_CAP } from '../../dataPoint/dataPointReader';
import { CROSS_ENTITY_RELATION_REGISTRY } from '../../dataPoint/queryShapeRegistries';

export const ASK_RELATION_GOVERNANCE_BASELINE_VERSION = 'phase0-relation-governance-1.1.0' as const;

export type PredicateUsageClass = 'READ' | 'WRITE' | 'DERIVED';

export interface SemanticPredicateMeaningTag {
  readonly predicateId: string;
  readonly semanticRelationId: string;
  readonly meaningVersion: string;
  readonly direction: 'FORWARD' | 'INVERSE';
  readonly stateSemantics:
    | 'RECORD_LINK_POSITIVE'
    | 'RECORD_LINK_NEGATIVE'
    | 'RECORD_LINK_UNKNOWN'
    | 'RECORD_LINK_CONFLICTED'
    | 'COVERAGE_SUFFICIENCY_DERIVED'
    | 'ACTIVE_PARENT_CHILD_MEMBERSHIP'
    | 'ROLE_VISIBLE_VERSION_CHAIN'
    | 'INTERSECTED_CLAIM_DOCUMENT_MEMBERSHIP';
  readonly canonicalAdapterId: string;
  readonly usage: PredicateUsageClass;
  readonly canonicalParentPredicateId: string | null;
}

export const ASK_SEMANTIC_PREDICATE_MEANING_MANIFEST: readonly SemanticPredicateMeaningTag[] = Object.freeze([
  {
    predicateId: 'predicate.inventory_item.has_warranty_record',
    semanticRelationId: 'relation.inventory_item.warranty',
    meaningVersion: 'inventory-item-warranty-links@1.0.0',
    direction: 'FORWARD',
    stateSemantics: 'RECORD_LINK_POSITIVE',
    canonicalAdapterId: 'transitional-warranty-read',
    usage: 'READ',
    canonicalParentPredicateId: null,
  },
  {
    predicateId: 'predicate.inventory_item.has_no_warranty_record',
    semanticRelationId: 'relation.inventory_item.warranty',
    meaningVersion: 'inventory-item-warranty-links@1.0.0',
    direction: 'FORWARD',
    stateSemantics: 'RECORD_LINK_NEGATIVE',
    canonicalAdapterId: 'transitional-warranty-read',
    usage: 'READ',
    canonicalParentPredicateId: null,
  },
  {
    predicateId: 'predicate.inventory_item.warranty_state_unknown',
    semanticRelationId: 'relation.inventory_item.warranty',
    meaningVersion: 'inventory-item-warranty-links@1.0.0',
    direction: 'FORWARD',
    stateSemantics: 'RECORD_LINK_UNKNOWN',
    canonicalAdapterId: 'transitional-warranty-read',
    usage: 'READ',
    canonicalParentPredicateId: null,
  },
  {
    predicateId: 'predicate.inventory_item.warranty_coverage_gap_derived',
    semanticRelationId: 'relation.inventory_item.warranty',
    meaningVersion: 'inventory-item-warranty-links@1.0.0',
    direction: 'FORWARD',
    stateSemantics: 'COVERAGE_SUFFICIENCY_DERIVED',
    canonicalAdapterId: 'transitional-warranty-read',
    usage: 'DERIVED',
    canonicalParentPredicateId: 'predicate.inventory_item.has_no_warranty_record',
  },
  {
    predicateId: 'predicate.buyer_checklist.has_active_task',
    semanticRelationId: 'relation.buyer_checklist.buyer_task',
    meaningVersion: 'buyer-checklist-tasks@1.0.0',
    direction: 'FORWARD',
    stateSemantics: 'ACTIVE_PARENT_CHILD_MEMBERSHIP',
    canonicalAdapterId: 'data-point-relation-child-reader',
    usage: 'READ',
    canonicalParentPredicateId: null,
  },
  {
    predicateId: 'predicate.buyer_checklist.has_milestone',
    semanticRelationId: 'relation.buyer_checklist.buyer_milestone',
    meaningVersion: 'buyer-checklist-milestones@1.0.0',
    direction: 'FORWARD',
    stateSemantics: 'ACTIVE_PARENT_CHILD_MEMBERSHIP',
    canonicalAdapterId: 'data-point-relation-child-reader',
    usage: 'READ',
    canonicalParentPredicateId: null,
  },
  {
    predicateId: 'predicate.sale_case.has_readiness_item',
    semanticRelationId: 'relation.sale_case.readiness_item',
    meaningVersion: 'sale-case-readiness-items@1.0.0',
    direction: 'FORWARD',
    stateSemantics: 'ACTIVE_PARENT_CHILD_MEMBERSHIP',
    canonicalAdapterId: 'data-point-relation-child-reader',
    usage: 'READ',
    canonicalParentPredicateId: null,
  },
  {
    predicateId: 'predicate.property_record.has_visible_version',
    semanticRelationId: 'relation.property_record.record_version',
    meaningVersion: 'property-record-versions@1.0.0',
    direction: 'FORWARD',
    stateSemantics: 'ROLE_VISIBLE_VERSION_CHAIN',
    canonicalAdapterId: 'data-point-record-version-reader',
    usage: 'READ',
    canonicalParentPredicateId: null,
  },
  {
    predicateId: 'predicate.claim.has_checklist_item',
    semanticRelationId: 'relation.claim.checklist_item',
    meaningVersion: 'claim-checklist-items@1.0.0',
    direction: 'FORWARD',
    stateSemantics: 'ACTIVE_PARENT_CHILD_MEMBERSHIP',
    canonicalAdapterId: 'data-point-claim-child-reader',
    usage: 'READ',
    canonicalParentPredicateId: null,
  },
  {
    predicateId: 'predicate.claim.has_timeline_event',
    semanticRelationId: 'relation.claim.timeline_event',
    meaningVersion: 'claim-timeline-events@1.0.0',
    direction: 'FORWARD',
    stateSemantics: 'ACTIVE_PARENT_CHILD_MEMBERSHIP',
    canonicalAdapterId: 'data-point-claim-child-reader',
    usage: 'READ',
    canonicalParentPredicateId: null,
  },
  {
    predicateId: 'predicate.claim.has_visible_document',
    semanticRelationId: 'relation.claim.claim_document',
    meaningVersion: 'claim-visible-documents@1.0.0',
    direction: 'FORWARD',
    stateSemantics: 'INTERSECTED_CLAIM_DOCUMENT_MEMBERSHIP',
    canonicalAdapterId: 'data-point-claim-child-reader',
    usage: 'READ',
    canonicalParentPredicateId: null,
  },
] as const);

export type RelationshipAccessClassification =
  | 'CANONICAL_ADAPTER'
  | 'GOVERNED_CONSUMER_OF_CANONICAL_ADAPTER'
  | 'GOVERNED_CATALOGUE_OR_AUTH_CONTRACT'
  | 'SPECIALIZED_DERIVED_ANALYSIS_PENDING_MIGRATION'
  | 'DIRECT_STORAGE_OUTSIDE_CANONICAL_ADAPTER';

export interface RelationshipStorageAccessSite {
  readonly siteId: string;
  readonly semanticRelationId: string;
  readonly relativeFilePath: string;
  readonly usage: PredicateUsageClass;
  readonly storageColumnsAccessed: readonly string[];
  readonly classification: RelationshipAccessClassification;
  readonly contradictionOrDriftNote: string;
}

export const GOVERNED_RELATION_ACCESS_TOKENS: readonly string[] = Object.freeze([
  'warrantyId',
  'linkedWarranties',
  'claimDocument',
  'checklistItems',
  'timelineEvents',
  'readinessItems',
  'PropertyRecordVersion',
  'propertyRecordVersion',
  'SaleReadinessItem',
  'saleReadinessItem',
  'HomeBuyerTask',
  'homeBuyerTask',
  'BuyerJourneyMilestone',
  'buyerJourneyMilestone',
  'ClaimChecklistItem',
  'claimChecklistItem',
  'ClaimTimelineEvent',
  'claimTimelineEvent',
]);

export interface DiscoveredRelationAccessFile {
  readonly relativeFilePath: string;
  readonly matchedTokens: readonly string[];
}

export const ASK_RELATIONSHIP_STORAGE_ACCESS_SITES: readonly RelationshipStorageAccessSite[] = Object.freeze([
  {
    siteId: 'rel_site.transitional_warranty_read',
    semanticRelationId: 'relation.inventory_item.warranty',
    relativeFilePath: 'src/services/ask/semantic/transitionalWarrantyRead.ts',
    usage: 'READ',
    storageColumnsAccessed: ['InventoryItem.warrantyId', 'InventoryItem.linkedWarranties', 'Warranty.inventoryItemId', 'InventoryItem.coverageNotRequired', 'InventoryItem.coverageEvidenceStatus'],
    classification: 'CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Canonical transitional adapter (FR-QUERY-7): inspects both InventoryItem.warrantyId and Warranty.inventoryItemId and separates HAS_LINKED_WARRANTY_RECORD, NO_LINKED_WARRANTY_RECORD, UNKNOWN, and CONFLICTED.',
  },
  {
    siteId: 'rel_site.data_point_shapes_789_warranty',
    semanticRelationId: 'relation.inventory_item.warranty',
    relativeFilePath: 'src/services/ask/dataPoint/dataPointShapes789.ts',
    usage: 'READ',
    storageColumnsAccessed: ['InventoryItem.warrantyId', 'InventoryItem.linkedWarranties', 'Warranty.inventoryItemId'],
    classification: 'GOVERNED_CONSUMER_OF_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Consumes readTransitionalWarrantyLinks from transitionalWarrantyRead.ts and separates conflicted rows from confirmed counts.',
  },
  {
    siteId: 'rel_site.ask_record_collections_warranty',
    semanticRelationId: 'relation.inventory_item.warranty',
    relativeFilePath: 'src/services/ask/askRecordCollections.service.ts',
    usage: 'READ',
    storageColumnsAccessed: ['InventoryItem.warrantyId', 'SaleReadinessItem.saleReadinessItem', 'HomeBuyerTask.HomeBuyerTask'],
    classification: 'DIRECT_STORAGE_OUTSIDE_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Reads InventoryItem.warrantyId without reconciling Warranty.inventoryItemId (linkedWarranties); can disagree with Shape 9 / detail reads when only one link column is populated (§17.2 item 1).',
  },
  {
    siteId: 'rel_site.ask_record_detail_warranty',
    semanticRelationId: 'relation.inventory_item.warranty',
    relativeFilePath: 'src/services/ask/askRecordDetail.service.ts',
    usage: 'READ',
    storageColumnsAccessed: ['InventoryItem.warrantyId', 'InventoryItem.linkedWarranties'],
    classification: 'DIRECT_STORAGE_OUTSIDE_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Queries both InventoryItem.warrantyId and linkedWarranties directly in service query rather than calling transitionalWarrantyRead adapter.',
  },
  {
    siteId: 'rel_site.warranties_handler',
    semanticRelationId: 'relation.inventory_item.warranty',
    relativeFilePath: 'src/services/ask/handlers/warranties.handler.ts',
    usage: 'READ',
    storageColumnsAccessed: ['Warranty.inventoryItemId', 'InventoryItem.warrantyId'],
    classification: 'DIRECT_STORAGE_OUTSIDE_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Handler queries Warranty and InventoryItem directly; must migrate to canonical relation adapter in Phase 1/2A.',
  },
  {
    siteId: 'rel_site.inventory_handler',
    semanticRelationId: 'relation.inventory_item.warranty',
    relativeFilePath: 'src/services/ask/handlers/inventory.handler.ts',
    usage: 'READ',
    storageColumnsAccessed: ['InventoryItem.warrantyId'],
    classification: 'DIRECT_STORAGE_OUTSIDE_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Reads InventoryItem.warrantyId directly without checking linkedWarranties or conflict state.',
  },
  {
    siteId: 'rel_site.coverage_gap_service',
    semanticRelationId: 'relation.inventory_item.warranty',
    relativeFilePath: 'src/services/coverageGap.service.ts',
    usage: 'DERIVED',
    storageColumnsAccessed: ['Warranty.inventoryItemId'],
    classification: 'SPECIALIZED_DERIVED_ANALYSIS_PENDING_MIGRATION',
    contradictionOrDriftNote: 'Evaluates warranty coverage gaps via Warranty.inventoryItemId without delegating base link inspection to transitionalWarrantyRead.',
  },
  {
    siteId: 'rel_site.coverage_analysis_service',
    semanticRelationId: 'relation.inventory_item.warranty',
    relativeFilePath: 'src/services/coverageAnalysis.service.ts',
    usage: 'DERIVED',
    storageColumnsAccessed: ['InventoryItem.warrantyId', 'Warranty.inventoryItemId'],
    classification: 'SPECIALIZED_DERIVED_ANALYSIS_PENDING_MIGRATION',
    contradictionOrDriftNote: 'Derived coverage analysis reads warranty links directly; requires migration to predicate.inventory_item.warranty_coverage_gap_derived.',
  },
  {
    siteId: 'rel_site.home_intelligence_graph',
    semanticRelationId: 'relation.inventory_item.warranty',
    relativeFilePath: 'src/services/decisionPlatform/homeIntelligenceGraph.ts',
    usage: 'DERIVED',
    storageColumnsAccessed: ['InventoryItem.warrantyId', 'InventoryItem.linkedWarranties', 'Warranty.inventoryItemId'],
    classification: 'SPECIALIZED_DERIVED_ANALYSIS_PENDING_MIGRATION',
    contradictionOrDriftNote: 'Constructs item-to-warranty graph edges directly from Prisma fields rather than canonical relation adapter.',
  },
  {
    siteId: 'rel_site.inventory_service_write',
    semanticRelationId: 'relation.inventory_item.warranty',
    relativeFilePath: 'src/services/inventory.service.ts',
    usage: 'WRITE',
    storageColumnsAccessed: ['InventoryItem.warrantyId', 'Warranty.inventoryItemId'],
    classification: 'DIRECT_STORAGE_OUTSIDE_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Mutates item/warranty foreign keys directly; requires canonical writer governance once Owner Decision §22.1 settles cardinality.',
  },
  {
    siteId: 'rel_site.ask_capture_warranty_write',
    semanticRelationId: 'relation.inventory_item.warranty',
    relativeFilePath: 'src/services/ask/execution/askCapture.ts',
    usage: 'WRITE',
    storageColumnsAccessed: ['InventoryItem.warrantyId', 'Warranty.inventoryItemId', 'ClaimTimelineEvent.ClaimTimelineEvent'],
    classification: 'DIRECT_STORAGE_OUTSIDE_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Capture write path touches warranty link columns; governed by Phase 1 prohibition on ambiguous legacy link writes.',
  },
  {
    siteId: 'rel_site.data_point_reader_relations',
    semanticRelationId: 'relation.claim.claim_document',
    relativeFilePath: 'src/services/ask/dataPoint/dataPointReader.ts',
    usage: 'READ',
    storageColumnsAccessed: [
      'ClaimDocument.claimDocument',
      'PropertyRecordVersion.PropertyRecordVersion',
      'SaleReadinessItem.SaleReadinessItem',
      'HomeBuyerTask.HomeBuyerTask',
      'BuyerJourneyMilestone.BuyerJourneyMilestone',
      'ClaimChecklistItem.ClaimChecklistItem',
      'ClaimTimelineEvent.ClaimTimelineEvent',
    ],
    classification: 'CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Enforces intersected dual-parent authorization: Claim.propertyId AND PropertyRecord role visibility (visibleRecordWhere).',
  },
  {
    siteId: 'rel_site.ask_domain_command_registry',
    semanticRelationId: 'relation.sale_case.readiness_item',
    relativeFilePath: 'src/services/ask/askDomainCommandRegistry.ts',
    usage: 'WRITE',
    storageColumnsAccessed: ['SaleReadinessItem.SaleReadinessItem'],
    classification: 'GOVERNED_CATALOGUE_OR_AUTH_CONTRACT',
    contradictionOrDriftNote: 'Registers governed command target metadata for SaleReadinessItem.',
  },
  {
    siteId: 'rel_site.ask_operation_registry',
    semanticRelationId: 'relation.buyer_checklist.buyer_task',
    relativeFilePath: 'src/services/ask/askOperationRegistry.ts',
    usage: 'READ',
    storageColumnsAccessed: ['SaleReadinessItem.SaleReadinessItem', 'HomeBuyerTask.HomeBuyerTask'],
    classification: 'GOVERNED_CATALOGUE_OR_AUTH_CONTRACT',
    contradictionOrDriftNote: 'Declares operation entity contracts for HomeBuyerTask and SaleReadinessItem.',
  },
  {
    siteId: 'rel_site.ask_record_detail_sections',
    semanticRelationId: 'relation.sale_case.readiness_item',
    relativeFilePath: 'src/services/ask/askRecordDetailSections.ts',
    usage: 'READ',
    storageColumnsAccessed: ['SaleReadinessItem.saleReadinessItem', 'HomeBuyerTask.HomeBuyerTask'],
    classification: 'DIRECT_STORAGE_OUTSIDE_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Queries prisma.saleReadinessItem.findFirst and HomeBuyerTaskService directly for record detail sections.',
  },
  {
    siteId: 'rel_site.capture_link_reconciliation',
    semanticRelationId: 'relation.inventory_item.warranty',
    relativeFilePath: 'src/services/ask/captureLinkReconciliation.ts',
    usage: 'WRITE',
    storageColumnsAccessed: ['HomeEvent.warrantyId'],
    classification: 'DIRECT_STORAGE_OUTSIDE_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Reconciles captured HomeEvent.warrantyId links directly against Prisma.',
  },
  {
    siteId: 'rel_site.composition_authorization_view',
    semanticRelationId: 'relation.property_record.record_version',
    relativeFilePath: 'src/services/ask/composition/authorizationView.ts',
    usage: 'READ',
    storageColumnsAccessed: ['PropertyRecordVersion.PropertyRecordVersion'],
    classification: 'GOVERNED_CATALOGUE_OR_AUTH_CONTRACT',
    contradictionOrDriftNote: 'Maps CompositeSourceType CurrentPropertyRecordVersion to PropertyRecordVersion authorization model.',
  },
  {
    siteId: 'rel_site.composition_source_authorization',
    semanticRelationId: 'relation.property_record.record_version',
    relativeFilePath: 'src/services/ask/composition/sourceAuthorization.ts',
    usage: 'READ',
    storageColumnsAccessed: [
      'PropertyRecordVersion.PropertyRecordVersion',
      'SaleReadinessItem.SaleReadinessItem',
      'HomeBuyerTask.HomeBuyerTask',
      'BuyerJourneyMilestone.BuyerJourneyMilestone',
      'ClaimChecklistItem.ClaimChecklistItem',
      'ClaimTimelineEvent.ClaimTimelineEvent',
    ],
    classification: 'GOVERNED_CATALOGUE_OR_AUTH_CONTRACT',
    contradictionOrDriftNote: 'Enforces composite-turn source authorization predicates across relation child models.',
  },
  {
    siteId: 'rel_site.conversational_capture_readiness',
    semanticRelationId: 'relation.sale_case.readiness_item',
    relativeFilePath: 'src/services/ask/conversationalUnderstanding/conversationalCapture.ts',
    usage: 'READ',
    storageColumnsAccessed: ['PropertySaleCase.readinessItems'],
    classification: 'GOVERNED_CONSUMER_OF_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Reads seller-prep overview readinessItems via service overview.',
  },
  {
    siteId: 'rel_site.data_point_catalogue',
    semanticRelationId: 'relation.claim.claim_document',
    relativeFilePath: 'src/services/ask/dataPoint/dataPointCatalogue.ts',
    usage: 'READ',
    storageColumnsAccessed: [
      'ClaimDocument.claimDocument',
      'PropertyRecordVersion.PropertyRecordVersion',
      'SaleReadinessItem.SaleReadinessItem',
      'HomeBuyerTask.HomeBuyerTask',
      'BuyerJourneyMilestone.BuyerJourneyMilestone',
      'ClaimChecklistItem.ClaimChecklistItem',
      'ClaimTimelineEvent.ClaimTimelineEvent',
    ],
    classification: 'GOVERNED_CATALOGUE_OR_AUTH_CONTRACT',
    contradictionOrDriftNote: 'Declares RELATION_ENTITIES and audience floors for relation child data points.',
  },
  {
    siteId: 'rel_site.data_point_query_plan',
    semanticRelationId: 'relation.sale_case.readiness_item',
    relativeFilePath: 'src/services/ask/dataPoint/dataPointQueryPlan.ts',
    usage: 'READ',
    storageColumnsAccessed: [
      'SaleReadinessItem.saleReadinessItem',
      'HomeBuyerTask.homeBuyerTask',
      'ClaimChecklistItem.claimChecklistItem',
    ],
    classification: 'GOVERNED_CATALOGUE_OR_AUTH_CONTRACT',
    contradictionOrDriftNote: 'Declares data-point query plan delegates for relation child entities.',
  },
  {
    siteId: 'rel_site.execution_ask_confirm',
    semanticRelationId: 'relation.inventory_item.warranty',
    relativeFilePath: 'src/services/ask/execution/askConfirm.ts',
    usage: 'WRITE',
    storageColumnsAccessed: ['Warranty.warrantyId'],
    classification: 'DIRECT_STORAGE_OUTSIDE_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Handles confirmation payload parameters containing warrantyId.',
  },
  {
    siteId: 'rel_site.execution_execute_operation',
    semanticRelationId: 'relation.buyer_checklist.buyer_task',
    relativeFilePath: 'src/services/ask/execution/executeOperation.ts',
    usage: 'READ',
    storageColumnsAccessed: ['HomeBuyerTask.homeBuyerTask'],
    classification: 'DIRECT_STORAGE_OUTSIDE_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Queries prisma.homeBuyerTask.findFirst during operation execution.',
  },
  {
    siteId: 'rel_site.handler_buyer_confirm',
    semanticRelationId: 'relation.buyer_checklist.buyer_task',
    relativeFilePath: 'src/services/ask/handlers/buyerConfirm.handler.ts',
    usage: 'WRITE',
    storageColumnsAccessed: ['HomeBuyerTask.homeBuyerTask'],
    classification: 'DIRECT_STORAGE_OUTSIDE_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Queries prisma.homeBuyerTask.findFirst and mutates via HomeBuyerTaskService.',
  },
  {
    siteId: 'rel_site.handler_buyer_plan',
    semanticRelationId: 'relation.buyer_checklist.buyer_task',
    relativeFilePath: 'src/services/ask/handlers/buyerPlan.handler.ts',
    usage: 'READ',
    storageColumnsAccessed: ['HomeBuyerTask.HomeBuyerTask'],
    classification: 'GOVERNED_CONSUMER_OF_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Consumes HomeBuyerTaskService for buyer plan presentation.',
  },
  {
    siteId: 'rel_site.handler_capture_confirm',
    semanticRelationId: 'relation.inventory_item.warranty',
    relativeFilePath: 'src/services/ask/handlers/captureConfirm.handler.ts',
    usage: 'WRITE',
    storageColumnsAccessed: ['Document.warrantyId'],
    classification: 'DIRECT_STORAGE_OUTSIDE_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Links uploaded Document.warrantyId during capture confirmation.',
  },
  {
    siteId: 'rel_site.handler_claim_activity',
    semanticRelationId: 'relation.claim.checklist_item',
    relativeFilePath: 'src/services/ask/handlers/claimActivity.handler.ts',
    usage: 'WRITE',
    storageColumnsAccessed: ['ClaimChecklistItem.claimChecklistItem'],
    classification: 'DIRECT_STORAGE_OUTSIDE_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Queries and updates database.claimChecklistItem directly.',
  },
  {
    siteId: 'rel_site.handler_data_point_read',
    semanticRelationId: 'relation.property_record.record_version',
    relativeFilePath: 'src/services/ask/handlers/dataPointRead.handler.ts',
    usage: 'READ',
    storageColumnsAccessed: [
      'PropertyRecordVersion.PropertyRecordVersion',
      'SaleReadinessItem.SaleReadinessItem',
      'HomeBuyerTask.HomeBuyerTask',
      'BuyerJourneyMilestone.BuyerJourneyMilestone',
      'ClaimChecklistItem.ClaimChecklistItem',
      'ClaimTimelineEvent.ClaimTimelineEvent',
    ],
    classification: 'GOVERNED_CONSUMER_OF_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Formats canonical dataPointReader results for relation child entities.',
  },
  {
    siteId: 'rel_site.handler_home_record_writes',
    semanticRelationId: 'relation.inventory_item.warranty',
    relativeFilePath: 'src/services/ask/handlers/homeRecordWrites.handler.ts',
    usage: 'WRITE',
    storageColumnsAccessed: ['Document.warrantyId', 'Warranty.warrantyId'],
    classification: 'DIRECT_STORAGE_OUTSIDE_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Reads Document.warrantyId and stages warranty update parameters.',
  },
  {
    siteId: 'rel_site.handler_misc_handlers',
    semanticRelationId: 'relation.inventory_item.warranty',
    relativeFilePath: 'src/services/ask/handlers/miscHandlers.handler.ts',
    usage: 'READ',
    storageColumnsAccessed: ['Warranty.warrantyId'],
    classification: 'DIRECT_STORAGE_OUTSIDE_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Queries prisma.warranty.findFirst by warrantyId in deadline monitor handler.',
  },
  {
    siteId: 'rel_site.handler_record_confirm',
    semanticRelationId: 'relation.inventory_item.warranty',
    relativeFilePath: 'src/services/ask/handlers/recordConfirm.handler.ts',
    usage: 'WRITE',
    storageColumnsAccessed: ['Warranty.warrantyId'],
    classification: 'DIRECT_STORAGE_OUTSIDE_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Applies confirmed record edits to prisma.warranty by warrantyId.',
  },
  {
    siteId: 'rel_site.handler_savings_recurring_setup',
    semanticRelationId: 'relation.inventory_item.warranty',
    relativeFilePath: 'src/services/ask/handlers/savingsRecurringSetup.handler.ts',
    usage: 'READ',
    storageColumnsAccessed: ['SavingsOpportunity.warrantyId'],
    classification: 'DIRECT_STORAGE_OUTSIDE_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Selects warrantyId on recurring setup rows to determine canonical source.',
  },
  {
    siteId: 'rel_site.handler_sell_hold_rent',
    semanticRelationId: 'relation.sale_case.readiness_item',
    relativeFilePath: 'src/services/ask/handlers/sellHoldRent.handler.ts',
    usage: 'READ',
    storageColumnsAccessed: ['PropertySaleCase.readinessItems', 'SaleReadinessItem.SaleReadinessItem'],
    classification: 'GOVERNED_CONSUMER_OF_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Formats seller-prep overview readinessItems with role-aware cost redaction.',
  },
  {
    siteId: 'rel_site.handler_warranty_removal',
    semanticRelationId: 'relation.inventory_item.warranty',
    relativeFilePath: 'src/services/ask/handlers/warrantyRemoval.handler.ts',
    usage: 'WRITE',
    storageColumnsAccessed: ['Warranty.warrantyId'],
    classification: 'DIRECT_STORAGE_OUTSIDE_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Stages and executes warranty removal confirmation by warrantyId.',
  },
  {
    siteId: 'rel_site.handler_workflow_confirm',
    semanticRelationId: 'relation.sale_case.readiness_item',
    relativeFilePath: 'src/services/ask/handlers/workflowConfirm.handler.ts',
    usage: 'WRITE',
    storageColumnsAccessed: ['SaleReadinessItem.saleReadinessItem', 'Warranty.warrantyId'],
    classification: 'DIRECT_STORAGE_OUTSIDE_CANONICAL_ADAPTER',
    contradictionOrDriftNote: 'Queries prisma.saleReadinessItem.findFirst and confirms warranty/readiness workflow mutations.',
  },
  {
    siteId: 'rel_site.support_command_inputs',
    semanticRelationId: 'relation.inventory_item.warranty',
    relativeFilePath: 'src/services/ask/support/commandInputs.ts',
    usage: 'WRITE',
    storageColumnsAccessed: ['Warranty.warrantyId'],
    classification: 'GOVERNED_CATALOGUE_OR_AUTH_CONTRACT',
    contradictionOrDriftNote: 'Defines Zod validation schema for warrantyId command parameter.',
  },
  {
    siteId: 'rel_site.support_write_capability',
    semanticRelationId: 'relation.buyer_checklist.buyer_task',
    relativeFilePath: 'src/services/ask/support/writeCapability.ts',
    usage: 'WRITE',
    storageColumnsAccessed: ['HomeBuyerTask.HomeBuyerTask'],
    classification: 'GOVERNED_CATALOGUE_OR_AUTH_CONTRACT',
    contradictionOrDriftNote: 'Declares write-capability side-effect metadata referencing HomeBuyerTask.',
  },
] as const);

export type RelationPathAuditFlag =
  | 'COMPETING_FOREIGN_KEYS'
  | 'DUAL_PARENT_INTERSECTION_ENFORCED'
  | 'PERMISSIVE_DUAL_PARENT_SCHEMA_RISK'
  | 'UNBOUNDED_SCHEMA_TO_MANY_CANDIDATE';

export interface TraversableRelationPathEntry {
  readonly pathId: string;
  readonly semanticRelationId: string;
  readonly sourceEntity: string;
  readonly targetEntity: string;
  readonly edges: readonly string[];
  readonly authoritativePropertyScopeParent: string;
  readonly maxDepth: number;
  readonly maxParentCardinality: number;
  readonly maxChildCardinality: number;
  readonly maxJoinedRows: number;
  readonly cyclePolicy: 'FORBID';
  readonly filterPlacement: 'EVERY_NODE';
  readonly authorizationMode: 'SINGLE_PROPERTY_PARENT' | 'INTERSECT_ALL_PARENTS';
  readonly minimumAudienceFloor: 'VIEWER' | 'CONTRIBUTOR' | 'OWNER';
  readonly boundedInRuntime: boolean;
  readonly auditFlags: readonly RelationPathAuditFlag[];
}

export const ASK_TRAVERSABLE_RELATION_PATH_MANIFEST: readonly TraversableRelationPathEntry[] = Object.freeze([
  {
    pathId: 'path.inventory_item.warranty',
    semanticRelationId: 'relation.inventory_item.warranty',
    sourceEntity: 'InventoryItem',
    targetEntity: 'Warranty',
    edges: ['InventoryItem.warrantyId -> Warranty.id', 'Warranty.inventoryItemId -> InventoryItem.id'],
    authoritativePropertyScopeParent: 'InventoryItem.propertyId (intersected with Warranty.propertyId when non-null)',
    maxDepth: 1,
    maxParentCardinality: DATA_POINT_ITEM_ROW_CAP,
    maxChildCardinality: CROSS_ENTITY_RELATION_REGISTRY[0]?.maxJoinedRows ?? 100,
    maxJoinedRows: CROSS_ENTITY_RELATION_REGISTRY[0]?.maxJoinedRows ?? 100,
    cyclePolicy: 'FORBID',
    filterPlacement: 'EVERY_NODE',
    authorizationMode: 'INTERSECT_ALL_PARENTS',
    minimumAudienceFloor: 'VIEWER',
    boundedInRuntime: true,
    auditFlags: ['COMPETING_FOREIGN_KEYS', 'PERMISSIVE_DUAL_PARENT_SCHEMA_RISK'],
  },
  {
    pathId: 'path.inventory_item.room',
    semanticRelationId: 'relation.inventory_item.room',
    sourceEntity: 'InventoryItem',
    targetEntity: 'InventoryRoom',
    edges: ['InventoryItem.roomId -> InventoryRoom.id'],
    authoritativePropertyScopeParent: 'InventoryItem.propertyId && InventoryRoom.propertyId',
    maxDepth: 1,
    maxParentCardinality: DATA_POINT_ITEM_ROW_CAP,
    maxChildCardinality: 1,
    maxJoinedRows: DATA_POINT_ITEM_ROW_CAP,
    cyclePolicy: 'FORBID',
    filterPlacement: 'EVERY_NODE',
    authorizationMode: 'INTERSECT_ALL_PARENTS',
    minimumAudienceFloor: 'VIEWER',
    boundedInRuntime: true,
    auditFlags: [],
  },
  {
    pathId: 'path.inventory_item.maintenance_task',
    semanticRelationId: 'relation.inventory_item.maintenance_task',
    sourceEntity: 'InventoryItem',
    targetEntity: 'PropertyMaintenanceTask',
    edges: ['PropertyMaintenanceTask.inventoryItemId -> InventoryItem.id'],
    authoritativePropertyScopeParent: 'InventoryItem.propertyId && PropertyMaintenanceTask.propertyId',
    maxDepth: 1,
    maxParentCardinality: DATA_POINT_ITEM_ROW_CAP,
    maxChildCardinality: DATA_POINT_RELATION_CHILD_CAP,
    maxJoinedRows: 200,
    cyclePolicy: 'FORBID',
    filterPlacement: 'EVERY_NODE',
    authorizationMode: 'INTERSECT_ALL_PARENTS',
    minimumAudienceFloor: 'VIEWER',
    boundedInRuntime: true,
    auditFlags: [],
  },
  {
    pathId: 'path.buyer_checklist.buyer_task',
    semanticRelationId: 'relation.buyer_checklist.buyer_task',
    sourceEntity: 'HomeBuyerChecklist',
    targetEntity: 'HomeBuyerTask',
    edges: ['HomeBuyerTask.checklistId -> HomeBuyerChecklist.id'],
    authoritativePropertyScopeParent: 'HomeBuyerChecklist.propertyId',
    maxDepth: 1,
    maxParentCardinality: DATA_POINT_RELATION_PARENT_CAP,
    maxChildCardinality: DATA_POINT_RELATION_CHILD_CAP,
    maxJoinedRows: DATA_POINT_RELATION_CHILD_CAP,
    cyclePolicy: 'FORBID',
    filterPlacement: 'EVERY_NODE',
    authorizationMode: 'SINGLE_PROPERTY_PARENT',
    minimumAudienceFloor: 'VIEWER',
    boundedInRuntime: true,
    auditFlags: [],
  },
  {
    pathId: 'path.buyer_checklist.buyer_milestone',
    semanticRelationId: 'relation.buyer_checklist.buyer_milestone',
    sourceEntity: 'HomeBuyerChecklist',
    targetEntity: 'BuyerJourneyMilestone',
    edges: ['BuyerJourneyMilestone.checklistId -> HomeBuyerChecklist.id'],
    authoritativePropertyScopeParent: 'HomeBuyerChecklist.propertyId',
    maxDepth: 1,
    maxParentCardinality: DATA_POINT_RELATION_PARENT_CAP,
    maxChildCardinality: DATA_POINT_RELATION_CHILD_CAP,
    maxJoinedRows: DATA_POINT_RELATION_CHILD_CAP,
    cyclePolicy: 'FORBID',
    filterPlacement: 'EVERY_NODE',
    authorizationMode: 'SINGLE_PROPERTY_PARENT',
    minimumAudienceFloor: 'VIEWER',
    boundedInRuntime: true,
    auditFlags: [],
  },
  {
    pathId: 'path.sale_case.readiness_item',
    semanticRelationId: 'relation.sale_case.readiness_item',
    sourceEntity: 'PropertySaleCase',
    targetEntity: 'SaleReadinessItem',
    edges: ['SaleReadinessItem.saleCaseId -> PropertySaleCase.id'],
    authoritativePropertyScopeParent: 'PropertySaleCase.propertyId',
    maxDepth: 1,
    maxParentCardinality: DATA_POINT_RELATION_PARENT_CAP,
    maxChildCardinality: DATA_POINT_RELATION_CHILD_CAP,
    maxJoinedRows: DATA_POINT_RELATION_CHILD_CAP,
    cyclePolicy: 'FORBID',
    filterPlacement: 'EVERY_NODE',
    authorizationMode: 'SINGLE_PROPERTY_PARENT',
    minimumAudienceFloor: 'VIEWER',
    boundedInRuntime: true,
    auditFlags: [],
  },
  {
    pathId: 'path.property_record.record_version',
    semanticRelationId: 'relation.property_record.record_version',
    sourceEntity: 'PropertyRecord',
    targetEntity: 'PropertyRecordVersion',
    edges: ['PropertyRecordVersion.recordId -> PropertyRecord.id'],
    authoritativePropertyScopeParent: 'PropertyRecord.propertyId (filtered by visibleRecordWhere(role) + lifecycleStatus=ACTIVE)',
    maxDepth: 1,
    maxParentCardinality: 1,
    maxChildCardinality: DATA_POINT_RELATION_CHILD_CAP,
    maxJoinedRows: DATA_POINT_RELATION_CHILD_CAP,
    cyclePolicy: 'FORBID',
    filterPlacement: 'EVERY_NODE',
    authorizationMode: 'SINGLE_PROPERTY_PARENT',
    minimumAudienceFloor: 'VIEWER',
    boundedInRuntime: true,
    auditFlags: [],
  },
  {
    pathId: 'path.claim.checklist_item',
    semanticRelationId: 'relation.claim.checklist_item',
    sourceEntity: 'Claim',
    targetEntity: 'ClaimChecklistItem',
    edges: ['ClaimChecklistItem.claimId -> Claim.id'],
    authoritativePropertyScopeParent: 'Claim.propertyId',
    maxDepth: 1,
    maxParentCardinality: 1,
    maxChildCardinality: 100,
    maxJoinedRows: 100,
    cyclePolicy: 'FORBID',
    filterPlacement: 'EVERY_NODE',
    authorizationMode: 'SINGLE_PROPERTY_PARENT',
    minimumAudienceFloor: 'CONTRIBUTOR',
    boundedInRuntime: true,
    auditFlags: [],
  },
  {
    pathId: 'path.claim.timeline_event',
    semanticRelationId: 'relation.claim.timeline_event',
    sourceEntity: 'Claim',
    targetEntity: 'ClaimTimelineEvent',
    edges: ['ClaimTimelineEvent.claimId -> Claim.id'],
    authoritativePropertyScopeParent: 'Claim.propertyId && ClaimTimelineEvent.propertyId',
    maxDepth: 1,
    maxParentCardinality: 1,
    maxChildCardinality: 100,
    maxJoinedRows: 100,
    cyclePolicy: 'FORBID',
    filterPlacement: 'EVERY_NODE',
    authorizationMode: 'INTERSECT_ALL_PARENTS',
    minimumAudienceFloor: 'CONTRIBUTOR',
    boundedInRuntime: true,
    auditFlags: [],
  },
  {
    pathId: 'path.claim.claim_document',
    semanticRelationId: 'relation.claim.claim_document',
    sourceEntity: 'Claim',
    targetEntity: 'ClaimDocument',
    edges: ['ClaimDocument.claimId -> Claim.id', 'ClaimDocument.documentId -> PropertyRecord.id'],
    authoritativePropertyScopeParent: 'Claim.propertyId INTERSECT PropertyRecord(propertyId, lifecycleStatus=ACTIVE, visibleRecordWhere(role))',
    maxDepth: 1,
    maxParentCardinality: 1,
    maxChildCardinality: 100,
    maxJoinedRows: 100,
    cyclePolicy: 'FORBID',
    filterPlacement: 'EVERY_NODE',
    authorizationMode: 'INTERSECT_ALL_PARENTS',
    minimumAudienceFloor: 'CONTRIBUTOR',
    boundedInRuntime: true,
    auditFlags: ['DUAL_PARENT_INTERSECTION_ENFORCED'],
  },
] as const);

export interface DualParentSchemaAuditRow {
  readonly model: string;
  readonly parentFields: readonly string[];
  readonly requiredPolicy: 'INTERSECT_ALL_APPLICABLE_PARENTS';
  readonly riskSummary: string;
}

/**
 * Schema audit for models that carry both `homeownerProfileId` (or secondary parent FK)
 * and `propertyId`, where permissive OR authorization is forbidden by FR-ONT-3 / FR-ENT-4.
 */
export function auditDualParentSchemaModels(): DualParentSchemaAuditRow[] {
  const rows: DualParentSchemaAuditRow[] = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    const hasPropertyId = model.fields.some((f) => f.name === 'propertyId' && f.kind === 'scalar');
    const hasHomeownerProfileId = model.fields.some((f) => f.name === 'homeownerProfileId' && f.kind === 'scalar');
    if (hasPropertyId && hasHomeownerProfileId) {
      rows.push({
        model: model.name,
        parentFields: ['propertyId', 'homeownerProfileId'],
        requiredPolicy: 'INTERSECT_ALL_APPLICABLE_PARENTS',
        riskSummary: `${model.name} has both propertyId and homeownerProfileId; property-scoped Ask queries must constrain propertyId and never fall back to a permissive homeownerProfileId OR-filter across properties.`,
      });
    }
  }
  return rows.sort((a, b) => a.model.localeCompare(b.model));
}

export interface RelationshipDuplicateDefinitionReport {
  readonly version: string;
  readonly registeredRelationCount: number;
  readonly declaredPredicateCount: number;
  readonly storageAccessSiteCount: number;
  readonly directStorageOutsideCanonicalAdapterCount: number;
  readonly specializedDerivedPendingMigrationCount: number;
  readonly dualParentModels: readonly DualParentSchemaAuditRow[];
  readonly unboundedSchemaToManyRelationCount: number;
  readonly sitesByClassification: Readonly<Record<RelationshipAccessClassification, number>>;
}

export function discoverAskRelationStorageAccessFiles(
  backendRoot: string = resolve(__dirname, '../../../../..'),
): readonly DiscoveredRelationAccessFile[] {
  const askRoot = join(backendRoot, 'src/services/ask');
  if (!existsSync(askRoot)) {
    return [];
  }

  const relativeFiles: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'semantic' || entry.name === 'graphify-out') continue;
        walk(fullPath);
      } else if (entry.name.endsWith('.ts')) {
        relativeFiles.push(relative(backendRoot, fullPath).replace(/\\/g, '/'));
      }
    }
  };
  walk(askRoot);
  relativeFiles.sort();

  const discovered: DiscoveredRelationAccessFile[] = [];
  for (const relativeFilePath of relativeFiles) {
    const absPath = resolve(backendRoot, relativeFilePath);
    const sourceText = readFileSync(absPath, 'utf8');
    const noComments = sourceText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const matchedTokens = GOVERNED_RELATION_ACCESS_TOKENS.filter((token) =>
      new RegExp(`\\b${token}\\b`).test(noComments),
    );
    if (matchedTokens.length > 0) {
      discovered.push({
        relativeFilePath,
        matchedTokens,
      });
    }
  }

  return Object.freeze(discovered);
}

export function buildRelationshipDuplicateDefinitionReport(): RelationshipDuplicateDefinitionReport {
  const sitesByClassification: Record<RelationshipAccessClassification, number> = {
    CANONICAL_ADAPTER: 0,
    GOVERNED_CONSUMER_OF_CANONICAL_ADAPTER: 0,
    GOVERNED_CATALOGUE_OR_AUTH_CONTRACT: 0,
    SPECIALIZED_DERIVED_ANALYSIS_PENDING_MIGRATION: 0,
    DIRECT_STORAGE_OUTSIDE_CANONICAL_ADAPTER: 0,
  };
  for (const site of ASK_RELATIONSHIP_STORAGE_ACCESS_SITES) {
    sitesByClassification[site.classification] += 1;
  }

  const dualParentModels = auditDualParentSchemaModels();
  let totalSchemaToMany = 0;
  for (const model of Prisma.dmmf.datamodel.models) {
    totalSchemaToMany += model.fields.filter((f) => f.kind === 'object' && f.isList).length;
  }
  const boundedPaths = ASK_TRAVERSABLE_RELATION_PATH_MANIFEST.filter((p) => p.boundedInRuntime).length;

  return {
    version: ASK_RELATION_GOVERNANCE_BASELINE_VERSION,
    registeredRelationCount: ASK_SEMANTIC_RELATION_REGISTRY.length,
    declaredPredicateCount: ASK_SEMANTIC_PREDICATE_MEANING_MANIFEST.length,
    storageAccessSiteCount: ASK_RELATIONSHIP_STORAGE_ACCESS_SITES.length,
    directStorageOutsideCanonicalAdapterCount: sitesByClassification.DIRECT_STORAGE_OUTSIDE_CANONICAL_ADAPTER,
    specializedDerivedPendingMigrationCount: sitesByClassification.SPECIALIZED_DERIVED_ANALYSIS_PENDING_MIGRATION,
    dualParentModels,
    unboundedSchemaToManyRelationCount: Math.max(0, totalSchemaToMany - boundedPaths),
    sitesByClassification,
  };
}

export interface ValidateRelationGovernanceOptions {
  readonly backendRoot?: string;
  readonly extraDiscoveredRelationFiles?: readonly string[];
}

export function validateRelationGovernanceBaseline(
  backendRootOrOptions: string | ValidateRelationGovernanceOptions = resolve(__dirname, '../../../../..'),
): string[] {
  const backendRoot =
    typeof backendRootOrOptions === 'string'
      ? backendRootOrOptions
      : (backendRootOrOptions.backendRoot ?? resolve(__dirname, '../../../../..'));
  const extraDiscoveredRelationFiles =
    typeof backendRootOrOptions === 'string'
      ? []
      : (backendRootOrOptions.extraDiscoveredRelationFiles ?? []);

  const issues: string[] = [];
  const seenPredicateIds = new Set<string>();

  for (const predicate of ASK_SEMANTIC_PREDICATE_MEANING_MANIFEST) {
    if (seenPredicateIds.has(predicate.predicateId)) {
      issues.push(`${predicate.predicateId}: duplicate predicateId`);
    }
    seenPredicateIds.add(predicate.predicateId);
    if (predicate.usage === 'DERIVED' && !predicate.canonicalParentPredicateId) {
      issues.push(`${predicate.predicateId}: DERIVED predicate must declare canonicalParentPredicateId`);
    }
    if (predicate.canonicalParentPredicateId && !ASK_SEMANTIC_PREDICATE_MEANING_MANIFEST.some((p) => p.predicateId === predicate.canonicalParentPredicateId)) {
      issues.push(`${predicate.predicateId}: canonicalParentPredicateId ${predicate.canonicalParentPredicateId} is not registered`);
    }
  }

  // Verify every predicate on ASK_SEMANTIC_RELATION_REGISTRY has a meaning tag entry.
  for (const relation of ASK_SEMANTIC_RELATION_REGISTRY) {
    for (const predicateId of relation.predicateIds) {
      const tag = ASK_SEMANTIC_PREDICATE_MEANING_MANIFEST.find((item) => item.predicateId === predicateId);
      if (!tag) {
        issues.push(`${relation.semanticRelationId}: predicate ${predicateId} has no meaning tag in ASK_SEMANTIC_PREDICATE_MEANING_MANIFEST`);
      } else if (tag.semanticRelationId !== relation.semanticRelationId || tag.meaningVersion !== relation.meaningVersion) {
        issues.push(`${predicateId}: meaning tag disagrees with ASK_SEMANTIC_RELATION_REGISTRY (${tag.semanticRelationId}@${tag.meaningVersion})`);
      }
    }
  }

  // Verify every inventoried storage access site points to a real file in apps/backend.
  const registeredRelativePaths = new Set<string>();
  const seenSiteIds = new Set<string>();
  for (const site of ASK_RELATIONSHIP_STORAGE_ACCESS_SITES) {
    if (seenSiteIds.has(site.siteId)) {
      issues.push(`${site.siteId}: duplicate siteId in ASK_RELATIONSHIP_STORAGE_ACCESS_SITES`);
    }
    seenSiteIds.add(site.siteId);
    registeredRelativePaths.add(site.relativeFilePath);

    const absPath = resolve(backendRoot, site.relativeFilePath);
    if (!existsSync(absPath)) {
      issues.push(`${site.siteId}: file ${site.relativeFilePath} does not exist at ${absPath}`);
      continue;
    }
    const sourceText = readFileSync(absPath, 'utf8');
    const matchesAnyColumn = site.storageColumnsAccessed.some((col) => {
      const fieldName = col.split('.').pop() ?? col;
      return sourceText.includes(fieldName);
    });
    if (!matchesAnyColumn) {
      issues.push(`${site.siteId}: file ${site.relativeFilePath} no longer references any of [${site.storageColumnsAccessed.join(', ')}]`);
    }
  }

  // Verify repository completeness: every Ask file referencing a governed relation token must be registered.
  const discoveredRelationFiles = discoverAskRelationStorageAccessFiles(backendRoot);
  const discoveredFilePaths = new Set<string>(discoveredRelationFiles.map((item) => item.relativeFilePath));
  for (const extraFile of extraDiscoveredRelationFiles) {
    discoveredFilePaths.add(extraFile);
  }
  for (const discoveredPath of discoveredFilePaths) {
    if (!registeredRelativePaths.has(discoveredPath)) {
      issues.push(
        `Unlisted relation storage/token access file '${discoveredPath}' discovered in repository but missing from ASK_RELATIONSHIP_STORAGE_ACCESS_SITES.`,
      );
    }
  }

  // Verify every traversable relation path is bounded, forbids cycles, and places filters at every node.
  const seenPathIds = new Set<string>();
  for (const pathEntry of ASK_TRAVERSABLE_RELATION_PATH_MANIFEST) {
    if (seenPathIds.has(pathEntry.pathId)) {
      issues.push(`${pathEntry.pathId}: duplicate pathId`);
    }
    seenPathIds.add(pathEntry.pathId);
    if (pathEntry.maxDepth < 1 || pathEntry.maxDepth > 2) {
      issues.push(`${pathEntry.pathId}: maxDepth ${pathEntry.maxDepth} is out of bounds (1..2)`);
    }
    if (pathEntry.maxJoinedRows < 1 || pathEntry.maxJoinedRows > 200) {
      issues.push(`${pathEntry.pathId}: maxJoinedRows ${pathEntry.maxJoinedRows} is out of bounds (1..200)`);
    }
    if (pathEntry.cyclePolicy !== 'FORBID' || pathEntry.filterPlacement !== 'EVERY_NODE') {
      issues.push(`${pathEntry.pathId}: cyclePolicy must be FORBID and filterPlacement must be EVERY_NODE`);
    }
  }

  return issues;
}
