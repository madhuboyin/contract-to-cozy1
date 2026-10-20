import { ASK_DESTINATIONS } from '../destinations';

describe('Ask Cozy destinations', () => {
  it('names the five views Ask shows, none of which is a route of its own', () => {
    expect(ASK_DESTINATIONS.map(({ id }) => id)).toEqual(['home', 'work', 'record', 'saved', 'history']);
    expect(ASK_DESTINATIONS.every((destination) => !('href' in destination))).toBe(true);
  });
});
