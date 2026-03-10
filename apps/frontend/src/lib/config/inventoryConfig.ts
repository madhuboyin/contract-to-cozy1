import type { InventoryItemCategory } from '@/types';

export const INVENTORY_ITEM_CATEGORIES: readonly InventoryItemCategory[] = [
  'APPLIANCE',
  'HVAC',
  'PLUMBING',
  'ELECTRICAL',
  'ROOF_EXTERIOR',
  'SAFETY',
  'SMART_HOME',
  'FURNITURE',
  'ELECTRONICS',
  'OTHER',
] as const;

export const INVENTORY_CATEGORY_FILTER_OPTIONS: ReadonlyArray<{
  value: InventoryItemCategory | null;
  label: string;
}> = [
  { value: null, label: 'All categories' },
  { value: 'APPLIANCE', label: 'Appliance' },
  { value: 'HVAC', label: 'HVAC' },
  { value: 'PLUMBING', label: 'Plumbing' },
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'ROOF_EXTERIOR', label: 'Roof/Exterior' },
  { value: 'SAFETY', label: 'Safety' },
  { value: 'SMART_HOME', label: 'Smart Home' },
  { value: 'FURNITURE', label: 'Furniture' },
  { value: 'ELECTRONICS', label: 'Electronics' },
  { value: 'OTHER', label: 'Other' },
] as const;

export const INSTALL_YEAR_CATEGORIES: readonly InventoryItemCategory[] = ['APPLIANCE'] as const;
export const PURCHASE_DATE_CATEGORIES: readonly InventoryItemCategory[] = ['ELECTRONICS', 'FURNITURE', 'OTHER'] as const;

export const MAJOR_APPLIANCE_KEYWORDS = [
  'dishwasher',
  'refrigerator',
  'fridge',
  'freezer',
  'oven',
  'range',
  'stove',
  'cooktop',
  'washer',
  'dryer',
  'laundry',
  'microwave',
  'water softener',
] as const;

const APPLIANCE_KEYWORD_TO_TYPE: Record<string, string> = {
  dishwasher: 'DISHWASHER',
  refrigerator: 'REFRIGERATOR',
  fridge: 'REFRIGERATOR',
  freezer: 'REFRIGERATOR',
  oven: 'OVEN_RANGE',
  range: 'OVEN_RANGE',
  stove: 'OVEN_RANGE',
  cooktop: 'OVEN_RANGE',
  washer: 'WASHER_DRYER',
  dryer: 'WASHER_DRYER',
  laundry: 'WASHER_DRYER',
  microwave: 'MICROWAVE_HOOD',
  'water softener': 'WATER_SOFTENER',
  softener: 'WATER_SOFTENER',
};

export function inferApplianceTypeFromName(name: string): string | null {
  const normalized = name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  for (const [keyword, type] of Object.entries(APPLIANCE_KEYWORD_TO_TYPE)) {
    if (normalized.includes(keyword)) return type;
  }
  return null;
}

export function formatApplianceTypeLabel(type: string): string {
  return type.replace(/_/g, ' ').toLowerCase();
}

export function isMajorApplianceName(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  return MAJOR_APPLIANCE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

type LookupInput = {
  categoryHint?: string | null;
  name?: string | null;
};

export function inferInventoryCategoryFromLookup(lookup?: LookupInput | null): InventoryItemCategory {
  const hint = String(lookup?.categoryHint || '').toLowerCase();
  const name = String(lookup?.name || '').toLowerCase();
  const combined = `${hint} ${name}`;

  if (
    combined.includes('refrigerator') ||
    combined.includes('microwave') ||
    combined.includes('dishwasher') ||
    combined.includes('oven')
  ) {
    return 'APPLIANCE';
  }

  if (
    combined.includes('thermostat') ||
    combined.includes('hvac') ||
    combined.includes('furnace') ||
    combined.includes('air conditioner')
  ) {
    return 'HVAC';
  }

  if (
    combined.includes('smoke') ||
    combined.includes('carbon monoxide') ||
    combined.includes('detector') ||
    combined.includes('alarm')
  ) {
    return 'SAFETY';
  }

  if (
    combined.includes('tv') ||
    combined.includes('router') ||
    combined.includes('speaker') ||
    combined.includes('laptop') ||
    combined.includes('camera')
  ) {
    return 'ELECTRONICS';
  }

  if (
    combined.includes('sofa') ||
    combined.includes('chair') ||
    combined.includes('table') ||
    combined.includes('bed')
  ) {
    return 'FURNITURE';
  }

  return 'OTHER';
}

export const ROOM_SCAN_CATEGORY_OPTIONS = [
  'APPLIANCE',
  'ELECTRONICS',
  'FURNITURE',
  'HVAC',
  'PLUMBING',
  'SECURITY',
  'TOOL',
  'DOCUMENT',
  'OTHER',
] as const;

export type RoomScanCategoryOption = (typeof ROOM_SCAN_CATEGORY_OPTIONS)[number];
