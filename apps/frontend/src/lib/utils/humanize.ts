const DISPLAY_LABELS: Record<string, string> = {
  // Requested high-priority mappings
  ROOF_SHINGLE: 'Roof Shingle Inspection',
  WATER_HEATER_TANK: 'Water Heater Tank Service',
  SAFETY_SMOKE_CO_DETECTOR: 'Smoke & CO Detector Check',
  SAFETY_SMOKE_CO_DETECTORS: 'Smoke & CO Detector Check',
  FREEZE_PROTECTION: 'Freeze Protection Check',
  HVAC_FILTER: 'HVAC Filter Replacement',
  HVAC_FILTER_CHECK: 'HVAC Filter Replacement',
  GUTTER_CLEANING: 'Gutter Cleaning',
  PEST_INSPECTION: 'Pest Inspection',
  ELECTRICAL_PANEL: 'Electrical Panel Inspection',
  ELECTRICAL_PANEL_MODERN: 'Electrical Panel Inspection',
  ELECTRICAL_PANEL_OLD: 'Electrical Panel Inspection',
  PLUMBING_CHECK: 'Plumbing Check',

  // Additional action/system enums from Prisma + risk config
  WATER_HEATER_TANKLESS: 'Tankless Water Heater Service',
  ROOF_TILE_METAL: 'Roof Tile/Metal Inspection',
  FOUNDATION_CONCRETE_SLAB: 'Foundation Slab Inspection',
  MAJOR_APPLIANCE_FRIDGE: 'Refrigerator Service',
  MAJOR_APPLIANCE_DISHWASHER: 'Dishwasher Service',
  HVAC_FURNACE: 'HVAC Furnace Service',
  HVAC_HEAT_PUMP: 'HVAC Heat Pump Service',

  // MitigationActionType
  LEAK_SENSORS: 'Leak Sensor Installation',
  AUTO_SHUTOFF_VALVE: 'Auto Shutoff Valve Installation',
  SUMP_PUMP_OR_BACKUP: 'Sump Pump/Backup Check',
  WATER_HEATER_REPLACEMENT: 'Water Heater Replacement',
  ROOF_INSPECTION_OR_REPAIR: 'Roof Inspection or Repair',
  TREE_TRIMMING: 'Tree Trimming',
  WIND_HAIL_HARDENING: 'Wind/Hail Hardening',
  SMOKE_CO_DETECTORS: 'Smoke & CO Detector Check',
  ELECTRICAL_PANEL_INSPECTION: 'Electrical Panel Inspection',
  SECURITY_SYSTEM: 'Security System Review',
  RAISE_DEDUCTIBLE: 'Raise Deductible Review',
  REVIEW_DISCOUNTS: 'Discount Review',

  // MicroActionType
  GFCI_TEST: 'GFCI Outlet Test',
  SMOKE_CO_TEST: 'Smoke & CO Detector Test',
  SUMP_PUMP_TEST: 'Sump Pump Test',
  PIPE_FREEZE_PREP: 'Pipe Freeze Prep',
  STORM_PREP: 'Storm Prep',
  WARRANTY_EXPIRING: 'Warranty Expiring',
  RECALL_ALERT: 'Recall Alert',
  UTILITY_REBATE: 'Utility Rebate Review',
  INSURANCE_REVIEW: 'Insurance Review',
};

function normalizeKey(input: string): {
  normalized: string;
  wasTruncated: boolean;
} {
  const raw = String(input ?? '').trim();
  const wasTruncated = raw.endsWith('...') || raw.endsWith('…');
  const withoutEllipsis = raw.replace(/(\.\.\.|…)+$/g, '');
  const normalized = withoutEllipsis
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/_+$/g, '')
    .toUpperCase();

  return { normalized, wasTruncated };
}

function titleCaseFromEnumKey(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((word) => {
      if (word === 'HVAC') return 'HVAC';
      if (word === 'CO') return 'CO';
      return word.charAt(0) + word.slice(1).toLowerCase();
    })
    .join(' ');
}

export default function humanizeActionType(key?: string | null): string {
  if (!key || !String(key).trim()) return '—';

  const { normalized, wasTruncated } = normalizeKey(key);
  if (!normalized) return '—';

  const exact = DISPLAY_LABELS[normalized];
  if (exact) return exact;

  if (wasTruncated) {
    const prefixMatches = Object.keys(DISPLAY_LABELS).filter((known) =>
      known.startsWith(normalized)
    );
    if (prefixMatches.length > 0) {
      const bestMatch = prefixMatches.sort((a, b) => a.length - b.length)[0];
      return DISPLAY_LABELS[bestMatch];
    }
  }

  // Preserve non-enum freeform phrases instead of forcing title-case.
  if (!normalized.includes('_') && /[a-z]/.test(String(key))) {
    return String(key).replace(/(\.\.\.|…)+$/g, '').trim() || '—';
  }

  return titleCaseFromEnumKey(normalized);
}

export { DISPLAY_LABELS };
