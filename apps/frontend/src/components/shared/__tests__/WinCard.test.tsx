import React from 'react';
import { render, screen } from '@testing-library/react';
import { WinCard } from '@/components/shared/WinCard';

jest.mock('@/lib/analytics/events', () => ({
  track: jest.fn(),
}));

describe('WinCard fallback trust behavior', () => {
  it('renders deterministic low-confidence trust fallback when trust metadata is missing', () => {
    render(
      <WinCard
        title="Fallback win"
        value="Starter guidance"
        description="Fallback description"
      />
    );

    expect(screen.getByText('Baseline fallback insight')).toBeInTheDocument();
    expect(screen.getByText(/Low confidence \(fallback\)/i)).toBeInTheDocument();
  });

  it('does not render fallback badge when explicit trust metadata is provided', () => {
    render(
      <WinCard
        title="Trusted win"
        value="$250 Saved"
        description="Trusted description"
        trust={{
          confidenceLabel: 'High (93%)',
          freshnessLabel: 'Today',
          sourceLabel: 'Verified records',
        }}
      />
    );

    expect(screen.queryByText('Baseline fallback insight')).not.toBeInTheDocument();
    expect(screen.getByText(/High \(93%\)/i)).toBeInTheDocument();
  });
});
