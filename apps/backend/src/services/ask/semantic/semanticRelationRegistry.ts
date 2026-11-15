export const ASK_SEMANTIC_RELATION_REGISTRY_VERSION = 'relation-subset-0.1.0' as const;

export interface SemanticRelationRegistration {
  readonly semanticRelationId: string;
  readonly meaningVersion: string;
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly relationPathId: string;
  readonly canonicalAdapterId: string;
  readonly canonicalStoragePath: string | null;
  readonly cardinality: 'TRANSITIONAL_OWNER_PENDING' | 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_MANY';
  readonly maximumTraversalDepth: number;
  readonly cyclePolicy: 'FORBID';
  readonly predicateIds: readonly string[];
}

export const ASK_SEMANTIC_RELATION_REGISTRY: readonly SemanticRelationRegistration[] = Object.freeze([{
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
}] as const);

export function findSemanticPredicateRegistration(predicateId: string, relationPathId: string): SemanticRelationRegistration | null {
  return ASK_SEMANTIC_RELATION_REGISTRY.find((relation) => relation.relationPathId === relationPathId
    && relation.predicateIds.includes(predicateId)) ?? null;
}

export function findSemanticRelationConstraintRegistration(semanticRelationId: string, predicateId: string): SemanticRelationRegistration | null {
  return ASK_SEMANTIC_RELATION_REGISTRY.find((relation) => relation.semanticRelationId === semanticRelationId
    && relation.predicateIds.includes(predicateId)) ?? null;
}
