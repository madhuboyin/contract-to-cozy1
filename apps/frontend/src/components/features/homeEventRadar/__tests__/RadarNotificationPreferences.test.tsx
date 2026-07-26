import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { RadarNotificationPreferences } from '@/types';
import { RadarNotificationPreferencesCard } from '../RadarNotificationPreferences';

jest.mock('@/lib/api/client', () => ({
  api: {
    getRadarNotificationPreferences: jest.fn(),
    updateRadarNotificationPreferences: jest.fn(),
  },
}));

const preference: RadarNotificationPreferences = {
  propertyId: 'property-1',
  userId: 'user-1',
  isEnabled: true,
  enabledCategories: ['weather', 'utility'],
  channels: ['in_app'],
  minimumSeverity: 'moderate',
  minimumImpact: 'moderate',
  deliveryMode: 'immediate',
  quietHours: null,
  timezone: 'America/New_York',
  persisted: false,
  updatedAt: null,
};

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RadarNotificationPreferencesCard propertyId="property-1" />
    </QueryClientProvider>,
  );
}

describe('RadarNotificationPreferencesCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(api.getRadarNotificationPreferences).mockResolvedValue(preference);
    jest.mocked(api.updateRadarNotificationPreferences).mockResolvedValue({
      ...preference,
      channels: ['in_app', 'email'],
      persisted: true,
      updatedAt: '2026-07-26T12:00:00.000Z',
    });
  });

  it('loads lazily and persists channel and timing controls', async () => {
    renderCard();
    expect(api.getRadarNotificationPreferences).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /radar notifications/i }));
    expect(await screen.findByLabelText('Email')).not.toBeChecked();
    fireEvent.click(screen.getByLabelText('Email'));
    fireEvent.click(screen.getByLabelText(/digest/i));
    fireEvent.click(screen.getByRole('button', { name: 'Save notification settings' }));

    await waitFor(() => expect(api.updateRadarNotificationPreferences).toHaveBeenCalledWith(
      'property-1',
      expect.objectContaining({
        channels: ['in_app', 'email'],
        deliveryMode: 'digest',
        timezone: 'America/New_York',
      }),
    ));
    expect(await screen.findByText('Notification preferences saved.')).toBeInTheDocument();
  });

  it('requires at least one selected category before saving', async () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /radar notifications/i }));
    await screen.findByLabelText('Weather');
    fireEvent.click(screen.getByLabelText('Weather'));
    fireEvent.click(screen.getByLabelText('Utilities'));

    expect(screen.getByText('Select at least one category.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save notification settings' })).toBeDisabled();
  });
});
