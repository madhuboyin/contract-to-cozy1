// Capital Timeline "Bundle opportunity" (Desktop's BundleOpportunityCard): the largest cluster of HIGH or MEDIUM priority windows
// whose start years are within two years of an anchor, with a hand-off to a Service Price Radar quote check for the first item.
export const CAPITAL_BUNDLE_ACTION_ID = 'capital-bundle-price-check';
export const CAPITAL_BUNDLE_ENTITY_TYPE = 'CAPITAL_TIMELINE_ITEM';

export type CapitalBundleItem = {
  id: string; category: unknown; priority?: unknown; windowStart: Date | string;
  estimatedCostMinCents: number | null; estimatedCostMaxCents: number | null; inventoryItem?: { name?: string | null } | null;
};

const year = (value: Date | string) => new Date(value).getFullYear();

/** The page's own category mapping; anything else is general handyman work. */
export function servicePriceCategoryForCapital(category: unknown): string {
  switch (String(category)) {
    case 'HVAC': return 'HVAC';
    case 'WATER_HEATER': return 'WATER_HEATER';
    case 'PLUMBING': return 'PLUMBING';
    case 'ELECTRICAL': return 'ELECTRICAL';
    case 'ROOF':
    case 'EXTERIOR': return 'ROOFING';
    default: return 'GENERAL_HANDYMAN';
  }
}

export function capitalBundle<T extends CapitalBundleItem>(items: readonly T[]): { group: T[]; midCents: number; yearRange: string } | null {
  const candidates = items.filter((item) => item.priority === 'HIGH' || item.priority === 'MEDIUM');
  if (candidates.length < 2) return null;
  const sorted = [...candidates].sort((a, b) => new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime());
  let group: T[] = [];
  for (const anchor of sorted) {
    const cluster = sorted.filter((item) => Math.abs(year(item.windowStart) - year(anchor.windowStart)) <= 2);
    if (cluster.length > group.length) group = cluster;
  }
  if (group.length < 2) return null;
  const midCents = group.reduce((sum, item) => sum + ((item.estimatedCostMinCents ?? 0) + (item.estimatedCostMaxCents ?? 0)) / 2, 0);
  const start = year(group[0].windowStart);
  const end = year(group[group.length - 1].windowStart);
  return { group, midCents, yearRange: start === end ? String(start) : `${start}–${end}` };
}
