const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const {
  getDisabledComponentTypes,
  isScenarioComputeDisabled,
} = require('../../src/config/homeDigitalTwinOperationalControls.ts');

function withEnv(key, value, fn) {
  const prior = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return fn();
  } finally {
    if (prior === undefined) delete process.env[key];
    else process.env[key] = prior;
  }
}

// ── getDisabledComponentTypes ────────────────────────────────────────────────

test('getDisabledComponentTypes returns an empty list when the env var is unset', () => {
  withEnv('HOME_DIGITAL_TWIN_DISABLED_COMPONENT_TYPES', undefined, () => {
    assert.deepEqual(getDisabledComponentTypes(), []);
  });
});

test('getDisabledComponentTypes parses a comma-separated list', () => {
  withEnv('HOME_DIGITAL_TWIN_DISABLED_COMPONENT_TYPES', 'HVAC,ROOF', () => {
    assert.deepEqual(getDisabledComponentTypes(), ['HVAC', 'ROOF']);
  });
});

test('getDisabledComponentTypes trims whitespace and normalizes case', () => {
  withEnv('HOME_DIGITAL_TWIN_DISABLED_COMPONENT_TYPES', ' hvac , Roof ', () => {
    assert.deepEqual(getDisabledComponentTypes(), ['HVAC', 'ROOF']);
  });
});

test('getDisabledComponentTypes silently drops values that are not real component types', () => {
  withEnv('HOME_DIGITAL_TWIN_DISABLED_COMPONENT_TYPES', 'HVAC,NOT_A_TYPE,ROOF', () => {
    assert.deepEqual(getDisabledComponentTypes(), ['HVAC', 'ROOF']);
  });
});

// ── isScenarioComputeDisabled ────────────────────────────────────────────────

test('isScenarioComputeDisabled defaults to false', () => {
  withEnv('HOME_DIGITAL_TWIN_SCENARIO_COMPUTE_DISABLED', undefined, () => {
    assert.equal(isScenarioComputeDisabled(), false);
  });
});

test('isScenarioComputeDisabled is true only for the exact string "true"', () => {
  withEnv('HOME_DIGITAL_TWIN_SCENARIO_COMPUTE_DISABLED', 'true', () => {
    assert.equal(isScenarioComputeDisabled(), true);
  });
  withEnv('HOME_DIGITAL_TWIN_SCENARIO_COMPUTE_DISABLED', 'TRUE', () => {
    assert.equal(isScenarioComputeDisabled(), false);
  });
  withEnv('HOME_DIGITAL_TWIN_SCENARIO_COMPUTE_DISABLED', '1', () => {
    assert.equal(isScenarioComputeDisabled(), false);
  });
});
