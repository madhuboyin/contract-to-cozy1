import { formatAskDateOnly } from '../dateFormatting';

test('formats UTC-midnight calendar dates without shifting the day', () => {
  expect(formatAskDateOnly('2026-10-31T00:00:00.000Z', 'en-US')).toBe('10/31/2026');
});

test('returns null for absent or invalid dates', () => {
  expect(formatAskDateOnly(null, 'en-US')).toBeNull();
  expect(formatAskDateOnly('not-a-date', 'en-US')).toBeNull();
});
