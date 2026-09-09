import React from 'react';
import { render } from '@testing-library/react';
import JobHubRedirectPage from '../JobHubRedirectPage';
import { api } from '@/lib/api/client';

const replaceMock = jest.fn();
const setSelectedPropertyIdMock = jest.fn();
let selectedPropertyId: string | undefined;

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/maintenance',
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => new URLSearchParams('propertyId=property-1&filter=overdue'),
}));

jest.mock('@/lib/property/PropertyContext', () => ({
  usePropertyContext: () => ({ selectedPropertyId, setSelectedPropertyId: setSelectedPropertyIdMock }),
}));

jest.mock('@/lib/api/client', () => ({
  api: {
    trackRouteRedirectEvent: jest.fn().mockResolvedValue(undefined),
    getProperties: jest.fn(),
  },
}));

const trackRedirectMock = api.trackRouteRedirectEvent as jest.Mock;

describe('JobHubRedirectPage', () => {
  beforeEach(() => {
    selectedPropertyId = undefined;
    replaceMock.mockReset();
    setSelectedPropertyIdMock.mockReset();
    trackRedirectMock.mockClear();
  });

  it('redirects and records telemetry only once when property context updates', () => {
    const { rerender } = render(<JobHubRedirectPage jobKey="maintenance" />);

    selectedPropertyId = 'property-1';
    rerender(<JobHubRedirectPage jobKey="maintenance" />);

    expect(setSelectedPropertyIdMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith(
      '/dashboard/properties/property-1/maintenance?filter=overdue'
    );
    expect(trackRedirectMock).toHaveBeenCalledTimes(1);
  });
});
