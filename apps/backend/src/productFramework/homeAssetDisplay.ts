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
  SAFETY_SMOKE_CO_DETECTOR: 'Smoke & CO Detector Check',
  SAFETY_SMOKE_CO_DETECTORS: 'Smoke & CO Detector Check',
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

const RISK_LEVEL_PREFIX = /^(?:LOW|MODERATE|MEDIUM|ELEVATED|HIGH|CRITICAL|URGENT)\s+RISK\s*[:\-–]\s*/i;
const SCREAMING_SNAKE_TOKEN = /[A-Z0-9]+(?:_[A-Z0-9]+)+/g;
const DECISION_FILLER_SUFFIX = /\s*[:\-–]\s*(?:continue the active decision|review project status|continue|review)\s*$/i;

/**
 * Last-resort homeowner-facing text for a Home Action headline / subject when
 * it would otherwise be a producer-internal string (a `signal`, a stored
 * `title`, a raw enum). Strips risk-level prefixes ("HIGH Risk: HVAC_FURNACE"),
 * expands SCREAMING_SNAKE identifiers through the asset-label map, and drops
 * generic decision filler suffixes. Prose passes through unchanged.
 *
 * See docs/product/HOME_ACTION_HEALTH_FACTOR_COPY_FRD.md §12 (decision-card
 * verbiage). This is a safety net — producers should author a real
 * presentation.headline rather than rely on it.
 */
export function humanizeHomeActionLabel(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return raw;

  const riskMatch = raw.match(RISK_LEVEL_PREFIX);
  const body = raw.replace(RISK_LEVEL_PREFIX, '').replace(DECISION_FILLER_SUFFIX, '').trim() || raw;

  // A bare identifier ("HVAC_FURNACE") — route through the asset-label map.
  if (/^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(body)) {
    const label = getHomeAssetDisplayLabel({ name: body, assetType: body });
    return riskMatch ? `Review the ${label} risk` : label;
  }

  // A whole string that is exactly a known asset identifier once normalized
  // ("Safety Smoke CO Detectors" -> "SAFETY_SMOKE_CO_DETECTORS"). Only fires on
  // an exact map hit, so legitimate titles are untouched.
  if (ASSET_DISPLAY_LABELS[identifierKey(body)]) {
    const label = ASSET_DISPLAY_LABELS[identifierKey(body)];
    return riskMatch ? `Review the ${label} risk` : label;
  }

  // An identifier embedded in otherwise-readable text ("New HVAC_FURNACE quote").
  const expanded = body.replace(SCREAMING_SNAKE_TOKEN, (token) =>
    getHomeAssetDisplayLabel({ name: token, assetType: token }));

  if (riskMatch) return `Review the ${expanded} risk`;
  return expanded;
}
