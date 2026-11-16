import {
  InventoryItemCategory,
  WarrantyApplicabilityScope,
  WarrantyApplicabilityStatus,
  WarrantyCategory,
  WarrantyScopeKind,
  type Prisma,
} from '@prisma/client';

export type WarrantyScopeInput = {
  category: WarrantyCategory | string;
  scopeKind?: WarrantyScopeKind | string | null;
  propertyId?: string | null;
  inventoryItemId?: string | null;
};

export function resolveWarrantyScopeKind(input: WarrantyScopeInput): WarrantyScopeKind {
  if (input.scopeKind === WarrantyScopeKind.ITEM_SPECIFIC || input.scopeKind === WarrantyScopeKind.PROPERTY_PLAN) {
    return input.scopeKind;
  }
  if (input.category === WarrantyCategory.HOME_WARRANTY_PLAN) return WarrantyScopeKind.PROPERTY_PLAN;
  if (input.category === WarrantyCategory.OTHER) {
    throw new Error('OTHER warranties must explicitly declare ITEM_SPECIFIC or PROPERTY_PLAN scope.');
  }
  return WarrantyScopeKind.ITEM_SPECIFIC;
}

export function assertCanonicalWarrantyScope(input: WarrantyScopeInput): WarrantyScopeKind {
  const scopeKind = resolveWarrantyScopeKind(input);
  if (!input.propertyId) throw new Error('Every warranty must belong to a property.');
  if (scopeKind === WarrantyScopeKind.PROPERTY_PLAN && input.inventoryItemId) {
    throw new Error('Property or whole-home plans cannot link directly to one inventory item; use WarrantyApplicability.');
  }
  if (scopeKind === WarrantyScopeKind.ITEM_SPECIFIC && !input.inventoryItemId) {
    throw new Error('Item-specific warranties must identify an inventory item.');
  }
  if (input.category === WarrantyCategory.HOME_WARRANTY_PLAN && scopeKind !== WarrantyScopeKind.PROPERTY_PLAN) {
    throw new Error('HOME_WARRANTY_PLAN must use PROPERTY_PLAN scope.');
  }
  return scopeKind;
}

export type WarrantyApplicabilityInput = {
  scope: WarrantyApplicabilityScope | string;
  status: WarrantyApplicabilityStatus | string;
  inventoryItemId?: string | null;
  inventoryCategory?: InventoryItemCategory | string | null;
  homeSystemType?: string | null;
  evidenceSource?: string | null;
  evidenceJson?: Prisma.InputJsonValue | null;
};

export function assertCanonicalWarrantyApplicability(input: WarrantyApplicabilityInput): void {
  const populatedTargets = [input.inventoryItemId, input.inventoryCategory, input.homeSystemType].filter(Boolean);
  if (populatedTargets.length !== 1) throw new Error('Warranty applicability must identify exactly one item, inventory category, or home system.');
  if (input.scope === WarrantyApplicabilityScope.INVENTORY_ITEM && !input.inventoryItemId) throw new Error('INVENTORY_ITEM applicability requires inventoryItemId.');
  if (input.scope === WarrantyApplicabilityScope.INVENTORY_CATEGORY && !input.inventoryCategory) throw new Error('INVENTORY_CATEGORY applicability requires inventoryCategory.');
  if (input.scope === WarrantyApplicabilityScope.HOME_SYSTEM && !input.homeSystemType) throw new Error('HOME_SYSTEM applicability requires homeSystemType.');
  if (input.status === WarrantyApplicabilityStatus.COVERED && !input.evidenceSource && !input.evidenceJson) {
    throw new Error('Confirmed whole-home plan applicability requires recorded evidence or provenance.');
  }
}

export function recordedWarrantyState(input: {
  itemWarrantyCount: number;
  applicablePropertyPlanCount: number;
  excludedPropertyPlanCount?: number;
  unknownPropertyPlanCount?: number;
  coverageEvidenceStatus: string;
}): 'CONFLICTED' | 'ITEM_WARRANTY_RECORDED' | 'PROPERTY_PLAN_APPLICABLE' | 'EXPLICIT_NO_COVERAGE' | 'UNKNOWN' | 'NO_LINK_RECORDED' {
  const positiveCount = input.itemWarrantyCount + input.applicablePropertyPlanCount;
  if (input.coverageEvidenceStatus === 'NONE') return positiveCount > 0 ? 'CONFLICTED' : 'EXPLICIT_NO_COVERAGE';
  if (input.itemWarrantyCount > 0) return 'ITEM_WARRANTY_RECORDED';
  if (input.applicablePropertyPlanCount > 0) return 'PROPERTY_PLAN_APPLICABLE';
  if ((input.unknownPropertyPlanCount ?? 0) > 0 || input.coverageEvidenceStatus === 'NOT_SURE') return 'UNKNOWN';
  return 'NO_LINK_RECORDED';
}
