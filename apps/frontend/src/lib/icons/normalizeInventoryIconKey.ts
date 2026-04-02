import type { InventoryItemIconKey } from '@/lib/config/inventoryItemIconMapping';

const ICON_KEY_ALIASES: Record<string, InventoryItemIconKey> = {
  refrigerator: 'refrigerator',
  fridge: 'refrigerator',
  freezer: 'refrigerator',

  washer: 'washer_dryer',
  dryer: 'washer_dryer',
  washer_dryer: 'washer_dryer',
  washer_and_dryer: 'washer_dryer',
  washing_machine: 'washer_dryer',
  laundry: 'washer_dryer',

  water_softener: 'water_softener',
  softener: 'water_softener',

  water_heater: 'water_heater',
  hot_water_heater: 'water_heater',
  water_tank: 'water_heater',

  furnace: 'furnace',
  boiler: 'furnace',

  oven: 'oven_range',
  range: 'oven_range',
  stove: 'oven_range',
  cooktop: 'oven_range',
  oven_range: 'oven_range',

  microwave: 'microwave_hood',
  microwave_hood: 'microwave_hood',
  microwave_vent_hood: 'microwave_hood',

  dishwasher: 'dishwasher',

  tv: 'tv',
  television: 'tv',

  desk: 'desk',
  office_desk: 'desk',

  computer_desk: 'computer_desk',
  workstation: 'computer_desk',

  mirror: 'mirror',

  bed: 'bed',
  mattress: 'bed',
  bed_frame: 'bed',

  sofa: 'sofa',
  couch: 'sofa',
  loveseat: 'sofa',

  hood: 'hood',
  range_hood: 'hood',
  vent_hood: 'hood',
};

function toNormalizedToken(value?: string | null): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[&/\-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const HEURISTIC_RULES: Array<{ key: InventoryItemIconKey; test: (value: string) => boolean }> = [
  { key: 'washer_dryer', test: (value) => value.includes('washer') && value.includes('dryer') },
  { key: 'computer_desk', test: (value) => value.includes('computer') && value.includes('desk') },
  { key: 'microwave_hood', test: (value) => value.includes('microwave') && value.includes('hood') },
  { key: 'water_softener', test: (value) => value.includes('water') && value.includes('softener') },
  { key: 'water_heater', test: (value) => value.includes('water') && value.includes('heater') },
  { key: 'furnace', test: (value) => value.includes('furnace') || value.includes('boiler') },
  { key: 'oven_range', test: (value) => value.includes('oven') || value.includes('range') || value.includes('stove') },
  { key: 'refrigerator', test: (value) => value.includes('refrigerator') || value.includes('fridge') },
  { key: 'dishwasher', test: (value) => value.includes('dishwasher') },
  { key: 'tv', test: (value) => value.includes('television') || value === 'tv' || value.includes('_tv') || value.includes('tv_') },
  { key: 'sofa', test: (value) => value.includes('sofa') || value.includes('couch') },
  { key: 'bed', test: (value) => value.includes('bed') || value.includes('mattress') },
  { key: 'mirror', test: (value) => value.includes('mirror') },
  { key: 'hood', test: (value) => value.includes('hood') },
  { key: 'desk', test: (value) => value.includes('desk') },
];

export function normalizeInventoryIconKey(value?: string | null): InventoryItemIconKey | null {
  const normalized = toNormalizedToken(value);
  if (!normalized) return null;

  const directAlias = ICON_KEY_ALIASES[normalized];
  if (directAlias) return directAlias;

  for (const rule of HEURISTIC_RULES) {
    if (rule.test(normalized)) return rule.key;
  }

  return null;
}

export function normalizeInventoryIconCandidates(values: Array<string | null | undefined>): InventoryItemIconKey | null {
  for (const value of values) {
    const normalized = normalizeInventoryIconKey(value);
    if (normalized) return normalized;
  }
  return null;
}
