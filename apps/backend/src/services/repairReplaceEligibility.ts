import type { InventoryItemCategory } from '../productFramework/intelligence/entityRef.contract';

const WATER_HEATER_NAME_HINTS = ['water heater', 'water-heater', 'hot water heater', 'tankless water heater'] as const;

function normalizeInventoryName(name: string | null | undefined): string {
  return String(name ?? '').trim().toLowerCase().replace(/[_\s]+/g, ' ');
}

/**
 * IPD-006 safety backstop. Category remains the authoritative admission
 * dimension; this rejects the one known legacy misclassification that would
 * otherwise put a PLUMBING system into the generic-appliance profile.
 */
export function isWaterHeaterInventoryName(name: string | null | undefined): boolean {
  const normalized = normalizeInventoryName(name);
  return WATER_HEATER_NAME_HINTS.some((hint) => normalized.includes(hint));
}

export function isGenericApplianceRepairReplaceEligible(input: {
  category: InventoryItemCategory | string | null | undefined;
  name: string | null | undefined;
}): boolean {
  return input.category === 'APPLIANCE' && !isWaterHeaterInventoryName(input.name);
}
