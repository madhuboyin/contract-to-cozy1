import {
  forwardRadarHandoffContinuity,
  RADAR_HANDOFF_CONTEXT_KEYS,
  sanitizeDashboardReturnTo,
} from '../radarHandoffContinuity';

describe('Radar handoff continuity', () => {
  it('forwards only reviewed Radar lineage and preserves destination-owned values', () => {
    const source = new URLSearchParams({
      launchSurface: 'home_event_radar',
      sourceEntityType: 'RADAR_MATCH',
      sourceEntityId: 'match-1',
      radarMatchId: 'match-1',
      radarEventId: 'event-1',
      incidentId: 'incident-1',
      journeyId: 'journey-1',
      guidanceJourneyId: 'journey-1',
      guidanceStepKey: 'step-1',
      returnTo: '/dashboard/properties/property-1/tools/home-event-radar?matchId=match-1',
      from: 'home-event-radar',
      unsafe: 'do-not-forward',
    });
    const target = new URLSearchParams({ from: 'destination-owned' });

    forwardRadarHandoffContinuity(source, target);

    expect(target.get('sourceEntityId')).toBe('match-1');
    expect(target.get('incidentId')).toBe('incident-1');
    expect(target.get('guidanceJourneyId')).toBe('journey-1');
    expect(target.get('returnTo')).toContain('home-event-radar');
    expect(target.get('from')).toBe('destination-owned');
    expect(target.has('unsafe')).toBe(false);
    expect(RADAR_HANDOFF_CONTEXT_KEYS).not.toContain('unsafe');
  });

  it('accepts dashboard returns and rejects external or protocol-relative returns', () => {
    expect(sanitizeDashboardReturnTo(
      '/dashboard/properties/property-1/tools/home-event-radar?matchId=match-1',
    )).toContain('home-event-radar');
    expect(sanitizeDashboardReturnTo('https://evil.example/dashboard')).toBeNull();
    expect(sanitizeDashboardReturnTo('//evil.example/dashboard')).toBeNull();
    expect(sanitizeDashboardReturnTo('/settings')).toBeNull();
  });
});
