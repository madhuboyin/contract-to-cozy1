import { ASK_DESTINATIONS, askDestinationForPath, buildAskDestinationHref } from '../destinations';

describe('Ask Cozy destination routes', () => {
  it('defines the five stable destinations in primary-navigation order', () => {
    expect(ASK_DESTINATIONS.map(({ id, href }) => [id, href])).toEqual([
      ['home', '/dashboard/ask'],
      ['work', '/dashboard/ask/work'],
      ['record', '/dashboard/ask/record'],
      ['saved', '/dashboard/ask/saved'],
      ['history', '/dashboard/ask/history'],
    ]);
  });

  it.each([
    ['/dashboard/ask', 'home'],
    ['/dashboard/ask/work', 'work'],
    ['/dashboard/ask/record', 'record'],
    ['/dashboard/ask/saved', 'saved'],
    ['/dashboard/ask/history', 'history'],
    ['/dashboard/ask/history/', 'history'],
  ] as const)('maps %s to %s', (pathname, destination) => {
    expect(askDestinationForPath(pathname)).toBe(destination);
  });

  it('preserves selected-home and conversation continuity across destinations', () => {
    const current = new URLSearchParams({
      propertyId: 'property-1',
      sessionId: 'session-1',
      executionId: 'execution-1',
      question: 'must-not-replay',
    });
    expect(buildAskDestinationHref(ASK_DESTINATIONS[1], current)).toBe(
      '/dashboard/ask/work?propertyId=property-1&sessionId=session-1&executionId=execution-1',
    );
  });
});
