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
] as const);

export function findSemanticPredicateRegistration(predicateId: string, relationPathId: string): SemanticRelationRegistration | null {
  return ASK_SEMANTIC_RELATION_REGISTRY.find((relation) => relation.relationPathId === relationPathId
    && relation.predicateIds.includes(predicateId)) ?? null;
}

export function findSemanticRelationConstraintRegistration(semanticRelationId: string, predicateId: string): SemanticRelationRegistration | null {
  return ASK_SEMANTIC_RELATION_REGISTRY.find((relation) => relation.semanticRelationId === semanticRelationId
    && relation.predicateIds.includes(predicateId)) ?? null;
}
