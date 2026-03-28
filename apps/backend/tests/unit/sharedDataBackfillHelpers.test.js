const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  mapCashBufferPostureFromAmount,
  normalizeAssumptionPayload,
  hashAssumptionPayload,
  classifyLegacyDependencyLevel,
  classifyReadinessStatus,
} = require('../../src/services/sharedDataBackfill.service.ts');

test('mapCashBufferPostureFromAmount maps thresholds deterministically', () => {
  assert.equal(mapCashBufferPostureFromAmount(undefined), undefined);
  assert.equal(mapCashBufferPostureFromAmount(-10), undefined);
  assert.equal(mapCashBufferPostureFromAmount(0), 'TIGHT');
  assert.equal(mapCashBufferPostureFromAmount(2999.99), 'TIGHT');
  assert.equal(mapCashBufferPostureFromAmount(3000), 'MODERATE');
  assert.equal(mapCashBufferPostureFromAmount(11999.99), 'MODERATE');
  assert.equal(mapCashBufferPostureFromAmount(12000), 'STRONG');
});

test('normalizeAssumptionPayload removes nullish values and normalizes nested objects', () => {
  const normalized = normalizeAssumptionPayload({
    riskTolerance: 'MEDIUM',
    deductible: null,
    nested: {
      z: undefined,
      a: 0.123456789,
      keep: true,
    },
    arr: [null, 10.987654321, { c: null, b: 'ok' }],
  });

  assert.deepEqual(normalized, {
    arr: [10.987654, { b: 'ok' }],
    nested: {
      a: 0.123457,
      keep: true,
    },
    riskTolerance: 'MEDIUM',
  });
});

test('hashAssumptionPayload is stable for semantically identical payloads', () => {
  const hashA = hashAssumptionPayload({
    b: 2,
    a: {
      d: null,
      c: 1,
    },
  });

  const hashB = hashAssumptionPayload({
    a: {
      c: 1,
      d: undefined,
    },
    b: 2,
  });

  assert.equal(hashA, hashB);
});

test('classifyLegacyDependencyLevel returns expected bands', () => {
  assert.equal(
    classifyLegacyDependencyLevel({
      preferenceCompletenessRatio: 0.2,
      assumptionLinkRatio: 0.8,
      signalCoverageRatio: 0.9,
    }),
    'HIGH',
  );

  assert.equal(
    classifyLegacyDependencyLevel({
      preferenceCompletenessRatio: 0.5,
      assumptionLinkRatio: 0.8,
      signalCoverageRatio: 0.9,
    }),
    'MEDIUM',
  );

  assert.equal(
    classifyLegacyDependencyLevel({
      preferenceCompletenessRatio: 0.9,
      assumptionLinkRatio: 0.9,
      signalCoverageRatio: 0.9,
    }),
    'LOW',
  );
});

test('classifyReadinessStatus reflects stale signal and coverage thresholds', () => {
  assert.equal(
    classifyReadinessStatus({
      preferenceCompletenessRatio: 0.8,
      assumptionLinkRatio: 0.8,
      signalCoverageRatio: 0.7,
      staleSignalCount: 0,
    }),
    'READY',
  );

  assert.equal(
    classifyReadinessStatus({
      preferenceCompletenessRatio: 0.2,
      assumptionLinkRatio: 0.2,
      signalCoverageRatio: 0.2,
      staleSignalCount: 3,
    }),
    'LEGACY_HEAVY',
  );

  assert.equal(
    classifyReadinessStatus({
      preferenceCompletenessRatio: 0.8,
      assumptionLinkRatio: 0.8,
      signalCoverageRatio: 0.7,
      staleSignalCount: 1,
    }),
    'PARTIAL',
  );
});
