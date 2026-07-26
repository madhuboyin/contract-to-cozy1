import { toLegacyRadarFeedItem } from '../radarCanonicalAdapter';
import type { RadarCanonicalFeedItem } from '@/types';

const canonical: RadarCanonicalFeedItem = {
  id: 'match-1',
  propertyMatchId: 'match-1',
  eventId: 'event-1',
  eventType: 'wind',
  sourceFamily: 'weather',
  title: 'Wind advisory',
  summary: 'Strong wind is expected.',
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

describe('canonical Radar card compatibility projection', () => {
  it('preserves identity, timing, lifecycle, state, and freshness', () => {
    const item = toLegacyRadarFeedItem(canonical, 'property-1');

    expect(item.propertyRadarMatchId).toBe('match-1');
    expect(item.radarEventId).toBe('event-1');
    expect(item.timingGroup).toBe('now');
    expect(item.state).toBe('new');
    expect(item.isSourceStale).toBe(true);
    expect(item.isMaterialUpdate).toBe(true);
  });

  it('maps canonical display enums without overstating property impact', () => {
    const item = toLegacyRadarFeedItem(canonical, 'property-1');
    expect(item.severity).toBe('critical');
    expect(item.impactLevel).toBe('watch');
    expect(item.impactSummary).toBeNull();
  });
});
