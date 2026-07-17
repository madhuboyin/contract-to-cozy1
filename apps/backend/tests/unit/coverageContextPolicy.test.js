const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  claimCoverageDate,
  evaluateCoverageRecord,
  isCoverageActive,
  requiredCoverageKind,
} = require('../../src/services/coverage/contextPolicy');

const propertyId = 'property-1';
const now = new Date('2026-07-16T12:00:00.000Z');

test('coverage is applicable only inside its effective window for the same property', () => {
  const record = {
    id: 'policy-1',
    propertyId,
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    expiryDate: new Date('2027-01-01T00:00:00.000Z'),
  };

  assert.equal(evaluateCoverageRecord(record, propertyId, now).status, 'APPLICABLE');
  assert.equal(isCoverageActive(record, propertyId, now), true);
  assert.deepEqual(evaluateCoverageRecord(record, 'property-2', now).reasonCodes, [
    'COVERAGE_PROPERTY_MISMATCH',
  ]);
});

test('future and expired records are not active coverage', () => {
  const future = evaluateCoverageRecord(
    {
      id: 'future', propertyId,
      startDate: '2026-08-01T00:00:00.000Z', expiryDate: '2027-08-01T00:00:00.000Z',
    },
    propertyId,
    now,
  );
  const expired = evaluateCoverageRecord(
    {
      id: 'expired', propertyId,
      startDate: '2025-01-01T00:00:00.000Z', expiryDate: '2026-01-01T00:00:00.000Z',
    },
    propertyId,
    now,
  );

  assert.equal(future.lifecycle, 'FUTURE');
  assert.equal(future.status, 'NOT_APPLICABLE');
  assert.equal(expired.lifecycle, 'EXPIRED');
  assert.equal(expired.status, 'NOT_APPLICABLE');
});

test('invalid date windows remain unknown instead of being treated as uncovered certainty', () => {
  const decision = evaluateCoverageRecord(
    { id: 'invalid', propertyId, startDate: 'bad-date', expiryDate: 'also-bad' },
    propertyId,
    now,
  );
  assert.equal(decision.status, 'UNKNOWN');
  assert.equal(decision.lifecycle, 'INVALID');
});

test('claim source selects its required canonical coverage owner', () => {
  assert.equal(requiredCoverageKind('INSURANCE'), 'INSURANCE');
  assert.equal(requiredCoverageKind('HOME_WARRANTY'), 'WARRANTY');
  assert.equal(requiredCoverageKind('MANUFACTURER_WARRANTY'), 'WARRANTY');
  assert.equal(requiredCoverageKind('OUT_OF_POCKET'), null);
  assert.equal(claimCoverageDate({ incidentAt: '2026-07-01T00:00:00.000Z' }, now).toISOString(), '2026-07-01T00:00:00.000Z');
});
