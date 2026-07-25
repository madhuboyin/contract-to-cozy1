import { resolveDashboardCommandPaletteCatalog } from '../dashboardCommandPaletteCatalog';

describe('resolveDashboardCommandPaletteCatalog', () => {
  it('does not load the catalog while the palette is closed', () => {
    expect(
      resolveDashboardCommandPaletteCatalog({
        pathname: '/dashboard/properties/route-property/materials',
        selectedPropertyId: 'selected-property',
        isAdmin: false,
        open: false,
      }),
    ).toEqual({
      propertyId: 'route-property',
      enabled: false,
    });
  });

  it('uses the route property before a stale selected property', () => {
    expect(
      resolveDashboardCommandPaletteCatalog({
        pathname: '/dashboard/properties/route-property/materials',
        selectedPropertyId: 'selected-property',
        isAdmin: false,
        open: true,
      }),
    ).toEqual({
      propertyId: 'route-property',
      enabled: true,
    });
  });

  it('keeps catalog loading disabled for administrators', () => {
    expect(
      resolveDashboardCommandPaletteCatalog({
        explicitPropertyId: 'explicit-property',
        isAdmin: true,
        open: true,
      }),
    ).toEqual({
      propertyId: 'explicit-property',
      enabled: false,
    });
  });
});
