import { resolveDashboardBackHref, resolveToolReturnHref } from '../backNavigation';

describe('property tool return navigation', () => {
  const fallback = '/dashboard/properties/property-1';

  it('prefers the canonical backTo contract', () => {
    const params = new URLSearchParams({
      backTo: '/dashboard/properties/property-1#property-systems',
      returnTo: '/dashboard/properties/property-1',
    });
    expect(resolveToolReturnHref(params, fallback)).toBe('/dashboard/properties/property-1#property-systems');
  });

  it('accepts the legacy returnTo alias', () => {
    const params = new URLSearchParams({ returnTo: '/dashboard/properties/property-1#property-rooms' });
    expect(resolveToolReturnHref(params, fallback)).toBe('/dashboard/properties/property-1#property-rooms');
  });

  it('rejects external and protocol-relative return paths', () => {
    expect(resolveDashboardBackHref('https://example.com', fallback)).toBe(fallback);
    expect(resolveDashboardBackHref('//example.com/dashboard', fallback)).toBe(fallback);
    expect(resolveDashboardBackHref('/dashboard-impersonator', fallback)).toBe(fallback);
  });
});
