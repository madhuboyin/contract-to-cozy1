import { askHistoryGroupLabel } from '../historyGrouping';

test('today follows the homeowner timezone rather than the UTC date', () => {
  const options = { now: new Date('2026-09-19T02:30:00.000Z'), locale: 'en-US', timeZone: 'America/Los_Angeles' };
  expect(askHistoryGroupLabel('2026-09-18T10:00:00.000Z', options)).toBe('today');
});

test('yesterday follows calendar days across daylight-saving changes', () => {
  const options = { now: new Date('2026-03-09T04:30:00.000Z'), locale: 'en-US', timeZone: 'America/New_York' };
  expect(askHistoryGroupLabel('2026-03-08T06:30:00.000Z', options)).toBe('yesterday');
});

test('older period labels use the homeowner locale and zoned month', () => {
  const options = { now: new Date('2026-09-19T12:00:00.000Z'), locale: 'fr-FR', timeZone: 'America/Los_Angeles' };
  expect(askHistoryGroupLabel('2026-09-10T12:00:00.000Z', options)).toBe('septembre 2026');
  expect(askHistoryGroupLabel('2026-09-16T12:00:00.000Z', options)).not.toContain('Previous 7 days');
});
