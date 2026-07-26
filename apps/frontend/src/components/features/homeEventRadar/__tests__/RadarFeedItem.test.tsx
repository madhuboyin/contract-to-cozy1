import { fireEvent, render, screen } from '@testing-library/react';
import type { RadarCanonicalFeedItem } from '@/types';
import { RadarFeedItem } from '../RadarFeedItem';

const item: RadarCanonicalFeedItem = {
  id: 'match-1',
  propertyMatchId: 'match-1',
  eventId: 'event-1',
  eventType: 'wind',
  sourceFamily: 'weather',
  title: 'Wind advisory',
  summary: 'Strong winds may affect loose outdoor objects.',
  severity: 'severe',
  impact: 'low',
  confidence: 'medium',
  priorityBand: 'high',
  priorityScore: 72,
  matchLifecycleStatus: 'now',
  sourceFreshnessStatus: 'stale',
  sourceFreshnessReason: 'SOURCE_DELAYED',
  isSourceStale: true,
  isMaterialUpdate: true,
  lifecycleStatus: 'updated',
  effectiveAt: '2026-07-26T14:00:00.000Z',
  expiresAt: '2026-07-26T20:00:00.000Z',
  sourceName: 'NWS',
  provider: 'National Weather Service',
  userState: 'new',
};

describe('RadarFeedItem', () => {
  it('renders canonical provenance, timing, severity, impact, and limited confidence', () => {
    render(<RadarFeedItem item={item} onClick={jest.fn()} />);

    expect(screen.getByText('Source: NWS · National Weather Service')).toBeInTheDocument();
    expect(screen.getByText(/Effective .* Expires/)).toBeInTheDocument();
    expect(screen.getByText('Severe')).toBeInTheDocument();
    expect(screen.getByText('Low property impact')).toBeInTheDocument();
    expect(screen.getByText('Moderate confidence')).toBeInTheDocument();
    expect(screen.getByText('Updated')).toBeInTheDocument();
    expect(screen.getByText('Source delayed')).toBeInTheDocument();
    expect(screen.getByText('Review update')).toBeInTheDocument();
  });

  it('provides a descriptive accessible action and forwards the canonical item', () => {
    const onClick = jest.fn();
    render(<RadarFeedItem item={item} onClick={onClick} />);

    const action = screen.getByRole('button', {
      name: /Review update: Wind advisory.*Source NWS.*Severe.*Low property impact.*Effective.*Moderate confidence.*Source reporting is delayed/i,
    });
    fireEvent.click(action);

    expect(onClick).toHaveBeenCalledWith(item);
  });

  it('does not present confidence as limited when it is high or verified', () => {
    render(
      <RadarFeedItem
        item={{ ...item, confidence: 'verified', isMaterialUpdate: false }}
        onClick={jest.fn()}
      />,
    );

    expect(screen.queryByText(/confidence/i)).not.toBeInTheDocument();
    expect(screen.getByText('View details')).toBeInTheDocument();
  });
});
