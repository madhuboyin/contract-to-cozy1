const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  getSeasonForDate,
  resolveCurrentSeasonWindow,
  resolveUpcomingSeasonWindow,
} = require('../../src/services/seasonal/seasonWindow.ts');

test('mid-December pre-season window targets THIS year\'s winter, not next year\'s', () => {
  // Regression: the generation job used to create the winter checklist with
  // year = currentYear + 1, producing a phantom checklist dated a full year
  // ahead that surfaced on the dashboard all year (winter card in July).
  const today = new Date(2025, 11, 10); // Dec 10, 2025 (FALL)
  const upcoming = resolveUpcomingSeasonWindow(today);

  assert.equal(upcoming.season, 'WINTER');
  assert.equal(upcoming.year, 2025);
  assert.deepEqual(upcoming.startDate, new Date(2025, 11, 21));
  assert.deepEqual(upcoming.endDate, new Date(2026, 2, 19));
  assert.equal(upcoming.daysUntilStart, 11);
});

test('a winter in progress during January belongs to the previous year', () => {
  const today = new Date(2026, 0, 15); // Jan 15, 2026
  const current = resolveCurrentSeasonWindow(today);

  assert.equal(current.season, 'WINTER');
  assert.equal(current.year, 2025);
  assert.deepEqual(current.startDate, new Date(2025, 11, 21));
  assert.deepEqual(current.endDate, new Date(2026, 2, 19));
});

test('a winter in progress during late December belongs to the current year', () => {
  const today = new Date(2025, 11, 26); // Dec 26, 2025
  const current = resolveCurrentSeasonWindow(today);

  assert.equal(current.season, 'WINTER');
  assert.equal(current.year, 2025);
});

test('upcoming season from late December is next year\'s spring', () => {
  const today = new Date(2025, 11, 26); // Dec 26, 2025 (WINTER)
  const upcoming = resolveUpcomingSeasonWindow(today);

  assert.equal(upcoming.season, 'SPRING');
  assert.equal(upcoming.year, 2026);
  assert.deepEqual(upcoming.startDate, new Date(2026, 2, 20));
  assert.ok(upcoming.daysUntilStart > 0);
});

test('mid-July resolves to summer with fall upcoming, both in the same year', () => {
  const today = new Date(2026, 6, 16); // Jul 16, 2026
  const current = resolveCurrentSeasonWindow(today);
  const upcoming = resolveUpcomingSeasonWindow(today);

  assert.equal(current.season, 'SUMMER');
  assert.equal(current.year, 2026);
  assert.deepEqual(current.endDate, new Date(2026, 8, 22));

  assert.equal(upcoming.season, 'FALL');
  assert.equal(upcoming.year, 2026);
  assert.deepEqual(upcoming.startDate, new Date(2026, 8, 23));
});

test('season boundaries match the start/end dates', () => {
  assert.equal(getSeasonForDate(new Date(2026, 2, 19)), 'WINTER');
  assert.equal(getSeasonForDate(new Date(2026, 2, 20)), 'SPRING');
  assert.equal(getSeasonForDate(new Date(2026, 5, 20)), 'SPRING');
  assert.equal(getSeasonForDate(new Date(2026, 5, 21)), 'SUMMER');
  assert.equal(getSeasonForDate(new Date(2026, 8, 22)), 'SUMMER');
  assert.equal(getSeasonForDate(new Date(2026, 8, 23)), 'FALL');
  assert.equal(getSeasonForDate(new Date(2026, 11, 20)), 'FALL');
  assert.equal(getSeasonForDate(new Date(2026, 11, 21)), 'WINTER');
});
