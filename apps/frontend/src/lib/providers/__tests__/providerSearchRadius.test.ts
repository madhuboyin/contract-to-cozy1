import {
  DEFAULT_PROVIDER_SEARCH_RADIUS,
  getNextProviderSearchRadius,
  PROVIDER_SEARCH_RADII,
} from '../providerSearchRadius';

describe('provider search radius', () => {
  it('progressively widens a located search without exceeding the API limit', () => {
    expect(DEFAULT_PROVIDER_SEARCH_RADIUS).toBe(25);
    expect(PROVIDER_SEARCH_RADII).toEqual([25, 50, 100]);
    expect(getNextProviderSearchRadius(25, true)).toBe(50);
    expect(getNextProviderSearchRadius(50, true)).toBe(100);
    expect(getNextProviderSearchRadius(100, true)).toBeNull();
  });

  it('does not offer radius expansion when there is no location filter', () => {
    expect(getNextProviderSearchRadius(25, false)).toBeNull();
  });
});
