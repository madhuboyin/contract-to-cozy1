export const PROPERTY_APPLIANCE_SOURCE_HASH_PREFIX = 'property_appliance::';

export const MAJOR_APPLIANCE_TYPES = [
  'DISHWASHER',
  'REFRIGERATOR',
  'OVEN_RANGE',
  'WASHER_DRYER',
  'MICROWAVE_HOOD',
  'WATER_SOFTENER',
] as const;

export type MajorApplianceType = typeof MAJOR_APPLIANCE_TYPES[number];

const MAJOR_APPLIANCE_PATTERNS: Record<MajorApplianceType, RegExp[]> = {
  DISHWASHER: [/dish\s*washer/i, /dishwasher/i],
  REFRIGERATOR: [/refrigerator/i, /fridge/i, /freezer/i],
  OVEN_RANGE: [/\boven\b/i, /\brange\b/i, /\bstove\b/i, /cooktop/i, /cook\s*top/i],
  WASHER_DRYER: [/washer/i, /dryer/i, /laundry/i, /washing\s*machine/i],
  MICROWAVE_HOOD: [/microwave/i, /micro\s*wave/i, /range\s*hood/i, /vent\s*hood/i, /exhaust\s*hood/i],
  WATER_SOFTENER: [/water\s*softener/i, /softener/i, /water\s*conditioner/i],
};

export function inferMajorApplianceType(name: string | null | undefined): MajorApplianceType | null {
  if (!name) return null;
  const normalized = String(name).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;

  for (const [type, patterns] of Object.entries(MAJOR_APPLIANCE_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(normalized))) {
      return type as MajorApplianceType;
    }
  }
  return null;
}

export function majorApplianceTypeFromSourceHash(
  sourceHash: string | null | undefined
): MajorApplianceType | null {
  if (!sourceHash || !sourceHash.startsWith(PROPERTY_APPLIANCE_SOURCE_HASH_PREFIX)) return null;
  const value = sourceHash.slice(PROPERTY_APPLIANCE_SOURCE_HASH_PREFIX.length).toUpperCase();
  return MAJOR_APPLIANCE_TYPES.includes(value as MajorApplianceType) ? (value as MajorApplianceType) : null;
}

export function formatMajorApplianceType(type: string | null | undefined) {
  return String(type || '')
    .toLowerCase()
    .split('_')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ')
    .trim();
}

