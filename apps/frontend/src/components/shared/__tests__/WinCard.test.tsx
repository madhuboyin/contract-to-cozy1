import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
    expect(screen.getByText(/Template fallback/i)).toBeInTheDocument();
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
    expect(screen.getByText(/Today/i)).toBeInTheDocument();
  });

  it('renders the compact action row when requested', () => {
    const onAction = jest.fn();

    render(
      <WinCard
        title="Priority alert"
        value="Freeze Risk Detected"
        description="Forecast minimum temperature is 26.4°F in the next 36 hours."
        actionLabel="Review incident"
        actionMetaLabel="Potential savings"
        actionMetaValue="$180"
        actionMetaSupportingText="Verified from live signals"
        compactActionLayout
        onAction={onAction}
        trust={{
          confidenceLabel: 'High',
          freshnessLabel: 'Verified from live signals',
          sourceLabel: 'Home signals',
        }}
      />
    );

    expect(screen.getByText('Potential savings')).toBeInTheDocument();
    expect(screen.getByText('$180')).toBeInTheDocument();
    expect(screen.getByText('Verified from live signals')).toBeInTheDocument();

    const button = screen.getByRole('button', { name: /review incident/i });
    expect(button.className).toContain('w-fit');

    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
