const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  resolveWeightsFromReleaseRow,
  assertCalibrationReleaseActivatable,
  CalibrationActivationError,
} = require('../../../src/services/decisionPlatform/calibrationActivation.service.ts');
const { DEFAULT_HVAC_ENGINE_WEIGHTS } = require('../../../src/services/decisionPlatform/hvacRepairReplaceEngine.service.ts');

function readiness(overrides = {}) {
  return {
    calibrationReleaseId: 'release-1',
    requiredRoles: ['PRODUCT', 'DOMAIN', 'PRIVACY', 'TRUST'],
    approvedRoles: ['PRODUCT', 'DOMAIN', 'PRIVACY', 'TRUST'],
    rejectedRoles: [],
    missingRoles: [],
    ready: true,
    ...overrides,
  };
}

test('resolveWeightsFromReleaseRow falls back to the hardcoded default when no release row exists', () => {
  assert.deepEqual(resolveWeightsFromReleaseRow(null), DEFAULT_HVAC_ENGINE_WEIGHTS);
});

test('resolveWeightsFromReleaseRow falls back to the default for every non-ACTIVE status', () => {
  for (const status of ['PROPOSED', 'READY_FOR_REVIEW', 'ROLLED_BACK', 'SUPERSEDED']) {
    const result = resolveWeightsFromReleaseRow({ status, candidateWeights: { ...DEFAULT_HVAC_ENGINE_WEIGHTS, ageWeight: 999 } });
    assert.deepEqual(result, DEFAULT_HVAC_ENGINE_WEIGHTS, `status ${status} must not use candidateWeights`);
  }
});

test('resolveWeightsFromReleaseRow fails safe to the default on malformed candidateWeights JSON, never throws', () => {
  const malformed = [null, undefined, {}, { ageWeight: 'not-a-number' }, { ageWeight: 60 }, 'a string', 42];
  for (const candidateWeights of malformed) {
    assert.doesNotThrow(() => resolveWeightsFromReleaseRow({ status: 'ACTIVE', candidateWeights }));
    assert.deepEqual(resolveWeightsFromReleaseRow({ status: 'ACTIVE', candidateWeights }), DEFAULT_HVAC_ENGINE_WEIGHTS);
  }
});

test('resolveWeightsFromReleaseRow uses the candidate weights only when ACTIVE and well-formed', () => {
  const candidateWeights = { ...DEFAULT_HVAC_ENGINE_WEIGHTS, ageWeight: 72, conditionWeight: 120 };
  const result = resolveWeightsFromReleaseRow({ status: 'ACTIVE', candidateWeights });
  assert.deepEqual(result, candidateWeights);
});

test('assertCalibrationReleaseActivatable throws when the release is not READY_FOR_REVIEW', () => {
  for (const status of ['PROPOSED', 'ACTIVE', 'ROLLED_BACK', 'SUPERSEDED']) {
    assert.throws(
      () => assertCalibrationReleaseActivatable({ status }, readiness()),
      (err) => err instanceof CalibrationActivationError && err.code === 'RELEASE_NOT_ACTIVATABLE',
    );
  }
});

test('assertCalibrationReleaseActivatable throws when governance readiness is incomplete, even if the release status is READY_FOR_REVIEW', () => {
  assert.throws(
    () => assertCalibrationReleaseActivatable({ status: 'READY_FOR_REVIEW' }, readiness({ ready: false, missingRoles: ['PRIVACY'], approvedRoles: ['PRODUCT', 'DOMAIN', 'TRUST'] })),
    (err) => err instanceof CalibrationActivationError && err.code === 'GOVERNANCE_NOT_READY',
  );
});

test('assertCalibrationReleaseActivatable throws when a required role rejected, even if every role has a decision on file', () => {
  assert.throws(
    () => assertCalibrationReleaseActivatable(
      { status: 'READY_FOR_REVIEW' },
      readiness({ ready: false, rejectedRoles: ['TRUST'], approvedRoles: ['PRODUCT', 'DOMAIN', 'PRIVACY'] }),
    ),
    (err) => err instanceof CalibrationActivationError && err.code === 'GOVERNANCE_NOT_READY',
  );
});

test('assertCalibrationReleaseActivatable does not throw when the release is READY_FOR_REVIEW and every required role approved', () => {
  assert.doesNotThrow(() => assertCalibrationReleaseActivatable({ status: 'READY_FOR_REVIEW' }, readiness()));
});
