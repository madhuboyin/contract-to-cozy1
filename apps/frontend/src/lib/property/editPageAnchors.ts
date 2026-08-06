// Section anchors already wired up on the property edit page's hash-anchor
// system (see `correctionAnchor` / #systems, #safety, #address, #occupancy,
// #exterior, #responsibility in .../properties/[id]/edit/page.tsx).
//
// Centralizing the mapping here so every "go fix this on your property"
// link across the app points at a section that actually exists and
// actually scrolls/expands to it, instead of dropping the homeowner at
// the top of a ~30-field form with nothing highlighted.
export type PropertyEditAnchor =
  | 'address'
  | 'systems'
  | 'safety'
  | 'occupancy'
  | 'exterior'
  | 'responsibility';

// Canonical health-score factor names from
// apps/backend/src/utils/propertyScore.util.ts. 'Appliances' and
// 'Documents' are deliberately excluded — they already have their own
// correct destinations (?focus=appliances, /dashboard/documents) and
// don't belong on the property edit page at all.
const HEALTH_FACTOR_ANCHORS: Record<string, PropertyEditAnchor> = {
  'Structure Factor': 'systems',
  'Systems Factor': 'systems',
  'Size Factor': 'systems',
  'HVAC Age': 'systems',
  'Water Heater Age': 'systems',
  'Roof Age': 'systems',
  'Usage/Wear Factor': 'occupancy',
  Safety: 'safety',
  Exterior: 'exterior',
};

export function anchorForHealthFactor(factorName: string | null | undefined): PropertyEditAnchor | null {
  if (!factorName) return null;
  if (HEALTH_FACTOR_ANCHORS[factorName]) return HEALTH_FACTOR_ANCHORS[factorName];
  const f = factorName.toLowerCase();
  if (f.includes('safety')) return 'safety';
  if (f.includes('exterior')) return 'exterior';
  if (f.includes('occupan') || f.includes('usage') || f.includes('wear')) return 'occupancy';
  if (
    f.includes('structure')
    || f.includes('system')
    || f.includes('size')
    || f.includes('hvac')
    || f.includes('roof')
    || f.includes('water heater')
    || f.includes('age')
  ) return 'systems';
  return null;
}

const FACT_LABEL_KEYWORDS: Array<{ anchor: PropertyEditAnchor; keywords: string[] }> = [
  { anchor: 'address', keywords: ['address', 'zip', 'coordinate', 'city', 'state', 'location'] },
  { anchor: 'safety', keywords: ['smoke detector', 'co detector', 'security system', 'fire extinguisher', 'sump pump'] },
  { anchor: 'exterior', keywords: ['exterior', 'deck', 'fence', 'pool', 'irrigation', 'drainage'] },
  { anchor: 'occupancy', keywords: ['bedroom', 'bathroom', 'occupan', 'ownership', 'responsib'] },
  {
    anchor: 'systems',
    keywords: ['roof', 'hvac', 'water heater', 'foundation', 'siding', 'electrical panel', 'year built', 'square foot', 'lot size', 'dwelling'],
  },
];

// `missingFacts` strings are free-form (AI/decision-layer generated), not
// a fixed enum, so this is a best-effort keyword match rather than an
// exhaustive mapping. Falls back to 'systems' — most property-
// characteristic facts land in Basics/Systems, and an approximate
// highlight is still closer than none.
export function anchorForFactLabel(fact: string | null | undefined): PropertyEditAnchor {
  const f = (fact || '').toLowerCase();
  for (const { anchor, keywords } of FACT_LABEL_KEYWORDS) {
    if (keywords.some((keyword) => f.includes(keyword))) return anchor;
  }
  return 'systems';
}

export function propertyEditHref(propertyId: string, anchor: PropertyEditAnchor | null): string {
  const base = `/dashboard/properties/${encodeURIComponent(propertyId)}/edit`;
  return anchor ? `${base}#${anchor}` : base;
}
