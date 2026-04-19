import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import RevealOnboardingPage from '../page';

const routerMock = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  prefetch: jest.fn(),
  refresh: jest.fn(),
};

jest.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}));

jest.mock('@/lib/analytics/events', () => ({
  track: jest.fn(),
}));

describe('Onboarding reveal fallback mode', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('shows deterministic fallback wins when lookup payload is malformed', async () => {
    sessionStorage.setItem('onboarding_lookup_data', '{not-valid-json');

    render(<RevealOnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText('Baseline Fallback Mode')).toBeInTheDocument();
    }, { timeout: 7_000 });

    expect(screen.getByText('Your home')).toBeInTheDocument();
    expect(screen.getByText('Protection Baseline')).toBeInTheDocument();
    expect(screen.getByText('Wealth Baseline')).toBeInTheDocument();
  });
});
