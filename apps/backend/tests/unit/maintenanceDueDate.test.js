const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveSeasonalTaskDueDate } = require('../../src/utils/maintenanceDueDate.ts');

const NOW = new Date('2026-07-15T12:00:00.000Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

test('keeps a future recommended date', () => {
  const future = new Date('2026-08-01T00:00:00.000Z');
  assert.equal(resolveSeasonalTaskDueDate(future, NOW).getTime(), future.getTime());
});

test('replaces a past recommended date with now + 7 days', () => {
  const past = new Date('2026-06-28T00:00:00.000Z');
  const resolved = resolveSeasonalTaskDueDate(past, NOW);
  assert.equal(resolved.getTime(), NOW.getTime() + 7 * MS_PER_DAY);
});

test('replaces a recommended date equal to now with now + 7 days', () => {
  const resolved = resolveSeasonalTaskDueDate(new Date(NOW), NOW);
  assert.equal(resolved.getTime(), NOW.getTime() + 7 * MS_PER_DAY);
});

test('handles null and undefined recommended dates', () => {
  for (const value of [null, undefined]) {
    const resolved = resolveSeasonalTaskDueDate(value, NOW);
    assert.equal(resolved.getTime(), NOW.getTime() + 7 * MS_PER_DAY);
  }
});
