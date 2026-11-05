import type { InventoryItem } from '@/types';

/**
 * How many documents an inventory item has: the legacy documents attached to it plus the Home Records linked to it. The two live in different stores
 * until the legacy relation is retired, and a count that reads only one of them tells the homeowner a filed document is missing
 * (Findings Implementation Plan, Phase 6, F6-3).
 */
export function inventoryItemDocumentCount(item: Pick<InventoryItem, 'documents' | 'homeRecordLinks'>): number {
  return (item.documents?.length ?? 0) + (item.homeRecordLinks?.length ?? 0);
}
