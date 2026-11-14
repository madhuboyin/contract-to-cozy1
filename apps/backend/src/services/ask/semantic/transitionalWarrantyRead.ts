import { prisma } from '../../../lib/prisma';

export type TransitionalWarrantyState =
  | 'ITEM_WARRANTY_LINKED'
  | 'PROPERTY_PLAN_LINKED'
  | 'BOTH_CONSISTENT'
  | 'CONFLICTED_LINKS'
  | 'NO_LINK_RECORDED'
  | 'EXPLICIT_NO_COVERAGE'
  | 'UNKNOWN';

export interface TransitionalWarrantyLinkInput {
  readonly inventoryItemId: string;
  /** Legacy InventoryItem.warrantyId path. Its final business meaning is owner-pending. */
  readonly propertyPlanWarrantyId: string | null;
  /** Legacy Warranty.inventoryItemId path; more than one row is preserved. */
  readonly itemWarrantyIds: readonly string[];
  readonly coverageEvidenceStatus: 'NONE' | 'NOT_SURE' | 'UNKNOWN' | string;
}

export interface TransitionalWarrantyRead {
  readonly inventoryItemId: string;
  readonly state: TransitionalWarrantyState;
  readonly warrantyIds: readonly string[];
  readonly reconciliationRequired: boolean;
}

/**
 * FR-QUERY-7 transitional classifier. It describes recorded link topology only;
 * it never claims that policy terms cover the item.
 */
export function classifyTransitionalWarrantyLinks(input: TransitionalWarrantyLinkInput): TransitionalWarrantyRead {
  const itemWarrantyIds = [...new Set(input.itemWarrantyIds.filter(Boolean))].sort();
  const propertyPlanWarrantyId = input.propertyPlanWarrantyId || null;
  const warrantyIds = [...new Set([...(propertyPlanWarrantyId ? [propertyPlanWarrantyId] : []), ...itemWarrantyIds])].sort();
  if (input.coverageEvidenceStatus === 'NONE') {
    return {
      inventoryItemId: input.inventoryItemId,
      state: warrantyIds.length ? 'CONFLICTED_LINKS' : 'EXPLICIT_NO_COVERAGE',
      warrantyIds,
      reconciliationRequired: warrantyIds.length > 0,
    };
  }
  if (!propertyPlanWarrantyId && itemWarrantyIds.length === 0) {
    return {
      inventoryItemId: input.inventoryItemId,
      state: input.coverageEvidenceStatus === 'NOT_SURE' ? 'UNKNOWN' : 'NO_LINK_RECORDED',
      warrantyIds: [],
      reconciliationRequired: false,
    };
  }
  if (propertyPlanWarrantyId && itemWarrantyIds.length === 0) return { inventoryItemId: input.inventoryItemId, state: 'PROPERTY_PLAN_LINKED', warrantyIds, reconciliationRequired: false };
  if (!propertyPlanWarrantyId) return { inventoryItemId: input.inventoryItemId, state: 'ITEM_WARRANTY_LINKED', warrantyIds, reconciliationRequired: itemWarrantyIds.length > 1 };
  const consistent = itemWarrantyIds.length === 1 && itemWarrantyIds[0] === propertyPlanWarrantyId;
  return { inventoryItemId: input.inventoryItemId, state: consistent ? 'BOTH_CONSISTENT' : 'CONFLICTED_LINKS', warrantyIds, reconciliationRequired: !consistent };
}

/** Property-scoped reader over both legacy link directions. */
export async function readTransitionalWarrantyLinks(propertyId: string): Promise<readonly TransitionalWarrantyRead[]> {
  const items = await prisma.inventoryItem.findMany({
    where: { propertyId },
    select: {
      id: true,
      warrantyId: true,
      coverageEvidenceStatus: true,
      linkedWarranties: { where: { propertyId }, select: { id: true } },
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  return items.map((item) => classifyTransitionalWarrantyLinks({
    inventoryItemId: item.id,
    propertyPlanWarrantyId: item.warrantyId,
    itemWarrantyIds: item.linkedWarranties.map((warranty) => warranty.id),
    coverageEvidenceStatus: item.coverageEvidenceStatus,
  }));
}
