const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { propertyBriefPreviewRow } = require('../../src/services/ask/handlers/propertyBrief.handler.ts');

test('property brief facts render as homeowner-readable facts rather than schema key dumps', () => {
  const row = propertyBriefPreviewRow(
    { key: 'city', label: 'city', value: 'plainsboro township', source: 'USER_REPORTED', verification: 'VERIFIED', asOf: '2026-07-27T00:00:00.000Z' },
    'fallback',
    { sourceLabel: 'Verified property fact evidence: USER_REPORTED', sourceAsOf: '2026-07-27T00:00:00.000Z', verification: 'VERIFIED' },
  );
  assert.equal(row.title, 'City: Plainsboro Township');
  assert.equal(row.description, null);
  assert.deepEqual(row.meta, ['Source: Self-reported', 'As of Jul 27, 2026', 'Verified']);
  assert.doesNotMatch(JSON.stringify(row), /label:|value:|USER_REPORTED/);
});

test('property brief unknowns say what is missing without exposing enum codes', () => {
  const row = propertyBriefPreviewRow(
    { key: 'bedrooms', label: 'bedrooms', state: 'UNKNOWN_OR_NOT_RECORDED', source: 'CANONICAL_PROPERTY_RECORD' },
    'fallback',
    { sourceLabel: 'Canonical property record gap', sourceAsOf: '2026-07-27T00:00:00.000Z', verification: 'UNKNOWN_OR_NOT_RECORDED' },
  );
  assert.equal(row.title, 'Bedrooms: Unknown or not recorded');
  assert.deepEqual(row.meta, ['Source: Home Record', 'As of Jul 27, 2026', 'Unknown or not recorded']);
});
