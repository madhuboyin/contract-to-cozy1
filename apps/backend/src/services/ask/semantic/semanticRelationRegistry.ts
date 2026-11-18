export const ASK_SEMANTIC_RELATION_REGISTRY_VERSION = 'relation-subset-0.1.0' as const;

export interface SemanticRelationRegistration {
  readonly semanticRelationId: string;
  readonly meaningVersion: string;
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly relationPathId: string;
  readonly canonicalAdapterId: string;
  readonly canonicalStoragePath: string | null;
  readonly cardinality: 'TRANSITIONAL_OWNER_PENDING' | 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_ONE' | 'MANY_TO_MANY';
  readonly maximumTraversalDepth: number;
  readonly cyclePolicy: 'FORBID';
  readonly predicateIds: readonly string[];
}

export const ASK_SEMANTIC_RELATION_REGISTRY: readonly SemanticRelationRegistration[] = Object.freeze([
  {
    semanticRelationId: 'relation.inventory_item.warranty',
    meaningVersion: 'inventory-item-warranty-links@1.0.0',
    sourceEntityId: 'entity.inventory_item',
    targetEntityId: 'entity.warranty',
    relationPathId: 'path.inventory_item.warranty',
    canonicalAdapterId: 'transitional-warranty-read',
    // The FRD owner decision on item warranty versus property-plan storage and
    // cardinality remains open. The adapter reads both legacy paths meanwhile.
    canonicalStoragePath: null,
    cardinality: 'TRANSITIONAL_OWNER_PENDING',
    maximumTraversalDepth: 1,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.inventory_item.has_warranty_record',
      'predicate.inventory_item.has_no_warranty_record',
      'predicate.inventory_item.warranty_state_unknown',
    ],
  },
  {
    semanticRelationId: 'relation.inventory_item.maintenance_task',
    meaningVersion: 'inventory-item-maintenance-links@1.0.0',
    sourceEntityId: 'entity.inventory_item',
    targetEntityId: 'entity.maintenance_task',
    relationPathId: 'path.inventory_item.maintenance_task',
    canonicalAdapterId: 'phase2a-slice-executor',
    canonicalStoragePath: 'PropertyMaintenanceTask.inventoryItemId',
    cardinality: 'ONE_TO_MANY',
    maximumTraversalDepth: 2,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.inventory_item.has_due_maintenance',
      'predicate.inventory_item.has_overdue_maintenance',
      'predicate.inventory_item.has_no_due_maintenance',
    ],
  },
  {
    semanticRelationId: 'relation.inventory_item.room',
    meaningVersion: 'inventory-item-room-links@1.0.0',
    sourceEntityId: 'entity.inventory_item',
    targetEntityId: 'entity.room',
    relationPathId: 'path.inventory_item.room',
    canonicalAdapterId: 'phase2a-slice-executor',
    canonicalStoragePath: 'InventoryItem.roomId',
    cardinality: 'MANY_TO_ONE',
    maximumTraversalDepth: 2,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.inventory_item.in_room',
    ],
  },
  {
    // "older than N years": an attribute of the item itself (its recorded install date), not a link to another record. It is registered as a path with the item as
    // both ends so it can sit in a WHERE tree beside warranty, maintenance and room conditions and be OR'd or AND'd with them.
    semanticRelationId: 'relation.inventory_item.age',
    meaningVersion: 'inventory-item-age@1.0.0',
    sourceEntityId: 'entity.inventory_item',
    targetEntityId: 'entity.inventory_item',
    relationPathId: 'path.inventory_item.age',
    canonicalAdapterId: 'phase2a-slice-executor',
    canonicalStoragePath: 'InventoryItem.installedOn',
    cardinality: 'ONE_TO_ONE',
    maximumTraversalDepth: 1,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.inventory_item.older_than_years',
    ],
  },
  {
    semanticRelationId: 'relation.maintenance_task.inventory_item',
    meaningVersion: 'maintenance-task-inventory-links@1.0.0',
    sourceEntityId: 'entity.maintenance_task',
    targetEntityId: 'entity.inventory_item',
    relationPathId: 'path.maintenance_task.inventory_item',
    canonicalAdapterId: 'phase2a-slice-executor',
    canonicalStoragePath: 'PropertyMaintenanceTask.inventoryItemId',
    cardinality: 'MANY_TO_ONE',
    maximumTraversalDepth: 2,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.maintenance_task.for_inventory_item',
    ],
  },
  // Wave 1 (Phase 2B): Maintenance & Document completeness
  {
    semanticRelationId: 'relation.maintenance_task.self',
    meaningVersion: 'maintenance-task-filters@1.0.0',
    sourceEntityId: 'entity.maintenance_task',
    targetEntityId: 'entity.maintenance_task',
    relationPathId: 'path.maintenance_task.self',
    canonicalAdapterId: 'cross-domain-wave-executor',
    canonicalStoragePath: 'PropertyMaintenanceTask',
    cardinality: 'ONE_TO_ONE',
    maximumTraversalDepth: 1,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.maintenance_task.matches_filter',
    ],
  },
  {
    semanticRelationId: 'relation.inventory_item.manual_document',
    meaningVersion: 'inventory-item-manual-docs@1.0.0',
    sourceEntityId: 'entity.inventory_item',
    targetEntityId: 'entity.property_record',
    relationPathId: 'path.inventory_item.manual_document',
    canonicalAdapterId: 'cross-domain-wave-executor',
    canonicalStoragePath: 'InventoryItem.manualDocumentId',
    cardinality: 'ONE_TO_MANY',
    maximumTraversalDepth: 1,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.inventory_item.has_manual_record',
    ],
  },
  {
    semanticRelationId: 'relation.inventory_item.receipt_document',
    meaningVersion: 'inventory-item-receipt-docs@1.0.0',
    sourceEntityId: 'entity.inventory_item',
    targetEntityId: 'entity.property_record',
    relationPathId: 'path.inventory_item.receipt_document',
    canonicalAdapterId: 'cross-domain-wave-executor',
    canonicalStoragePath: 'InventoryItem.receiptDocumentId',
    cardinality: 'ONE_TO_MANY',
    maximumTraversalDepth: 1,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.inventory_item.has_receipt_record',
    ],
  },
  // Wave 2 (Phase 3): Protection — Warranties, Insurance, Claims & Intersected Claim Documents
  {
    semanticRelationId: 'relation.warranty.self',
    meaningVersion: 'warranty-filters@1.0.0',
    sourceEntityId: 'entity.warranty',
    targetEntityId: 'entity.warranty',
    relationPathId: 'path.warranty.self',
    canonicalAdapterId: 'cross-domain-wave-executor',
    canonicalStoragePath: 'Warranty',
    cardinality: 'ONE_TO_ONE',
    maximumTraversalDepth: 1,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.warranty.matches_filter',
    ],
  },
  {
    semanticRelationId: 'relation.claim.self',
    meaningVersion: 'claim-status-filters@1.0.0',
    sourceEntityId: 'entity.claim',
    targetEntityId: 'entity.claim',
    relationPathId: 'path.claim.self',
    canonicalAdapterId: 'cross-domain-wave-executor',
    canonicalStoragePath: 'Claim.status, Claim.type',
    cardinality: 'ONE_TO_ONE',
    maximumTraversalDepth: 1,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.claim.has_status',
      'predicate.claim.has_type',
    ],
  },
  {
    semanticRelationId: 'relation.claim.claim_document',
    meaningVersion: 'claim-visible-documents@1.0.0',
    sourceEntityId: 'entity.claim',
    targetEntityId: 'entity.claim_document',
    relationPathId: 'path.claim.claim_document',
    canonicalAdapterId: 'data-point-claim-child-reader',
    canonicalStoragePath: 'ClaimDocument.claimId -> ClaimDocument.documentId',
    cardinality: 'ONE_TO_MANY',
    maximumTraversalDepth: 2,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.claim.has_visible_document',
      'predicate.claim.missing_required_document',
    ],
  },
  // Wave 3 (Phase 4A): Finance, Tax, Home Events & Recalls
  {
    semanticRelationId: 'relation.home_event.repair_expense',
    meaningVersion: 'home-event-repair-cost@1.0.0',
    sourceEntityId: 'entity.home_event',
    targetEntityId: 'entity.home_event',
    relationPathId: 'path.home_event.repair_expense',
    canonicalAdapterId: 'cross-domain-wave-executor',
    canonicalStoragePath: 'HomeEvent.actualCostCents',
    cardinality: 'ONE_TO_ONE',
    maximumTraversalDepth: 1,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.home_event.is_repair_cost',
    ],
  },
  {
    semanticRelationId: 'relation.property_tax_bill.period',
    meaningVersion: 'property-tax-bill-periods@1.0.0',
    sourceEntityId: 'entity.property_tax_bill',
    targetEntityId: 'entity.property_tax_bill',
    relationPathId: 'path.property_tax_bill.period',
    canonicalAdapterId: 'cross-domain-wave-executor',
    canonicalStoragePath: 'PropertyTaxBillRecord.taxYear',
    cardinality: 'ONE_TO_ONE',
    maximumTraversalDepth: 1,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.property_tax_bill.for_period',
      'predicate.property_tax_bill.is_unpaid',
    ],
  },
  {
    semanticRelationId: 'relation.recall.inventory_item',
    meaningVersion: 'recall-affected-items@1.0.0',
    sourceEntityId: 'entity.recall',
    targetEntityId: 'entity.inventory_item',
    relationPathId: 'path.recall.inventory_item',
    canonicalAdapterId: 'cross-domain-wave-executor',
    canonicalStoragePath: 'RecallMatch.inventoryItemId',
    cardinality: 'MANY_TO_MANY',
    maximumTraversalDepth: 2,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.recall.affects_inventory_item',
    ],
  },
  // Wave 4 (Phase 4B): Transactions, Buyer, Seller, Projects/Permits & Inspections
  {
    semanticRelationId: 'relation.buyer_checklist.buyer_task',
    meaningVersion: 'buyer-checklist-tasks@1.0.0',
    sourceEntityId: 'entity.buyer_task',
    targetEntityId: 'entity.buyer_task',
    relationPathId: 'path.buyer_checklist.buyer_task',
    canonicalAdapterId: 'data-point-relation-child-reader',
    canonicalStoragePath: 'BuyerChecklist.tasks',
    cardinality: 'ONE_TO_MANY',
    maximumTraversalDepth: 2,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.buyer_checklist.has_active_task',
    ],
  },
  {
    semanticRelationId: 'relation.sale_case.readiness_item',
    meaningVersion: 'sale-case-readiness-items@1.0.0',
    sourceEntityId: 'entity.sale_readiness_item',
    targetEntityId: 'entity.sale_readiness_item',
    relationPathId: 'path.sale_case.readiness_item',
    canonicalAdapterId: 'data-point-relation-child-reader',
    canonicalStoragePath: 'PropertySaleCase.readiness',
    cardinality: 'ONE_TO_MANY',
    maximumTraversalDepth: 2,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.sale_case.has_readiness_item',
    ],
  },
  {
    semanticRelationId: 'relation.project.permit',
    meaningVersion: 'project-permit-compliance@1.0.0',
    sourceEntityId: 'entity.project',
    targetEntityId: 'entity.permit',
    relationPathId: 'path.project.permit',
    canonicalAdapterId: 'cross-domain-wave-executor',
    canonicalStoragePath: 'HomeRenovationCase.permitComplianceState',
    cardinality: 'ONE_TO_MANY',
    maximumTraversalDepth: 2,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.project.needs_permit_or_unresolved',
    ],
  },
  {
    semanticRelationId: 'relation.permit.self',
    meaningVersion: 'permit-record-filters@1.0.0',
    sourceEntityId: 'entity.permit',
    targetEntityId: 'entity.permit',
    relationPathId: 'path.permit.self',
    canonicalAdapterId: 'cross-domain-wave-executor',
    canonicalStoragePath: 'PropertyPermitRecord',
    cardinality: 'ONE_TO_ONE',
    maximumTraversalDepth: 1,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.permit.matches_filter',
    ],
  },
  {
    semanticRelationId: 'relation.inspection_report.finding',
    meaningVersion: 'inspection-report-findings@1.0.0',
    sourceEntityId: 'entity.inspection_finding',
    targetEntityId: 'entity.inspection_report',
    relationPathId: 'path.inspection_report.finding',
    canonicalAdapterId: 'cross-domain-wave-executor',
    canonicalStoragePath: 'InspectionFinding.inspectionReportId',
    cardinality: 'MANY_TO_ONE',
    maximumTraversalDepth: 2,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.inspection_report.has_actionable_finding',
    ],
  },
  // Wave 3-5 canonical capability & scope relations
  {
    semanticRelationId: 'relation.property.finance_break_even',
    meaningVersion: 'property-finance-break-even@1.0.0',
    sourceEntityId: 'entity.property',
    targetEntityId: 'entity.property',
    relationPathId: 'path.property.finance_break_even',
    canonicalAdapterId: 'cross-domain-wave-executor',
    canonicalStoragePath: 'SellHoldRentAnalysis|RefinanceScenarioSnapshot',
    cardinality: 'ONE_TO_MANY',
    maximumTraversalDepth: 1,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.property.evaluates_break_even',
    ],
  },
  {
    semanticRelationId: 'relation.environmental_risk.weekly',
    meaningVersion: 'environmental-risk-weekly@1.0.0',
    sourceEntityId: 'entity.property',
    targetEntityId: 'entity.environmental_risk',
    relationPathId: 'path.environmental_risk.weekly',
    canonicalAdapterId: 'cross-domain-wave-executor',
    canonicalStoragePath: 'HomeRiskReplayEventMatch.homeRiskEventId',
    cardinality: 'ONE_TO_MANY',
    maximumTraversalDepth: 2,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.environmental_risk.active_in_week',
    ],
  },
  {
    semanticRelationId: 'relation.contractor_quote.comparison',
    meaningVersion: 'contractor-quote-comparison@1.0.0',
    sourceEntityId: 'entity.contractor_quote',
    targetEntityId: 'entity.contractor_quote',
    relationPathId: 'path.contractor_quote.comparison',
    canonicalAdapterId: 'cross-domain-wave-executor',
    canonicalStoragePath: 'QuoteComparisonQuote.workspaceId',
    cardinality: 'ONE_TO_MANY',
    maximumTraversalDepth: 2,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.contractor_quote.compared_in_scope',
    ],
  },
  {
    semanticRelationId: 'relation.saved_result.lookup',
    meaningVersion: 'saved-result-lookup@1.0.0',
    sourceEntityId: 'entity.property',
    targetEntityId: 'entity.saved_result',
    relationPathId: 'path.saved_result.lookup',
    canonicalAdapterId: 'cross-domain-wave-executor',
    canonicalStoragePath: 'AskSavedArtifactPreference.propertyId',
    cardinality: 'ONE_TO_MANY',
    maximumTraversalDepth: 1,
    cyclePolicy: 'FORBID',
    predicateIds: [
      'predicate.saved_result.visible_to_role',
    ],
  },
] as const);

export function findSemanticPredicateRegistration(predicateId: string, relationPathId: string): SemanticRelationRegistration | null {
  return ASK_SEMANTIC_RELATION_REGISTRY.find((relation) => relation.relationPathId === relationPathId
    && relation.predicateIds.includes(predicateId)) ?? null;
}

export function findSemanticRelationConstraintRegistration(semanticRelationId: string, predicateId: string): SemanticRelationRegistration | null {
  return ASK_SEMANTIC_RELATION_REGISTRY.find((relation) => relation.semanticRelationId === semanticRelationId
    && relation.predicateIds.includes(predicateId)) ?? null;
}
