import { resolvePageContext } from '../resolvePageContext';

describe('resolvePageContext', () => {
  it('prefers explicit context over pathname matches', () => {
    expect(
      resolvePageContext({
        explicitContext: 'property-hub',
        pathname: '/dashboard/properties/prop-1/tools/service-price-radar',
      }),
    ).toBe('property-hub');
  });

  it('resolves known tool routes from pathname', () => {
    expect(
      resolvePageContext({
        pathname: '/dashboard/properties/prop-1/tools/service-price-radar',
      }),
    ).toBe('service-price-radar');

    expect(
      resolvePageContext({
        pathname: '/dashboard/properties/prop-1/status-board',
      }),
    ).toBe('status-board');
  });

  it('returns null for unknown routes', () => {
    expect(
      resolvePageContext({
        pathname: '/dashboard/somewhere-unmapped',
      }),
    ).toBeNull();
  });
});
