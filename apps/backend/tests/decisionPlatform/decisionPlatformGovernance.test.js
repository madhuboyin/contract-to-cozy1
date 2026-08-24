const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  DECISION_PREFERENCE_DEFINITIONS,
  validateDecisionPreferenceRegistry,
} = require('../../src/services/decisionPlatform/decisionPreferenceRegistry.ts');
const {
  DECISION_CONTEXT_CONTRACTS,
  validateDecisionContextContracts,
} = require('../../src/services/decisionPlatform/decisionContextContracts.ts');
const {
  DECISION_DEFINITIONS,
  validateDecisionDefinitionRegistry,
} = require('../../src/services/decisionPlatform/decisionDefinitionRegistry.ts');
const {
  validateDecisionThreadTransitionContract,
} = require('../../src/services/decisionPlatform/decisionThreadTransitions.ts');

test('every DecisionPreferenceDefinition is complete and internally consistent (FRD §11.2)', () => {
  assert.deepEqual(validateDecisionPreferenceRegistry(), []);
  assert.deepEqual(Object.keys(DECISION_PREFERENCE_DEFINITIONS).sort(), [
    'DECISION_DETAIL_LEVEL',
    'OWNERSHIP_HORIZON',
    'REPAIR_REPLACE_APPROACH',
  ]);
  // FRD §11.2: presentation-only preferences must never be declared
  // material to a ranking or recommendation.
  assert.equal(DECISION_PREFERENCE_DEFINITIONS.DECISION_DETAIL_LEVEL.materialForRanking, false);
  assert.equal(DECISION_PREFERENCE_DEFINITIONS.OWNERSHIP_HORIZON.materialForRanking, true);
  assert.equal(DECISION_PREFERENCE_DEFINITIONS.REPAIR_REPLACE_APPROACH.materialForRanking, true);
});

const SNAPSHOT_CONTEXT_CONTRACT_IDS = [
  'REFINANCE_OPPORTUNITY',
  'HOME_CAPITAL_TIMELINE_WINDOW',
  'OWNERSHIP_COST_CHANGE',
  'SAVINGS_BENEFIT_MATCH',
  'COVERAGE_QUESTION',
];

test('every DecisionContextContract is complete and only references known preference keys (FRD §12)', () => {
  assert.deepEqual(validateDecisionContextContracts(), []);
  assert.deepEqual(new Set(Object.keys(DECISION_CONTEXT_CONTRACTS)), new Set(['HVAC_REPAIR_REPLACE', ...SNAPSHOT_CONTEXT_CONTRACT_IDS]));
  const hvac = DECISION_CONTEXT_CONTRACTS.HVAC_REPAIR_REPLACE;
  assert.equal(hvac.composesFromPropertyContext, true);
  assert.ok(hvac.requiredFactDefinitions.length > 0);
  // FRD §12.3: insurance, rebates, financing, energy savings, and resale
  // effects must not be added until their own enhancer contracts and
  // professional boundaries are approved.
  for (const enhancer of hvac.optionalEnhancerDefinitions) {
    assert.doesNotMatch(enhancer, /INSURANCE|REBATE|FINANC|ENERGY_SAVINGS|RESALE/);
  }
  // Phase 3 review finding 4 delivery step 6: these five snapshot an
  // already-authoritative domain evaluation instead of composing one from
  // Property Context facts, so they declare no required facts.
  for (const id of SNAPSHOT_CONTEXT_CONTRACT_IDS) {
    assert.equal(DECISION_CONTEXT_CONTRACTS[id].composesFromPropertyContext, false);
    assert.deepEqual(DECISION_CONTEXT_CONTRACTS[id].requiredFactDefinitions, []);
  }
});

test('every DecisionDefinition resolves to a registered context contract and known preferences (FRD §10.5)', () => {
  assert.deepEqual(validateDecisionDefinitionRegistry(), []);
  assert.deepEqual(new Set(Object.keys(DECISION_DEFINITIONS)), new Set(['HVAC_REPAIR_REPLACE', ...SNAPSHOT_CONTEXT_CONTRACT_IDS]));
});

test('the DecisionThread lifecycle/context-health transition contract is internally consistent (FRD §10.2/§10.3)', () => {
  assert.deepEqual(validateDecisionThreadTransitionContract(), []);
});
