const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  hasAssumptionOverrides,
  extractAssumptionOverrides,
} = require('../../src/services/assumptionSet.service.ts');
const {
  hasPreferenceInput,
} = require('../../src/services/preferenceProfile.service.ts');
const {
  computeMaintenanceAdherenceScore,
} = require('../../src/services/signal.service.ts');

test('hasAssumptionOverrides returns false for undefined or empty input', () => {
  assert.equal(hasAssumptionOverrides(undefined), false);
  assert.equal(hasAssumptionOverrides({}), false);
});

test('hasAssumptionOverrides returns true when at least one override is present', () => {
  assert.equal(hasAssumptionOverrides({ riskTolerance: 'LOW' }), true);
});

test('extractAssumptionOverrides supports nested overrides payload shape', () => {
  const extracted = extractAssumptionOverrides({
    version: 1,
    overrides: {
      annualPremium: 2400,
      riskTolerance: 'MEDIUM',
    },
  });

  assert.deepEqual(extracted, {
    annualPremium: 2400,
    riskTolerance: 'MEDIUM',
  });
});

test('hasPreferenceInput detects profile updates correctly', () => {
  assert.equal(hasPreferenceInput(undefined), false);
  assert.equal(hasPreferenceInput({}), false);
  assert.equal(hasPreferenceInput({ riskTolerance: 'LOW' }), true);
  assert.equal(hasPreferenceInput({ confidence: null }), true);
});

test('computeMaintenanceAdherenceScore stays within [0,1]', () => {
  const score = computeMaintenanceAdherenceScore({
    totalTasks: 10,
    completedTasks: 6,
    activeSnoozes: 1,
    recentCompletions: 2,
    overdueTasks: 1,
  });

  assert.ok(score >= 0 && score <= 1, `Expected bounded score, got ${score}`);
});

test('computeMaintenanceAdherenceScore rewards better completion posture', () => {
  const low = computeMaintenanceAdherenceScore({
    totalTasks: 10,
    completedTasks: 2,
    activeSnoozes: 3,
    recentCompletions: 0,
    overdueTasks: 4,
  });

  const high = computeMaintenanceAdherenceScore({
    totalTasks: 10,
    completedTasks: 8,
    activeSnoozes: 0,
    recentCompletions: 3,
    overdueTasks: 0,
  });

  assert.ok(high > low, `Expected high-adherence score (${high}) > low-adherence score (${low})`);
});
