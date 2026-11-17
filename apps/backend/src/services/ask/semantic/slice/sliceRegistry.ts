import { ASK_SEMANTIC_RELATION_REGISTRY } from '../semanticRelationRegistry';
import { ASK_SHARED_SEMANTIC_LEXICON } from '../sharedSemanticLexicon';

export interface SliceEntityRegistration {
  readonly entityId: string;
  readonly modelName: string;
  readonly displayLabel: string;
  readonly primaryKeyField: string;
  readonly propertyScopeField: string;
}

export interface SliceFieldRegistration {
  readonly fieldId: string;
  readonly entityId: string;
  readonly columnName: string;
  readonly valueType: 'STRING' | 'NUMBER' | 'MONEY_CENTS' | 'DATE' | 'ENUM' | 'BOOLEAN';
  readonly sensitive: boolean;
}

export interface SliceCapabilityRegistration {
  readonly capabilityId: string;
  readonly requestClass: 'CAPABILITY' | 'COMMAND';
  readonly semanticJobId: string;
  readonly operationAdapter: string;
  readonly entityId: string;
  readonly requiresConfirmation: boolean;
  readonly minimumRole: 'VIEWER' | 'EDITOR' | 'OWNER';
}

export const SLICE_ENTITIES: readonly SliceEntityRegistration[] = Object.freeze([
  {
    entityId: 'entity.inventory_item',
    modelName: 'InventoryItem',
    displayLabel: 'Inventory Item',
    primaryKeyField: 'id',
    propertyScopeField: 'propertyId',
  },
  {
    entityId: 'entity.warranty',
    modelName: 'Warranty',
    displayLabel: 'Warranty',
    primaryKeyField: 'id',
    propertyScopeField: 'propertyId',
  },
  {
    entityId: 'entity.maintenance_task',
    modelName: 'PropertyMaintenanceTask',
    displayLabel: 'Maintenance Task',
    primaryKeyField: 'id',
    propertyScopeField: 'propertyId',
  },
  {
    entityId: 'entity.room',
    modelName: 'InventoryRoom',
    displayLabel: 'Room',
    primaryKeyField: 'id',
    propertyScopeField: 'propertyId',
  },
  {
    entityId: 'entity.home_system',
    modelName: 'HomeSystem',
    displayLabel: 'Home System',
    primaryKeyField: 'id',
    propertyScopeField: 'propertyId',
  },
]);

export const SLICE_FIELDS: readonly SliceFieldRegistration[] = Object.freeze([
  { fieldId: 'field.inventory_item.name', entityId: 'entity.inventory_item', columnName: 'name', valueType: 'STRING', sensitive: false },
  { fieldId: 'field.inventory_item.category', entityId: 'entity.inventory_item', columnName: 'category', valueType: 'ENUM', sensitive: false },
  { fieldId: 'field.inventory_item.brand', entityId: 'entity.inventory_item', columnName: 'brand', valueType: 'STRING', sensitive: false },
  { fieldId: 'field.inventory_item.model_number', entityId: 'entity.inventory_item', columnName: 'modelNumber', valueType: 'STRING', sensitive: false },
  { fieldId: 'field.inventory_item.serial_number', entityId: 'entity.inventory_item', columnName: 'serialNumber', valueType: 'STRING', sensitive: true },
  { fieldId: 'field.inventory_item.purchase_cost', entityId: 'entity.inventory_item', columnName: 'purchaseCostCents', valueType: 'MONEY_CENTS', sensitive: true },
  { fieldId: 'field.inventory_item.replacement_cost', entityId: 'entity.inventory_item', columnName: 'replacementCostCents', valueType: 'MONEY_CENTS', sensitive: true },
  { fieldId: 'field.inventory_item.installed_on', entityId: 'entity.inventory_item', columnName: 'installedOn', valueType: 'DATE', sensitive: false },
  { fieldId: 'field.warranty.provider_name', entityId: 'entity.warranty', columnName: 'providerName', valueType: 'STRING', sensitive: false },
  { fieldId: 'field.warranty.expiry_date', entityId: 'entity.warranty', columnName: 'expiryDate', valueType: 'DATE', sensitive: false },
  { fieldId: 'field.warranty.coverage_state', entityId: 'entity.warranty', columnName: 'coverageState', valueType: 'ENUM', sensitive: false },
  { fieldId: 'field.maintenance_task.title', entityId: 'entity.maintenance_task', columnName: 'title', valueType: 'STRING', sensitive: false },
  { fieldId: 'field.maintenance_task.status', entityId: 'entity.maintenance_task', columnName: 'status', valueType: 'ENUM', sensitive: false },
  { fieldId: 'field.maintenance_task.next_due_date', entityId: 'entity.maintenance_task', columnName: 'nextDueDate', valueType: 'DATE', sensitive: false },
  { fieldId: 'field.maintenance_task.priority', entityId: 'entity.maintenance_task', columnName: 'priority', valueType: 'ENUM', sensitive: false },
  { fieldId: 'field.room.name', entityId: 'entity.room', columnName: 'name', valueType: 'STRING', sensitive: false },
]);

export const SLICE_RELATIONS = ASK_SEMANTIC_RELATION_REGISTRY.filter((relation) =>
  relation.semanticRelationId === 'relation.inventory_item.warranty'
  || relation.semanticRelationId === 'relation.inventory_item.maintenance_task'
  || relation.semanticRelationId === 'relation.inventory_item.room'
  || relation.semanticRelationId === 'relation.inventory_item.age'
  || relation.semanticRelationId === 'relation.maintenance_task.inventory_item'
);

export const SLICE_CAPABILITIES: readonly SliceCapabilityRegistration[] = Object.freeze([
  {
    capabilityId: 'capability.inventory.replacement_guidance',
    requestClass: 'CAPABILITY',
    semanticJobId: 'job.inventory.replacement_guidance',
    operationAdapter: 'phase2a-replacement-guidance',
    entityId: 'entity.inventory_item',
    requiresConfirmation: false,
    minimumRole: 'VIEWER',
  },
  {
    capabilityId: 'command.maintenance.create_preview',
    requestClass: 'COMMAND',
    semanticJobId: 'job.maintenance.create',
    operationAdapter: 'phase2a-maintenance-command-preview',
    entityId: 'entity.maintenance_task',
    requiresConfirmation: true,
    minimumRole: 'EDITOR',
  },
]);

export interface SliceRegistryCompletenessReport {
  readonly ok: boolean;
  readonly missing: readonly string[];
  readonly entityCount: number;
  readonly fieldCount: number;
  readonly relationCount: number;
  readonly capabilityCount: number;
}

/**
 * Verifies that every Phase 2A entity, relation endpoint, and capability references
 * valid registrations within the unified slice registry.
 */
export function verifySliceRegistryCompleteness(): SliceRegistryCompletenessReport {
  const missing: string[] = [];
  const entityIds = new Set(SLICE_ENTITIES.map((entity) => entity.entityId));

  for (const field of SLICE_FIELDS) {
    if (!entityIds.has(field.entityId)) {
      missing.push(`field:${field.fieldId}->missing_entity:${field.entityId}`);
    }
  }

  for (const relation of SLICE_RELATIONS) {
    if (!entityIds.has(relation.sourceEntityId)) {
      missing.push(`relation:${relation.semanticRelationId}->missing_source:${relation.sourceEntityId}`);
    }
    if (!entityIds.has(relation.targetEntityId)) {
      missing.push(`relation:${relation.semanticRelationId}->missing_target:${relation.targetEntityId}`);
    }
    if (relation.cyclePolicy !== 'FORBID' || relation.maximumTraversalDepth < 1 || relation.maximumTraversalDepth > 2) {
      missing.push(`relation:${relation.semanticRelationId}->invalid_traversal_bound`);
    }
  }

  for (const capability of SLICE_CAPABILITIES) {
    if (!entityIds.has(capability.entityId)) {
      missing.push(`capability:${capability.capabilityId}->missing_entity:${capability.entityId}`);
    }
  }

  for (const requiredEntity of ['entity.inventory_item', 'entity.warranty', 'entity.maintenance_task', 'entity.room']) {
    if (!entityIds.has(requiredEntity)) {
      missing.push(`required_entity:${requiredEntity}`);
    }
  }

  // Verify lexicon field alignment for Phase 2A slice entities
  const registeredFieldIds = new Set(SLICE_FIELDS.map((field) => field.fieldId));
  const sliceFieldPrefixes = ['field.inventory_item.', 'field.warranty.', 'field.maintenance_task.'];
  for (const lexeme of ASK_SHARED_SEMANTIC_LEXICON) {
    if (lexeme.role === 'FIELD' && sliceFieldPrefixes.some((prefix) => lexeme.semanticId.startsWith(prefix))) {
      if (!registeredFieldIds.has(lexeme.semanticId)) {
        missing.push(`lexicon_field_unregistered:${lexeme.semanticId}`);
      }
    }
  }

  // Verify foreign-key MANY_TO_ONE cardinalities on item->room and task->item
  const roomRel = SLICE_RELATIONS.find((r) => r.semanticRelationId === 'relation.inventory_item.room');
  if (roomRel?.cardinality !== 'MANY_TO_ONE') {
    missing.push('relation.inventory_item.room:expected_MANY_TO_ONE');
  }
  const taskItemRel = SLICE_RELATIONS.find((r) => r.semanticRelationId === 'relation.maintenance_task.inventory_item');
  if (taskItemRel?.cardinality !== 'MANY_TO_ONE') {
    missing.push('relation.maintenance_task.inventory_item:expected_MANY_TO_ONE');
  }

  return {
    ok: missing.length === 0,
    missing,
    entityCount: SLICE_ENTITIES.length,
    fieldCount: SLICE_FIELDS.length,
    relationCount: SLICE_RELATIONS.length,
    capabilityCount: SLICE_CAPABILITIES.length,
  };
}
