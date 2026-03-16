// apps/backend/src/homeRenovationAdvisor/engine/assumptions/assumptions.service.ts
//
// Collects, deduplicates, and normalizes assumptions from all modules.

import { AssumptionEntry } from '../../types/homeRenovationAdvisor.types';

/**
 * Merges assumption arrays from all modules, deduplicates by key, and renumbers displayOrder.
 */
export function mergeAssumptions(...assumptionSets: AssumptionEntry[][]): AssumptionEntry[] {
  const seen = new Map<string, AssumptionEntry>();

  for (const set of assumptionSets) {
    for (const assumption of set) {
      if (!seen.has(assumption.assumptionKey)) {
        seen.set(assumption.assumptionKey, assumption);
      }
    }
  }

  return Array.from(seen.values()).map((a, i) => ({ ...a, displayOrder: i }));
}

/**
 * Filters to only user-visible assumptions.
 */
export function getUserVisibleAssumptions(assumptions: AssumptionEntry[]): AssumptionEntry[] {
  return assumptions.filter((a) => a.isUserVisible);
}
