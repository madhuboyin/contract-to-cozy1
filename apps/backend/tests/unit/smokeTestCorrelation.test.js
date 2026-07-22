// apps/backend/tests/unit/smokeTestCorrelation.test.js
//
// W6 item 3: correlation IDs for records created by a smoke-test run, so
// they can be found and removed by exact ID afterward.

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { generateSmokeCorrelationId, isSmokeCorrelationId } = require('../../src/lib/smokeTestCorrelation.ts');

test('generateSmokeCorrelationId embeds the job key and is prefixed for isSmokeCorrelationId to recognize', () => {
  const id = generateSmokeCorrelationId('mortgage-rate-ingest');
  assert.match(id, /^smoke:mortgage-rate-ingest:\d+:[0-9a-f]{8}$/);
  assert.equal(isSmokeCorrelationId(id), true);
});

test('two calls for the same job key produce different IDs', () => {
  const a = generateSmokeCorrelationId('permit-inspection-reminders');
  const b = generateSmokeCorrelationId('permit-inspection-reminders');
  assert.notEqual(a, b);
});

test('isSmokeCorrelationId rejects non-smoke values', () => {
  assert.equal(isSmokeCorrelationId('not-a-smoke-id'), false);
  assert.equal(isSmokeCorrelationId(undefined), false);
  assert.equal(isSmokeCorrelationId(null), false);
  assert.equal(isSmokeCorrelationId(12345), false);
  assert.equal(isSmokeCorrelationId(''), false);
});
