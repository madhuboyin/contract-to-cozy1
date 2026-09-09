import React from 'react';
import { render, screen } from '@testing-library/react';
import { redirect } from 'next/navigation';
import MaintenanceRedirectPage from '../page';

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

jest.mock('@/components/navigation/JobHubRedirectPage', () => ({
  __esModule: true,
  default: ({ jobKey }: { jobKey: string }) => <div>Resolve {jobKey}</div>,
}));

const redirectMock = redirect as jest.MockedFunction<typeof redirect>;

describe('legacy maintenance route', () => {
  beforeEach(() => {
    redirectMock.mockReset();
    redirectMock.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });
  });

  it('server-redirects a property-scoped request and preserves its context', async () => {
    await expect(
      MaintenanceRedirectPage({
        searchParams: Promise.resolve({
          propertyId: 'property / 1',
          filter: 'overdue',
          activationTriggerId: 'trigger-1',
          tag: ['one', 'two'],
        }),
      })
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith(
      '/dashboard/properties/property%20%2F%201/maintenance?filter=overdue&activationTriggerId=trigger-1&tag=one&tag=two'
    );
  });

  it('uses the client property resolver only when no property ID is supplied', async () => {
    const page = await MaintenanceRedirectPage({ searchParams: Promise.resolve({ filter: 'seasonal' }) });
    render(page);

    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByText('Resolve maintenance')).toBeInTheDocument();
  });
});
