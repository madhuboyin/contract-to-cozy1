const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  evaluateHvacCalibrationCandidate,
  DEFAULT_HVAC_CALIBRATION_POLICY,
} = require('../../../src/services/decisionPlatform/hvacCalibrationEvaluator.service.ts');
const { DEFAULT_HVAC_ENGINE_WEIGHTS } = require('../../../src/services/decisionPlatform/hvacRepairReplaceEngine.service.ts');

// Score = 20 for age=5/GOOD/no-other-factors (baseline REPAIR target), score =
// 80 for age=20/GOOD (baseline REPLACE target) -- both exact under
// DEFAULT_HVAC_ENGINE_WEIGHTS, chosen so tests can reason about error
// numerically instead of guessing at the engine's output.
function context(overrides = {}) {
  return {
    propertyId: 'property-1',
    inventoryItemId: 'item-1',
    itemName: 'Furnace',
    ageYears: 5,
    condition: 'GOOD',
    repairSpendCentsLast30Months: 0,
    repairEventCountLast30Months: 0,
    warrantyActive: false,
    currentQuoteAmountCents: null,
    currentQuoteVendor: null,
    recordedReplacementCostCents: 900_000,
    ownershipHorizonMonths: null,
    repairReplaceApproach: null,
    ...overrides,
  };
}

function row(propertyId, overrides = {}) {
  return {
    propertyId,
    recommendationSnapshotId: `snapshot-${propertyId}`,
    context: context(overrides.context),
    observation: {
      id: `obs-${propertyId}`,
      verificationStatus: 'CORROBORATED',
      actionState: 'COMPLETED',
      costCents: 100_000, // ratio 0.111 -> REPAIR
      occurredAt: '2026-01-01T00:00:00.000Z',
      ...overrides.observation,
    },
  };
}

test('empty input is INSUFFICIENT_DATA and never touches the baseline weights', () => {
  const outcome = evaluateHvacCalibrationCandidate([]);
  assert.equal(outcome.status, 'INSUFFICIENT_DATA');
  assert.deepEqual(outcome.candidateWeights, DEFAULT_HVAC_ENGINE_WEIGHTS);
  assert.ok(outcome.insufficiencyReasons.some((reason) => reason.includes('DISTINCT_PROPERTY_COUNT_BELOW_PRIVACY_MINIMUM')));
});

test('a dataset below the privacy-minimum distinct-property threshold is INSUFFICIENT_DATA even with plenty of rows per property', () => {
  const rows = Array.from({ length: 5 }, (_, i) => row(`property-${i}`));
  // Default policy requires 30 distinct properties -- 5 is well short.
  const outcome = evaluateHvacCalibrationCandidate(rows, DEFAULT_HVAC_ENGINE_WEIGHTS, DEFAULT_HVAC_CALIBRATION_POLICY);
  assert.equal(outcome.status, 'INSUFFICIENT_DATA');
  assert.equal(outcome.distinctPropertyCount, 5);
  assert.deepEqual(outcome.candidateWeights, DEFAULT_HVAC_ENGINE_WEIGHTS);
});

test('outcomes that already agree with the baseline never produce a false READY_FOR_REVIEW', () => {
  // Every row's baseline predicted score (20, from age=5/GOOD) exactly
  // equals the REPAIR target score -- zero error, so there is nothing for a
  // calibration to improve, however small the threshold.
  const rows = Array.from({ length: 60 }, (_, i) => row(`property-${i}`));
  const policy = { ...DEFAULT_HVAC_CALIBRATION_POLICY, policyVersion: 'test-agree-v1', minDistinctProperties: 20, minObservationsPerSegment: 5, minHoldoutObservations: 5 };
  const outcome = evaluateHvacCalibrationCandidate(rows, DEFAULT_HVAC_ENGINE_WEIGHTS, policy);
  assert.equal(outcome.status, 'BELOW_IMPROVEMENT_THRESHOLD');
  assert.equal(outcome.holdoutMetrics.improvementPct, 0);
  assert.deepEqual(outcome.candidateWeights, DEFAULT_HVAC_ENGINE_WEIGHTS);
});

test('a systematic bias (baseline consistently under-scores an actually-replaced segment) is corrected and clears the holdout bar', () => {
  // age=1/POOR baseline score is 4.8 + 18 = 22.8, but every one of these was
  // actually replaced (target 80) -- a real, learnable, one-directional bias.
  const rows = Array.from({ length: 60 }, (_, i) => row(`property-${i}`, {
    context: { ageYears: 1, condition: 'POOR' },
    observation: { costCents: 700_000 }, // ratio 0.778 -> REPLACE
  }));
  const policy = {
    ...DEFAULT_HVAC_CALIBRATION_POLICY,
    policyVersion: 'test-bias-v1',
    minDistinctProperties: 20,
    minObservationsPerSegment: 5,
    minHoldoutObservations: 5,
    minHoldoutImprovementPct: 5,
  };
  const outcome = evaluateHvacCalibrationCandidate(rows, DEFAULT_HVAC_ENGINE_WEIGHTS, policy);

  assert.equal(outcome.status, 'READY_FOR_REVIEW');
  assert.ok(outcome.holdoutObservationCount >= policy.minHoldoutObservations, 'expected enough rows in holdout to be meaningful');
  assert.ok(outcome.holdoutMetrics.improvementPct >= policy.minHoldoutImprovementPct, `expected >= ${policy.minHoldoutImprovementPct}% improvement, got ${outcome.holdoutMetrics.improvementPct}`);
  assert.ok(outcome.holdoutMetrics.candidateWeightedError < outcome.holdoutMetrics.baselineWeightedError);
  assert.notDeepEqual(outcome.candidateWeights, DEFAULT_HVAC_ENGINE_WEIGHTS);
  // The one segment these rows all fall into must show real improvement, not regression.
  const poorSegment = outcome.segmentRegressionResults.CONDITION_POOR;
  assert.ok(poorSegment && !poorSegment.regressed);
});

test('holdout membership is deterministic -- identical input always splits and scores the same way', () => {
  const rows = Array.from({ length: 60 }, (_, i) => row(`property-${i}`, {
    context: { ageYears: 1, condition: 'POOR' },
    observation: { costCents: 700_000 },
  }));
  const policy = { ...DEFAULT_HVAC_CALIBRATION_POLICY, policyVersion: 'test-determinism-v1', minDistinctProperties: 20, minObservationsPerSegment: 5, minHoldoutObservations: 5 };
  const first = evaluateHvacCalibrationCandidate(rows, DEFAULT_HVAC_ENGINE_WEIGHTS, policy);
  const second = evaluateHvacCalibrationCandidate(rows, DEFAULT_HVAC_ENGINE_WEIGHTS, policy);
  assert.deepEqual(first, second);
});

test('source-reliability weighting actually shifts the weighted error, not just cosmetically', () => {
  // Group A: CORROBORATED, baseline score 20 vs REPLACE target 80 -> big
  // per-row error (3600). Group B: REPORTED, baseline score 80 vs REPLACE
  // target 80 -> zero error. holdoutPercent: 0 keeps every row in training
  // so the result is exactly the hand-computed weighted mean, no hash split
  // to account for.
  const groupA = Array.from({ length: 20 }, (_, i) => row(`property-a-${i}`, {
    context: { ageYears: 5, condition: 'GOOD' }, // score 20
    observation: { verificationStatus: 'CORROBORATED', costCents: 700_000 }, // REPLACE target 80
  }));
  const groupB = Array.from({ length: 20 }, (_, i) => row(`property-b-${i}`, {
    context: { ageYears: 20, condition: 'GOOD' }, // score 80
    observation: { verificationStatus: 'REPORTED', costCents: 700_000 }, // REPLACE target 80
  }));
  const rows = [...groupA, ...groupB];

  const weightedTowardA = evaluateHvacCalibrationCandidate(rows, DEFAULT_HVAC_ENGINE_WEIGHTS, {
    ...DEFAULT_HVAC_CALIBRATION_POLICY, policyVersion: 'test-reliability-a', holdoutPercent: 0, minDistinctProperties: 1, minHoldoutObservations: 0,
    sourceReliabilityWeights: { CORROBORATED: 1, REPORTED: 0.5 },
  });
  const weightedTowardB = evaluateHvacCalibrationCandidate(rows, DEFAULT_HVAC_ENGINE_WEIGHTS, {
    ...DEFAULT_HVAC_CALIBRATION_POLICY, policyVersion: 'test-reliability-b', holdoutPercent: 0, minDistinctProperties: 1, minHoldoutObservations: 0,
    sourceReliabilityWeights: { CORROBORATED: 0.5, REPORTED: 1 },
  });

  // wA=1,wB=0.5 -> 3600*1/1.5 = 2400. wA=0.5,wB=1 -> 3600*0.5/1.5 = 1200.
  assert.ok(Math.abs(weightedTowardA.trainingMetrics.baselineWeightedError - 2400) < 0.01, weightedTowardA.trainingMetrics.baselineWeightedError);
  assert.ok(Math.abs(weightedTowardB.trainingMetrics.baselineWeightedError - 1200) < 0.01, weightedTowardB.trainingMetrics.baselineWeightedError);
  assert.notEqual(weightedTowardA.trainingMetrics.baselineWeightedError, weightedTowardB.trainingMetrics.baselineWeightedError);
});

test('censored, outlier, and ambiguous rows are excluded and counted, never silently included', () => {
  const rows = [
    row('property-started', { observation: { actionState: 'STARTED', costCents: null } }), // censored
    row('property-ambiguous', { observation: { costCents: 360_000 } }), // ratio 0.4 -> UNKNOWN
    row('property-outlier', { observation: { costCents: 5_400_000 } }), // ratio 6 -> REPLACE but > 5x ceiling
    row('property-normal', {}), // ratio 0.111 -> REPAIR, included
  ];
  const outcome = evaluateHvacCalibrationCandidate(rows, DEFAULT_HVAC_ENGINE_WEIGHTS, DEFAULT_HVAC_CALIBRATION_POLICY);
  assert.deepEqual(outcome.exclusionSummary, {
    totalRows: 4,
    excludedUnknownActionKind: 1,
    excludedCostOutlier: 1,
    censoredNoAction: 1,
    includedRows: 1,
  });
});
