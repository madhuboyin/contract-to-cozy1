const ASSET_DISPLAY_LABELS: Record<string, string> = {
  HVAC_FURNACE: 'HVAC Furnace',
  HVAC_HEAT_PUMP: 'HVAC Heat Pump',
  HVAC_FURNACE_FILTER: 'HVAC Filter',
  HVAC_FILTER: 'HVAC Filter',
  HVAC_FILTER_CHECK: 'HVAC Filter',
  ROOF_SHINGLE: 'Roof',
  ROOF_TILE_METAL: 'Roof',
  WATER_HEATER_TANK: 'Water Heater',
  WATER_HEATER_TANKLESS: 'Tankless Water Heater',
};

const ACRONYMS = new Set(['CO', 'GFCI', 'HOA', 'HVAC']);

function identifierKey(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function humanizeIdentifier(value: string): string {
  return identifierKey(value)
    .split('_')
    .filter(Boolean)
    .map((word) => ACRONYMS.has(word) ? word : `${word.charAt(0)}${word.slice(1).toLowerCase()}`)
    .join(' ');
}

/** Converts stored system identifiers and overly technical inventory labels into homeowner-facing names. */
export function getHomeAssetDisplayLabel(input: {
  name?: string | null;
  assetType?: string | null;
  category?: string | null;
}): string {
  const candidates = [input.assetType, input.name, input.category]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const mapped = ASSET_DISPLAY_LABELS[identifierKey(candidate)];
    if (mapped) return mapped;
  }

  const fallback = input.name || input.assetType || input.category || 'Home item';
  return humanizeIdentifier(fallback) || 'Home item';
}
