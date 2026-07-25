import { fireEvent, render, screen } from '@testing-library/react';
import { MortgageRateHistoryChart } from '../MortgageRateHistoryChart';

const rateData = {
  snapshots: [
    {
      id: 'new',
      date: '2026-07-23',
      rate30yr: 6.25,
      rate15yr: 5.5,
      source: 'FRED',
      sourceRef: 'FRED/MORTGAGE30US+MORTGAGE15US',
      createdAt: '2026-07-23T21:00:00.000Z',
    },
    {
      id: 'old',
      date: '2026-04-23',
      rate30yr: 6.75,
      rate15yr: 6,
      source: 'FRED',
      sourceRef: 'FRED/MORTGAGE30US+MORTGAGE15US',
      createdAt: '2026-04-23T21:00:00.000Z',
    },
  ],
  trendSummary: {
    current30yr: 6.25,
    current15yr: 5.5,
    prior30yr: 6.75,
    deltaWeeks: 13,
    trend30yr: 'FALLING' as const,
    trendLabel: 'Rates have fallen.',
  },
  transitions: [
    {
      id: 'transition-open',
      transitionType: 'OPEN' as const,
      previousState: 'CLOSED' as const,
      nextState: 'OPEN' as const,
      snapshotId: 'old',
      opportunityId: 'opportunity-1',
      materialChangeReasons: ['OPPORTUNITY_THRESHOLD_MET'],
      occurredAt: '2026-04-23T22:00:00.000Z',
    },
    {
      id: 'transition-close',
      transitionType: 'CLOSED' as const,
      previousState: 'OPEN' as const,
      nextState: 'CLOSED' as const,
      snapshotId: 'new',
      opportunityId: 'opportunity-1',
      materialChangeReasons: ['OPPORTUNITY_THRESHOLD_NO_LONGER_MET'],
      occurredAt: '2026-07-23T22:00:00.000Z',
    },
  ],
};

describe('MortgageRateHistoryChart', () => {
  it('renders a personalized, keyboard-readable chart and source freshness', () => {
    render(
      <MortgageRateHistoryChart
        rateData={rateData}
        currentMortgageRatePct={7.125}
      />,
    );

    expect(screen.getByRole('img', { name: /30-year fixed benchmark/i })).toBeInTheDocument();
    expect(screen.getByText(/fell 0.500 percentage points/i)).toBeInTheDocument();
    expect(screen.getByText(/Your current note rate/i)).toBeInTheDocument();
    expect(screen.getByText(/FRED\/MORTGAGE30US/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Apr 23, 2026: 30-year fixed benchmark 6.750 percent/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/OPEN refinance transition on Apr 23, 2026/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/CLOSED refinance transition on Jul 23, 2026/i)).toBeInTheDocument();
    expect(screen.getByText('Opportunity window')).toBeInTheDocument();
  });

  it('switches products and exposes the accessible table fallback', () => {
    render(<MortgageRateHistoryChart rateData={rateData} />);

    fireEvent.click(screen.getByRole('button', { name: '15-year' }));
    expect(screen.getByText(/15-year fixed benchmark fell 0.500 percentage points/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show accessible rate table/i }));
    expect(screen.getByRole('table', { name: /15-year fixed benchmark observations/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '30-year' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '15-year' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Radar transition' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'OPEN' })).toBeInTheDocument();
  });
});
