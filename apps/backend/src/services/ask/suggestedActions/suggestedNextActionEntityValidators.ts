// Plan §6 rules 6-7 / §7.4: batched, per-entity-type validators. The finalizer groups every candidate entity by type and calls
// each registered validator ONCE per type with all the ids, so eligibility never issues a per-candidate query. A candidate whose
// entity type has no registered validator fails closed (ENTITY_VALIDATOR_MISSING); validators are added domain by domain in
// Phase 3 together with that domain's producer, freshness-matrix entry and stale-selection test.
import type { EntityRecordState } from './suggestedNextActionEligibility';

export interface EntityValidationScope {
  userId: string;
  propertyId: string | null;
}

export type EntityValidator = (entityIds: readonly string[], scope: EntityValidationScope) => Promise<ReadonlyMap<string, EntityRecordState>>;

const validators = new Map<string, EntityValidator>();

export function registerSuggestedNextActionEntityValidator(entityType: string, validator: EntityValidator): void {
  validators.set(entityType, validator);
}

export function getSuggestedNextActionEntityValidator(entityType: string): EntityValidator | undefined {
  return validators.get(entityType);
}

export function registeredSuggestedNextActionEntityTypes(): string[] {
  return [...validators.keys()];
}

/** Test seam: restore an empty registry. */
export function resetSuggestedNextActionEntityValidatorsForTests(): void {
  validators.clear();
}
