import {
  buildHomeEventRadarHref,
  canonicalizeRadarDeepLinkQuery,
  parseRadarDeepLinkState,
  patchRadarDeepLinkQuery,
} from '../radarDeepLinks';

describe('Home Event Radar deep links', () => {
  it('parses canonical view, family, and match selection', () => {
    expect(parseRadarDeepLinkState(
      new URLSearchParams('view=now&family=weather&matchId=match-1'),
    )).toEqual({ view: 'now', family: 'weather', matchId: 'match-1' });
  });

  it('fails closed for unsupported or unsafe state while preserving unrelated context', () => {
    const query = new URLSearchParams(
      'view=invented&family=secret&matchId=%3Cscript%3E&guidanceJourneyId=journey-1',
    );
    expect(parseRadarDeepLinkState(query)).toEqual({
      view: 'all',
      family: 'all',
      matchId: null,
    });
    expect(canonicalizeRadarDeepLinkQuery(query).toString()).toBe(
      'guidanceJourneyId=journey-1',
    );
  });

  it('patches meaningful state without dropping guidance context', () => {
    const query = patchRadarDeepLinkQuery(
      new URLSearchParams('guidanceStepKey=review'),
      { view: 'upcoming', family: 'utility', matchId: 'match-9' },
    );
    expect(query.get('guidanceStepKey')).toBe('review');
    expect(query.get('view')).toBe('upcoming');
    expect(query.get('family')).toBe('utility');
    expect(query.get('matchId')).toBe('match-9');
  });

  it('builds the canonical property route for cross-surface links', () => {
    const href = buildHomeEventRadarHref({
      propertyId: 'property/1',
      view: 'now',
      family: 'weather',
      matchId: 'match-1',
      context: { launchSurface: 'notification' },
    });
    expect(href).toBe(
      '/dashboard/properties/property%2F1/tools/home-event-radar?view=now&family=weather&matchId=match-1&launchSurface=notification',
    );
  });
});
