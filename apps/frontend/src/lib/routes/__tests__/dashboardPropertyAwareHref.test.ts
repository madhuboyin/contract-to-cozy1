import {
  buildPropertyAwareDashboardHref,
  resolvePropertyHrefFromNavTarget,
} from '../dashboardPropertyAwareHref';

function parseHref(href: string): { path: string; params: URLSearchParams } {
  const [path, query = ''] = href.split('?');
  return { path, params: new URLSearchParams(query) };
}

describe('buildPropertyAwareDashboardHref', () => {
  it('maps known legacy tool routes to canonical property routes', () => {
    const href = buildPropertyAwareDashboardHref('property-123', '/dashboard/home-savings');
    expect(href).toBe('/dashboard/properties/property-123/tools/home-savings');
  });

  it('maps health-score dashboard route to canonical property route', () => {
    const href = buildPropertyAwareDashboardHref('property-123', '/dashboard/health-score');
    expect(href).toBe('/dashboard/properties/property-123/health-score');
  });

  it('maps fix dashboard route to canonical property route', () => {
    const href = buildPropertyAwareDashboardHref('property-123', '/dashboard/fix');
    expect(href).toBe('/dashboard/properties/property-123/fix');
  });

  it('maps save dashboard route to canonical property route', () => {
    const href = buildPropertyAwareDashboardHref('property-123', '/dashboard/save');
    expect(href).toBe('/dashboard/properties/property-123/save');
  });

  it('preserves query params on mapped routes and removes propertyId from source query', () => {
    const href = buildPropertyAwareDashboardHref(
      'property-123',
      '/dashboard/coverage-intelligence?entry=insurance&propertyId=old-id',
    );

    const { path, params } = parseHref(href);
    expect(path).toBe('/dashboard/properties/property-123/tools/coverage-intelligence');
    expect(params.get('entry')).toBe('insurance');
    expect(params.get('propertyId')).toBeNull();
  });

  it('falls back to property selector navTarget when property is unavailable', () => {
    const href = buildPropertyAwareDashboardHref(undefined, '/dashboard/home-savings?guidanceStepKey=step-1');

    const { path, params } = parseHref(href);
    expect(path).toBe('/dashboard/properties');
    expect(params.get('guidanceStepKey')).toBe('step-1');
    expect(params.get('navTarget')).toBe('home-savings');
  });

  it('canonicalizes replace-repair itemId query to item-scoped route when property is available', () => {
    const href = buildPropertyAwareDashboardHref(
      'property-123',
      '/dashboard/replace-repair?itemId=item-9&guidanceJourneyId=journey-2',
    );

    const { path, params } = parseHref(href);
    expect(path).toBe('/dashboard/properties/property-123/inventory/items/item-9/replace-repair');
    expect(params.get('guidanceJourneyId')).toBe('journey-2');
    expect(params.get('itemId')).toBeNull();
  });

  it('keeps replace-repair itemId query on navTarget fallback when property is unavailable', () => {
    const href = buildPropertyAwareDashboardHref(
      undefined,
      '/dashboard/replace-repair?itemId=item-9&guidanceJourneyId=journey-2',
    );

    const { path, params } = parseHref(href);
    expect(path).toBe('/dashboard/properties');
    expect(params.get('navTarget')).toBe('replace-repair');
    expect(params.get('itemId')).toBe('item-9');
    expect(params.get('guidanceJourneyId')).toBe('journey-2');
  });

  it('appends propertyId for unknown routes when property is available', () => {
    const href = buildPropertyAwareDashboardHref('property-123', '/dashboard/custom-tool?foo=bar');
    const { path, params } = parseHref(href);

    expect(path).toBe('/dashboard/custom-tool');
    expect(params.get('foo')).toBe('bar');
    expect(params.get('propertyId')).toBe('property-123');
  });
});

describe('resolvePropertyHrefFromNavTarget', () => {
  it('maps replace-repair navTarget with itemId to item-scoped canonical route', () => {
    const href = resolvePropertyHrefFromNavTarget(
      'property-123',
      'replace-repair',
      new URLSearchParams('itemId=item-9'),
    );

    expect(href).toBe('/dashboard/properties/property-123/inventory/items/item-9/replace-repair');
  });

  it('maps replace-repair navTarget to inventory intent route when itemId is absent', () => {
    const href = resolvePropertyHrefFromNavTarget('property-123', 'replace-repair');
    expect(href).toBe('/dashboard/properties/property-123/inventory?intent=replace-repair');
  });

  it('maps tool-prefixed navTarget values to canonical tool routes', () => {
    const href = resolvePropertyHrefFromNavTarget('property-123', 'tool:home-event-radar');
    expect(href).toBe('/dashboard/properties/property-123/tools/home-event-radar');
  });

  it('returns undefined for unknown navTarget values', () => {
    const href = resolvePropertyHrefFromNavTarget('property-123', 'unknown-target');
    expect(href).toBeUndefined();
  });
});
