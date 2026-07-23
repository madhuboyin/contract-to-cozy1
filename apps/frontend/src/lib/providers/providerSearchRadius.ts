export const PROVIDER_SEARCH_RADII = [25, 50, 100] as const;

export const DEFAULT_PROVIDER_SEARCH_RADIUS = PROVIDER_SEARCH_RADII[0];

export function getNextProviderSearchRadius(
  currentRadius: number,
  hasLocation: boolean,
): number | null {
  if (!hasLocation) return null;
  return PROVIDER_SEARCH_RADII.find((radius) => radius > currentRadius) ?? null;
}
