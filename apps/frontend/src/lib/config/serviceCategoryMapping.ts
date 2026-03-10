import type {
  InventoryItemCategory,
  MaintenanceTaskServiceCategory,
  ServiceCategory,
  WarrantyCategory,
} from '@/types';

export type ProviderCategoryOption = {
  value: ServiceCategory;
  label: string;
  icon?: string;
};

export const PROVIDER_SEARCH_CATEGORY_OPTIONS: readonly ProviderCategoryOption[] = [
  { value: 'INSPECTION', label: 'Home Inspection', icon: 'INSPECTION' },
  { value: 'HANDYMAN', label: 'Handyman Services', icon: 'HANDYMAN' },
  { value: 'PLUMBING', label: 'Plumbing', icon: 'PLUMBING' },
  { value: 'ELECTRICAL', label: 'Electrical', icon: 'ELECTRICAL' },
  { value: 'HVAC', label: 'HVAC', icon: 'HVAC' },
  { value: 'CLEANING', label: 'Cleaning', icon: 'CLEANING' },
  { value: 'LANDSCAPING', label: 'Landscaping', icon: 'LANDSCAPING' },
] as const;

export const ALL_SERVICE_CATEGORIES: readonly ServiceCategory[] = [
  'INSPECTION',
  'HANDYMAN',
  'PLUMBING',
  'ELECTRICAL',
  'HVAC',
  'LANDSCAPING',
  'CLEANING',
  'MOVING',
  'PEST_CONTROL',
  'LOCKSMITH',
  'INSURANCE',
  'ATTORNEY',
  'FINANCE',
  'WARRANTY',
  'ADMIN',
] as const;

const SERVICE_CATEGORY_SET = new Set<string>(ALL_SERVICE_CATEGORIES);
const MAINTENANCE_SERVICE_CATEGORY_SET = new Set<string>([
  'HVAC',
  'PLUMBING',
  'ELECTRICAL',
  'HANDYMAN',
  'LANDSCAPING',
  'CLEANING',
  'PEST_CONTROL',
  'LOCKSMITH',
  'ROOFING',
  'APPLIANCE_REPAIR',
]);

export const MAINTENANCE_SERVICE_CATEGORY_OPTIONS: readonly MaintenanceTaskServiceCategory[] = [
  'HVAC',
  'PLUMBING',
  'ELECTRICAL',
  'HANDYMAN',
  'LANDSCAPING',
  'CLEANING',
  'PEST_CONTROL',
  'LOCKSMITH',
  'ROOFING',
  'APPLIANCE_REPAIR',
] as const;

export const MAINTENANCE_SERVICE_CATEGORY_FILTER_OPTIONS: ReadonlyArray<{
  value: MaintenanceTaskServiceCategory;
  label: string;
}> = [
  { value: 'HVAC', label: 'HVAC' },
  { value: 'PLUMBING', label: 'Plumbing' },
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'HANDYMAN', label: 'Handyman' },
  { value: 'LANDSCAPING', label: 'Landscaping' },
  { value: 'CLEANING', label: 'Cleaning' },
  { value: 'PEST_CONTROL', label: 'Pest Control' },
  { value: 'LOCKSMITH', label: 'Locksmith' },
  { value: 'ROOFING', label: 'Roofing' },
  { value: 'APPLIANCE_REPAIR', label: 'Appliance Repair' },
] as const;

const LEGACY_PROVIDER_CATEGORY_ALIASES: Record<string, ServiceCategory> = {
  ROOFING: 'INSPECTION',
  APPLIANCE_REPAIR: 'HANDYMAN',
  SAFETY: 'HANDYMAN',
};

const MAINTENANCE_TO_PROVIDER_CATEGORY_MAP: Record<MaintenanceTaskServiceCategory, ServiceCategory> = {
  HVAC: 'HVAC',
  PLUMBING: 'PLUMBING',
  ELECTRICAL: 'ELECTRICAL',
  HANDYMAN: 'HANDYMAN',
  LANDSCAPING: 'LANDSCAPING',
  CLEANING: 'CLEANING',
  PEST_CONTROL: 'PEST_CONTROL',
  LOCKSMITH: 'LOCKSMITH',
  ROOFING: 'INSPECTION',
  APPLIANCE_REPAIR: 'HANDYMAN',
};

const SYSTEM_TYPE_TO_MAINTENANCE_CATEGORY: Record<string, MaintenanceTaskServiceCategory> = {
  HVAC_FURNACE: 'HVAC',
  HVAC_HEAT_PUMP: 'HVAC',
  WATER_HEATER_TANK: 'PLUMBING',
  WATER_HEATER_TANKLESS: 'PLUMBING',
  ROOF_SHINGLE: 'ROOFING',
  ROOF_TILE_METAL: 'ROOFING',
  ELECTRICAL_PANEL_MODERN: 'ELECTRICAL',
  ELECTRICAL_PANEL_OLD: 'ELECTRICAL',
  SAFETY_SMOKE_CO_DETECTORS: 'HANDYMAN',
  MAJOR_APPLIANCE_FRIDGE: 'APPLIANCE_REPAIR',
  MAJOR_APPLIANCE_DISHWASHER: 'APPLIANCE_REPAIR',
};

const INVENTORY_TO_WARRANTY_CATEGORY_MAP: Partial<Record<InventoryItemCategory, WarrantyCategory>> = {
  APPLIANCE: 'APPLIANCE',
  HVAC: 'HVAC',
  PLUMBING: 'PLUMBING',
  ELECTRICAL: 'ELECTRICAL',
  ROOF_EXTERIOR: 'ROOFING',
};

const HVAC_SYSTEM_TYPES = ['HVAC_FURNACE', 'HVAC_HEAT_PUMP'] as const;
const PLUMBING_SYSTEM_TYPES = ['WATER_HEATER_TANK', 'WATER_HEATER_TANKLESS'] as const;
const ELECTRICAL_SYSTEM_TYPES = ['ELECTRICAL_PANEL'] as const;
const ROOF_SYSTEM_TYPES = ['ROOF_SHINGLE', 'ROOF_TILE_METAL'] as const;
const APPLIANCE_SYSTEM_TYPES = ['APPLIANCE'] as const;
const SAFETY_SYSTEM_TYPES = ['SAFETY_SMOKE_CO_DETECTORS'] as const;

const WARRANTY_CATEGORY_TO_SYSTEM_TYPES_MAP: Record<string, readonly string[]> = {
  HVAC: HVAC_SYSTEM_TYPES,
  PLUMBING: PLUMBING_SYSTEM_TYPES,
  ELECTRICAL: ELECTRICAL_SYSTEM_TYPES,
  ROOFING: ROOF_SYSTEM_TYPES,
  APPLIANCES: APPLIANCE_SYSTEM_TYPES,
  HOME_WARRANTY_PLAN: [
    ...HVAC_SYSTEM_TYPES,
    ...PLUMBING_SYSTEM_TYPES,
    ...ELECTRICAL_SYSTEM_TYPES,
    ...ROOF_SYSTEM_TYPES,
    ...APPLIANCE_SYSTEM_TYPES,
    ...SAFETY_SYSTEM_TYPES,
  ],
  HOME_WARRANTY: [
    ...HVAC_SYSTEM_TYPES,
    ...PLUMBING_SYSTEM_TYPES,
    ...ELECTRICAL_SYSTEM_TYPES,
    ...ROOF_SYSTEM_TYPES,
    ...APPLIANCE_SYSTEM_TYPES,
    ...SAFETY_SYSTEM_TYPES,
  ],
};

const CATEGORY_DISPLAY_LABELS: Record<string, string> = {
  HVAC: 'HVAC',
  PLUMBING: 'Plumbing',
  ELECTRICAL: 'Electrical',
  ROOFING: 'Roofing',
  INSPECTION: 'Inspection',
  HANDYMAN: 'Handyman',
  LANDSCAPING: 'Landscaping',
  CLEANING: 'Cleaning',
  PEST_CONTROL: 'Pest Control',
  LOCKSMITH: 'Locksmith',
  APPLIANCE: 'Appliance',
  ROOF_EXTERIOR: 'Roof / Exterior',
  SAFETY: 'Safety',
  SMART_HOME: 'Smart Home',
  FURNITURE: 'Furniture',
  ELECTRONICS: 'Electronics',
  OTHER: 'Other',
};

function normalizeMappingKey(value?: string | null): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[ -]+/g, '_');
}

export function isMaintenanceServiceCategory(
  category?: MaintenanceTaskServiceCategory | ServiceCategory | string | null
): category is MaintenanceTaskServiceCategory {
  const normalized = normalizeMappingKey(category);
  return MAINTENANCE_SERVICE_CATEGORY_SET.has(normalized);
}

export function getMaintenanceServiceCategoryForSystemType(
  systemType?: string | null
): MaintenanceTaskServiceCategory {
  const normalized = normalizeMappingKey(systemType);
  if (normalized && SYSTEM_TYPE_TO_MAINTENANCE_CATEGORY[normalized]) {
    return SYSTEM_TYPE_TO_MAINTENANCE_CATEGORY[normalized];
  }
  if (normalized.startsWith('HVAC_')) return 'HVAC';
  if (normalized.startsWith('WATER_HEATER')) return 'PLUMBING';
  if (normalized.startsWith('ROOF_')) return 'ROOFING';
  if (normalized.startsWith('ELECTRICAL_')) return 'ELECTRICAL';
  if (normalized.startsWith('MAJOR_APPLIANCE_')) return 'APPLIANCE_REPAIR';
  return 'HANDYMAN';
}

export function getProviderCategoryForMaintenanceCategory(
  category?: MaintenanceTaskServiceCategory | string | null
): ServiceCategory {
  const normalized = normalizeMappingKey(category);
  if (!normalized) return 'INSPECTION';

  if (SERVICE_CATEGORY_SET.has(normalized)) {
    return normalized as ServiceCategory;
  }

  if (normalized in MAINTENANCE_TO_PROVIDER_CATEGORY_MAP) {
    return MAINTENANCE_TO_PROVIDER_CATEGORY_MAP[normalized as MaintenanceTaskServiceCategory];
  }

  if (LEGACY_PROVIDER_CATEGORY_ALIASES[normalized]) {
    return LEGACY_PROVIDER_CATEGORY_ALIASES[normalized];
  }

  return 'INSPECTION';
}

export function getProviderCategoryForSystemType(systemType?: string | null): ServiceCategory {
  const maintenanceCategory = getMaintenanceServiceCategoryForSystemType(systemType);
  return getProviderCategoryForMaintenanceCategory(maintenanceCategory);
}

export function normalizeProviderCategoryForSearch(rawCategory?: string | null): ServiceCategory | undefined {
  const normalized = normalizeMappingKey(rawCategory);
  if (!normalized) return undefined;

  if (SERVICE_CATEGORY_SET.has(normalized)) {
    return normalized as ServiceCategory;
  }

  if (normalized in MAINTENANCE_TO_PROVIDER_CATEGORY_MAP) {
    return MAINTENANCE_TO_PROVIDER_CATEGORY_MAP[normalized as MaintenanceTaskServiceCategory];
  }

  return LEGACY_PROVIDER_CATEGORY_ALIASES[normalized];
}

export function getWarrantyCategoryForInventoryCategory(
  category?: InventoryItemCategory | string | null
): WarrantyCategory {
  const normalized = normalizeMappingKey(category) as InventoryItemCategory;
  return INVENTORY_TO_WARRANTY_CATEGORY_MAP[normalized] ?? 'OTHER';
}

export function getSystemTypesForWarrantyCategory(category?: string | null): readonly string[] {
  const normalized = normalizeMappingKey(category);
  return WARRANTY_CATEGORY_TO_SYSTEM_TYPES_MAP[normalized] ?? [];
}

export function getCategoryDisplayLabel(category?: string | null): string {
  const normalized = normalizeMappingKey(category);
  if (!normalized) return 'Unknown';
  return CATEGORY_DISPLAY_LABELS[normalized] ?? normalized.replace(/_/g, ' ');
}
