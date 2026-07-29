import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { OutcomeRecorder } from '@/components/savings-benefits/OutcomeRecorder';
import { api } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({
  api: {
    listHiddenAssetMatchOutcomes: jest.fn(),
    getSavingsBenefitsOpportunityDetail: jest.fn(),
  },
}));

jest.mock('@/app/(dashboard)/dashboard/components/inventory/DocumentUploadZone', () => ({
  __esModule: true,
  default: () => <button type="button">Upload evidence</button>,
}));

jest.mock('@/app/(dashboard)/dashboard/components/inventory/DocumentPickerModal', () => ({
  __esModule: true,
  default: () => null,
}));

describe('Savings and Benefits runtime accessibility', () => {
  beforeEach(() => {
    jest.mocked(api.listHiddenAssetMatchOutcomes).mockResolvedValue([]);
    jest.mocked(api.getSavingsBenefitsOpportunityDetail).mockResolvedValue({
      opportunity: { savingsBenefitActions: [] },
    } as never);
  });

  it('renders operable named controls and passes the WCAG A/AA automated scan', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { container, unmount } = render(
      <QueryClientProvider client={queryClient}>
        <OutcomeRecorder
          family="BENEFIT"
          id="match-accessibility"
          propertyId="property-accessibility"
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(api.listHiddenAssetMatchOutcomes).toHaveBeenCalled();
      expect(api.getSavingsBenefitsOpportunityDetail).toHaveBeenCalled();
    });
    const stageGroup = screen.getByRole('group', { name: 'Outcome stage to record' });
    expect(stageGroup).toBeVisible();

    const submitted = screen.getByRole('button', { name: 'Submitted' });
    submitted.focus();
    fireEvent.keyDown(submitted, { key: 'Tab' });
    expect(submitted).toHaveAttribute('aria-pressed', 'true');

    const result = await axe.run(container, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'],
      },
      // jsdom has no canvas/layout engine, so contrast remains covered by
      // the browser-level acceptance gates used in this repository.
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(result.violations).toEqual([]);
    unmount();
    queryClient.clear();
  });
});
