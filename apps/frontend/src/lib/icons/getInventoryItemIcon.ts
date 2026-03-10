import { inventoryItemIconMapping } from '@/lib/config/inventoryItemIconMapping';
import { getInventoryCategoryIcon } from '@/lib/config/iconMapping';
import { normalizeInventoryIconCandidates } from './normalizeInventoryIconKey';

export type InventoryIconInput = {
  name?: string | null;
  type?: string | null;
  category?: string | null;
  subtype?: string | null;
  kind?: string | null;
  label?: string | null;
  applianceType?: string | null;
  sourceHash?: string | null;
};

function extractSourceHashType(sourceHash?: string | null): string | null {
  const value = String(sourceHash || '').trim();
  if (!value) return null;
  const [prefix, suffix] = value.split('::');
  if (prefix !== 'property_appliance' || !suffix) return null;
  return suffix;
}

export function getInventoryItemIcon(input?: InventoryIconInput | null): string {
  const sourceHashType = extractSourceHashType(input?.sourceHash);

  const itemKey = normalizeInventoryIconCandidates([
    input?.type,
    input?.subtype,
    input?.kind,
    input?.applianceType,
    sourceHashType,
    input?.name,
    input?.label,
  ]);

  if (itemKey) {
    return inventoryItemIconMapping[itemKey];
  }

  const categoryIcon = getInventoryCategoryIcon(input?.category);
  return categoryIcon || 'HelpCircle';
}
