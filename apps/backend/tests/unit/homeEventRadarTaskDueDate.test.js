const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register/transpile-only');

const {
  deriveRadarTaskDueDate,
} = require('../../src/modules/homeEventRadar/domain/radarTaskDueDate');

const NOW = new Date('2026-07-26T12:00:00.000Z');

test('derives a high-priority task deadline before a future event begins', () => {
  const result = deriveRadarTaskDueDate({
    now: NOW,
    operation: 'create_task',
    priority: 'high',
    effectiveAt: '2026-07-29T12:00:00.000Z',
  });

  assert.equal(result.source, 'event_effective');
  assert.equal(result.dueAt.toISOString(), '2026-07-28T12:00:00.000Z');
});

test('derives bounded response windows for active events and caps them at expiration', () => {
  const high = deriveRadarTaskDueDate({
    now: NOW,
    operation: 'create_reminder',
    priority: 'high',
    effectiveAt: '2026-07-26T10:00:00.000Z',
    expiresAt: '2026-07-26T18:00:00.000Z',
  });
  const low = deriveRadarTaskDueDate({
    now: NOW,
    operation: 'create_reminder',
    priority: 'low',
    effectiveAt: '2026-07-26T10:00:00.000Z',
    expiresAt: '2026-07-26T18:00:00.000Z',
  });

  assert.equal(high.source, 'active_window');
  assert.equal(high.dueAt.toISOString(), '2026-07-26T13:00:00.000Z');
  assert.equal(low.source, 'event_expiration');
  assert.equal(low.dueAt.toISOString(), '2026-07-26T18:00:00.000Z');
});

test('accepts a safe homeowner date and rejects dates outside the bounded window', () => {
  const result = deriveRadarTaskDueDate({
    now: NOW,
    operation: 'create_reminder',
    priority: 'medium',
    requestedDueAt: '2026-08-01T12:00:00.000Z',
  });
  assert.equal(result.source, 'user_provided');

  assert.throws(
    () => deriveRadarTaskDueDate({
      now: NOW,
      operation: 'create_task',
      priority: 'medium',
      requestedDueAt: '2026-07-26T12:01:00.000Z',
    }),
    (error) => error.code === 'RADAR_DUE_DATE_INVALID',
  );
});

test('requires an explicit date only for reminders when event timing is unsafe', () => {
  assert.throws(
    () => deriveRadarTaskDueDate({
      now: NOW,
      operation: 'create_reminder',
      priority: 'medium',
      effectiveAt: '2025-01-01T00:00:00.000Z',
    }),
    (error) => error.code === 'RADAR_REMINDER_DUE_DATE_REQUIRED',
  );
  assert.equal(deriveRadarTaskDueDate({
    now: NOW,
    operation: 'create_task',
    priority: 'medium',
    effectiveAt: '2025-01-01T00:00:00.000Z',
  }), null);
  assert.throws(
    () => deriveRadarTaskDueDate({
      now: NOW,
      operation: 'create_reminder',
      priority: 'medium',
      effectiveAt: '2026-07-26T12:02:00.000Z',
    }),
    (error) => error.code === 'RADAR_REMINDER_DUE_DATE_REQUIRED',
  );
});
