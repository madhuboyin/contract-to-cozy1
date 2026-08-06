const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Slice 7's "stale-item review/reminders": a Property Brief is an
// immutable snapshot taken at asOf (assembleSections) with no republish
// mechanism (a separate, still-open item) — an old ACTIVE share may be
// showing a recipient facts that have since changed, with no signal to
// the homeowner. computeBriefStaleness() is the pure, testable core of
// that: 90 days is a documented threshold, not a fabricated urgency score.

const { computeBriefStaleness } = require('../../src/propertyBrief/propertyBrief.service.ts');

test('a brief younger than 90 days is never stale, even with an active share', () => {
  const now = new Date('2026-08-05T00:00:00.000Z');
  const asOf = new Date('2026-07-01T00:00:00.000Z'); // 35 days
  const result = computeBriefStaleness(asOf, true, now);
  assert.equal(result.ageDays, 35);
  assert.equal(result.isStale, false);
});

test('a brief 90+ days old with an active share is stale', () => {
  const now = new Date('2026-08-05T00:00:00.000Z');
  const asOf = new Date('2026-05-01T00:00:00.000Z'); // 96 days
  const result = computeBriefStaleness(asOf, true, now);
  assert.equal(result.ageDays, 96);
  assert.equal(result.isStale, true);
});

test('a brief 90+ days old with NO active share is never flagged stale — nobody can currently view it', () => {
  const now = new Date('2026-08-05T00:00:00.000Z');
  const asOf = new Date('2026-01-01T00:00:00.000Z'); // ~7 months
  const result = computeBriefStaleness(asOf, false, now);
  assert.equal(result.isStale, false);
});

test('exactly 90 days old counts as stale (inclusive threshold)', () => {
  const now = new Date('2026-08-05T00:00:00.000Z');
  const asOf = new Date(now.getTime() - 90 * 86_400_000);
  const result = computeBriefStaleness(asOf, true, now);
  assert.equal(result.ageDays, 90);
  assert.equal(result.isStale, true);
});
