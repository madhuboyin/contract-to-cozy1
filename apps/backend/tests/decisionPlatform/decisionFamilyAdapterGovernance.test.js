const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home Intelligence Functional Completeness FRD Phase 3A (HI-DEC-002, work
// items 1/6) — governance test for the decision-family adapter registry,
// mirroring the pattern in decisionPlatformGovernance.test.js.

const {
  validateDecisionFamilyAdapterRegistry,
  getDecisionFamilyAdapter,
} = require('../../src/services/decisionPlatform/decisionFamilyAdapterRegistry.ts');
const { DECISION_DEFINITIONS } = require('../../src/services/decisionPlatform/decisionDefinitionRegistry.ts');
const { hvacDecisionFamilyAdapter } = require('../../src/services/decisionPlatform/decisionThreadService.ts');

test('every registered DecisionDefinition has a matching decision-family adapter', () => {
  assert.deepEqual(validateDecisionFamilyAdapterRegistry(), []);
  // Phase 3 review finding 4 delivery step 6 added five snapshot adapters
  // (domainSnapshotAdapters.ts) alongside the original HVAC engine adapter.
  assert.deepEqual(new Set(Object.keys(DECISION_DEFINITIONS)), new Set([
    'HVAC_REPAIR_REPLACE',
    'REFINANCE_OPPORTUNITY',
    'HOME_CAPITAL_TIMELINE_WINDOW',
    'OWNERSHIP_COST_CHANGE',
    'SAVINGS_BENEFIT_MATCH',
    'COVERAGE_QUESTION',
    'SELL_HOLD_RENT',
  ]));
});

test('getDecisionFamilyAdapter resolves the HVAC adapter and returns null for an unregistered family', () => {
  const adapter = getDecisionFamilyAdapter('HVAC_REPAIR_REPLACE');
  assert.equal(adapter, hvacDecisionFamilyAdapter);
  assert.equal(adapter.decisionDefinitionId, 'HVAC_REPAIR_REPLACE');
  assert.equal(adapter.primaryEntityType, 'InventoryItem');
  assert.equal(getDecisionFamilyAdapter('NOT_A_REAL_FAMILY'), null);
});

test('the HVAC adapter exposes every method the DecisionFamilyAdapter contract requires', () => {
  assert.equal(typeof hvacDecisionFamilyAdapter.isEligiblePrimaryEntity, 'function');
  assert.equal(typeof hvacDecisionFamilyAdapter.selectThread, 'function');
  assert.equal(typeof hvacDecisionFamilyAdapter.createOrResumeThread, 'function');
});
