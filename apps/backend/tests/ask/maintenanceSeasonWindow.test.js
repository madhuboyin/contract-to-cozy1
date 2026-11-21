const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { resolveMaintenanceTimeframe } = require('../../src/services/ask/handlers/maintenance.handler.ts');

// Review screenshot (2026-11-20): "tasks scheduled for next spring" is a date window the maintenance read can apply (March to May).
const at = (iso) => new Date(`${iso}T12:00:00Z`);
const frame = (message, now) => resolveMaintenanceTimeframe(message, at(now), 'UTC', null).timeframe;

test('"next spring" asked in November is March to May of the following year', () => {
  const tf = frame('show maintenance tasks scheduled for next spring', '2026-11-20');
  assert.equal(tf.label, 'next spring');
  assert.equal(tf.matches(at('2027-04-10')), true);
  assert.equal(tf.matches(at('2027-03-01')), true);
  assert.equal(tf.matches(at('2027-05-31')), true);
  assert.equal(tf.matches(at('2026-04-10')), false);
  assert.equal(tf.matches(at('2027-06-01')), false);
  assert.equal(tf.matches(at('2028-04-10')), false);
});

test('"next spring" asked in January is this year\'s spring; asked in April it is the following year', () => {
  assert.equal(frame('next spring', '2027-01-15').matches(at('2027-04-10')), true);
  assert.equal(frame('next spring', '2027-04-15').matches(at('2027-04-20')), false);
  assert.equal(frame('next spring', '2027-04-15').matches(at('2028-04-20')), true);
});

test('"this spring" is the one under way, and a question with no season has no window', () => {
  assert.equal(frame('what is due this spring', '2027-04-15').matches(at('2027-04-20')), true);
  assert.equal(frame('show my maintenance tasks', '2026-11-20'), null);
});
