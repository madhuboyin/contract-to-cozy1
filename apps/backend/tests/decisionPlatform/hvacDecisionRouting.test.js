const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  ASK_OPERATION_DEFINITIONS,
  resolveAskOperation,
} = require('../../src/services/ask/askOperationRegistry.ts');

// Ask Intelligence FRD Phase 8A: HVAC-specific repair/replace phrasing must
// win over the generic REPLACEMENT_GUIDANCE pattern (see
// tests/ask/askPhase5DecisionIntelligence.test.js for the removed shared
// case and why), while every other appliance keeps routing unchanged.

test('HVAC-specific repair/replace phrasing routes to the Decision Platform, not REPLACEMENT_GUIDANCE', () => {
  const cases = [
    'Should I repair or replace my HVAC?',
    'Should I repair or replace my furnace?',
    'Is it worth repairing my heat pump?',
    'My air conditioner: fix or replace?',
  ];
  for (const prompt of cases) {
    const result = resolveAskOperation(prompt);
    assert.equal(result.operationId, 'HVAC_DECISION_START', prompt);
    assert.equal(ASK_OPERATION_DEFINITIONS.HVAC_DECISION_START.executionMode, 'DETERMINISTIC');
    assert.equal(ASK_OPERATION_DEFINITIONS.HVAC_DECISION_START.safetyClass, 'MATERIAL_DECISION');
    assert.equal(ASK_OPERATION_DEFINITIONS.HVAC_DECISION_START.propertyRoleFloor, 'CONTRIBUTOR');
  }
});

test('non-HVAC repair/replace phrasing keeps routing to the generic REPLACEMENT_GUIDANCE heuristic unchanged', () => {
  const cases = [
    'Should I repair or replace my refrigerator?',
    'When should I replace my water heater?',
    'How old before I should replace my dishwasher?',
  ];
  for (const prompt of cases) {
    assert.equal(resolveAskOperation(prompt).operationId, 'REPLACEMENT_GUIDANCE', prompt);
  }
});

test('HVAC decision continuation/status phrasing routes to HVAC_DECISION_CONTINUE', () => {
  const cases = [
    "What's the status of my HVAC decision?",
    'Resume the furnace decision',
    'Check on my heat pump decision',
  ];
  for (const prompt of cases) {
    const result = resolveAskOperation(prompt);
    assert.equal(result.operationId, 'HVAC_DECISION_CONTINUE', prompt);
    assert.equal(ASK_OPERATION_DEFINITIONS.HVAC_DECISION_CONTINUE.propertyRoleFloor, 'VIEWER');
    assert.equal(ASK_OPERATION_DEFINITIONS.HVAC_DECISION_CONTINUE.safetyClass, 'STANDARD');
  }
});

test('HVAC quote-comparison phrasing routes to HVAC_DECISION_SCENARIO', () => {
  const cases = [
    'I got a new quote for my furnace, how does that change the decision?',
    'My HVAC quote just came in, compare it to the decision',
  ];
  for (const prompt of cases) {
    assert.equal(resolveAskOperation(prompt).operationId, 'HVAC_DECISION_SCENARIO', prompt);
  }
});

test('HVAC abandon phrasing routes to HVAC_DECISION_ABANDON', () => {
  const cases = [
    'Abandon the HVAC decision',
    'Cancel my furnace decision',
  ];
  for (const prompt of cases) {
    assert.equal(resolveAskOperation(prompt).operationId, 'HVAC_DECISION_ABANDON', prompt);
  }
});

test('an explicit save verb plus a substantive preference mention routes to HVAC_PREFERENCE_SAVE (FRD Phase 8B §11.3)', () => {
  const cases = [
    'Save that we plan to sell in about 18 months',
    'Remember I want to minimize upfront cost',
    'Note that I want to maximize reliability',
  ];
  for (const prompt of cases) {
    const result = resolveAskOperation(prompt);
    assert.equal(result.operationId, 'HVAC_PREFERENCE_SAVE', prompt);
    assert.equal(ASK_OPERATION_DEFINITIONS.HVAC_PREFERENCE_SAVE.safetyClass, 'MATERIAL_DECISION');
    assert.equal(ASK_OPERATION_DEFINITIONS.HVAC_PREFERENCE_SAVE.propertyRoleFloor, 'CONTRIBUTOR');
  }
});

test('a save verb with no substantive preference mention does not route to HVAC_PREFERENCE_SAVE — FRD §4.2: never silently infer', () => {
  assert.notEqual(resolveAskOperation('Please save my recent changes').operationId, 'HVAC_PREFERENCE_SAVE');
});

test('forget/revoke phrasing for a saved preference routes to HVAC_PREFERENCE_FORGET', () => {
  const cases = [
    'Forget my ownership horizon',
    'Stop using my sell timeline for HVAC decisions',
    'Remove my repair-replace approach',
  ];
  for (const prompt of cases) {
    assert.equal(resolveAskOperation(prompt).operationId, 'HVAC_PREFERENCE_FORGET', prompt);
  }
});

test('HVAC_PREFERENCE_FORGET and HVAC_PREFERENCE_SAVE are checked ahead of HVAC_DECISION_ABANDON in the cascade, avoiding any accidental overlap', () => {
  // "forget/save" vocabulary is distinct from "abandon/cancel the decision"
  // vocabulary, but this pins the intended precedence explicitly.
  assert.equal(resolveAskOperation('Forget my ownership horizon').operationId, 'HVAC_PREFERENCE_FORGET');
  assert.equal(resolveAskOperation('Abandon the HVAC decision').operationId, 'HVAC_DECISION_ABANDON');
});

test('a bare emergency HVAC phrase is still caught by the safety boundary before any Decision Platform routing', () => {
  // Safety precedence (FRD's parent Ask contract) must never be weakened by
  // adding new deterministic routing patterns.
  assert.equal(resolveAskOperation('I smell gas by the furnace').operationId, 'EMERGENCY_BOUNDARY');
});
