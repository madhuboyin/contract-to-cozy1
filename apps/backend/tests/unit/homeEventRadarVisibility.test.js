const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  RADAR_RECENTLY_ENDED_HOURS,
  radarMatchVisibleFrom,
  radarMatchVisibleUntil,
  radarTimingGroup,
} = require('../../src/modules/homeEventRadar/domain/radarVisibility');

const now = new Date('2026-07-26T14:00:00.000Z');

test('active and upcoming matches retain their provider visibility window', () => {
  const endAt = new Date('2026-07-26T18:00:00.000Z');
  assert.equal(radarMatchVisibleUntil({
    status: 'active',
    startAt: new Date('2026-07-26T12:00:00.000Z'),
    endAt,
  }), endAt);
  assert.equal(radarTimingGroup({
    status: 'active',
    startAt: new Date('2026-07-26T16:00:00.000Z'),
  }, now), 'upcoming');
  assert.equal(radarMatchVisibleFrom({
    status: 'active',
    startAt: new Date('2026-07-26T16:00:00.000Z'),
    observedAt: now,
  }), now);
});

test('terminal matches remain visible in Recently Ended for 72 hours', () => {
  const resolvedAt = new Date('2026-07-26T13:00:00.000Z');
  const event = {
    status: 'resolved',
    startAt: new Date('2026-07-26T10:00:00.000Z'),
    endAt: new Date('2026-07-26T12:00:00.000Z'),
    resolvedAt,
  };
  assert.equal(RADAR_RECENTLY_ENDED_HOURS, 72);
  assert.equal(
    radarMatchVisibleUntil(event).toISOString(),
    '2026-07-29T13:00:00.000Z',
  );
  assert.equal(radarTimingGroup(event, now), 'recently_ended');
});
