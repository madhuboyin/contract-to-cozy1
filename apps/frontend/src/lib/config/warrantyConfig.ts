import type { WarrantyCategory } from '@/types';

export const WARRANTY_CATEGORY_LABELS: Record<WarrantyCategory, string> = {
  APPLIANCE: 'Appliance',
  HVAC: 'HVAC',
  ROOFING: 'Roofing',
  PLUMBING: 'Plumbing',
  ELECTRICAL: 'Electrical',
  STRUCTURAL: 'Structural',
  HOME_WARRANTY_PLAN: 'Home Warranty Plan',
  OTHER: 'Other',
};

export const WARRANTY_CATEGORY_OPTIONS = (Object.entries(WARRANTY_CATEGORY_LABELS) as Array<
  [WarrantyCategory, string]
>).map(([key, display]) => ({ key, display }));

export const WARRANTY_CATEGORY_KEYS = Object.keys(WARRANTY_CATEGORY_LABELS) as WarrantyCategory[];

export function isWarrantyCategory(value: string | null): value is WarrantyCategory {
  return !!value && WARRANTY_CATEGORY_KEYS.includes(value as WarrantyCategory);
}

export const WARRANTY_CATEGORY_ASSET_MAP: Record<WarrantyCategory, string[]> = {
  APPLIANCE: ['REFRIGERATOR', 'OVEN', 'DISHWASHER', 'WASHER', 'DRYER', 'MICROWAVE', 'GARBAGE_DISPOSAL'],
  HVAC: ['HVAC_FURNACE', 'HEAT_PUMP', 'CENTRAL_AC'],
  PLUMBING: ['WATER_HEATER', 'SUMP_PUMP', 'SEPTIC_SYSTEM'],
  ELECTRICAL: ['ELECTRICAL_PANEL', 'GENERATOR'],
  ROOFING: ['ROOF'],
  STRUCTURAL: ['FOUNDATION', 'SIDING', 'GARAGE_DOOR'],
  HOME_WARRANTY_PLAN: [],
  OTHER: [],
};

export const ASSET_LINKING_DISABLED_WARRANTY_CATEGORIES: readonly WarrantyCategory[] = [
  'HVAC',
  'ROOFING',
  'PLUMBING',
  'ELECTRICAL',
  'STRUCTURAL',
] as const;

export const SYSTEM_COVERAGE_WARRANTY_CATEGORIES: readonly WarrantyCategory[] = [
  'HVAC',
  'PLUMBING',
  'ELECTRICAL',
  'ROOFING',
  'STRUCTURAL',
  'HOME_WARRANTY_PLAN',
] as const;

export const WARRANTY_SYSTEM_COVERAGE_LABELS: Readonly<Partial<Record<WarrantyCategory, string>>> = {
  HVAC: 'HVAC System',
  PLUMBING: 'Plumbing System',
  ELECTRICAL: 'Electrical System',
  ROOFING: 'Roof Coverage',
  STRUCTURAL: 'Structural Coverage',
  HOME_WARRANTY_PLAN: 'All Covered Systems',
};

export function getWarrantyCategoryLabel(category?: string | null): string {
  if (!category) return 'Unknown';
  if (isWarrantyCategory(category)) return WARRANTY_CATEGORY_LABELS[category];
  return category.replace(/_/g, ' ');
}

export function getWarrantySystemCoverageLabel(category?: string | null): string {
  if (!category) return 'System Coverage';
  if (isWarrantyCategory(category) && WARRANTY_SYSTEM_COVERAGE_LABELS[category]) {
    return WARRANTY_SYSTEM_COVERAGE_LABELS[category]!;
  }
  return 'System Coverage';
}

export const COMMON_WARRANTY_PROVIDERS = [
  'American Home Shield',
  'Choice Home Warranty',
  'First American Home Warranty',
  'AFC Home Club',
  'Liberty Home Guard',
  'Cinch Home Services',
  'Assurant',
  'Samsung Care+',
  'AppleCare+',
] as const;
