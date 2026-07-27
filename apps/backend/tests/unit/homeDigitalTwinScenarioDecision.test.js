const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { projectContextForScenario } = require('../../src/services/homeDigitalTwinScenario.service.ts');

// ── projectContextForScenario ────────────────────────────────────────────────

test('REPLACE_COMPONENT on HVAC maps to HVAC_REPLACEMENT / HVAC category', () => {
  const result = projectContextForScenario('HVAC', 'REPLACE_COMPONENT');
  assert.deepEqual(result, { projectType: 'HVAC_REPLACEMENT', category: 'HVAC' });
});

test('UPGRADE_COMPONENT uses the same replacement-style ProjectType as REPLACE_COMPONENT', () => {
  const replace = projectContextForScenario('ROOF', 'REPLACE_COMPONENT');
  const upgrade = projectContextForScenario('ROOF', 'UPGRADE_COMPONENT');
  assert.equal(replace.projectType, 'ROOF_REPLACEMENT');
  assert.equal(upgrade.projectType, 'ROOF_REPLACEMENT');
});

test('REPAIR_COMPONENT on HVAC maps to the dedicated HVAC_REPAIR type', () => {
  const result = projectContextForScenario('HVAC', 'REPAIR_COMPONENT');
  assert.equal(result.projectType, 'HVAC_REPAIR');
});

test('REPAIR_COMPONENT on a non-HVAC component falls back to GENERAL_REPAIR, not a replacement type', () => {
  const result = projectContextForScenario('ROOF', 'REPAIR_COMPONENT');
  assert.equal(result.projectType, 'GENERAL_REPAIR');
  assert.equal(result.category, 'ROOF_EXTERIOR');
});

test('a component type with no dedicated ProjectType falls back to CUSTOM on replace/upgrade', () => {
  const result = projectContextForScenario('INSULATION', 'REPLACE_COMPONENT');
  assert.equal(result.projectType, 'CUSTOM');
  assert.equal(result.category, 'STRUCTURAL');
});

test('a null componentType (whole-property scenario) still returns a usable fallback', () => {
  const result = projectContextForScenario(null, 'ADD_FEATURE');
  assert.equal(result.projectType, 'CUSTOM');
  assert.equal(result.category, null);
});

test('WAIT_MONITOR is not a repair/replace scenario type, so it takes the replacement-style branch', () => {
  const result = projectContextForScenario('WATER_HEATER', 'WAIT_MONITOR');
  assert.equal(result.projectType, 'WATER_HEATER');
});
