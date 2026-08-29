const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// C2C Intelligence & Agentic Evolution — Phase 4A (§9.1 of the
// implementation plan; architecture §12.7). Pure-logic + registry-wiring
// coverage for the APPLIANCE_REPAIR_REPLACE decision family. Full
// DecisionThread create/resume against live Prisma is integration-only
// per the plan's §12 validation strategy.

const {
  applianceDecisionFamilyAdapter,
  mapApplianceVerdictToDecisionVerdict,
  APPLIANCE_VERDICT_TO_DECISION_VERDICT,
  APPLIANCE_REPAIR_REPLACE_ELIGIBLE_CATEGORIES,
} = require('../../src/services/decisionPlatform/applianceDecisionFamilyAdapter.ts');
const {
  getDecisionFamilyAdapter,
  validateDecisionFamilyAdapterRegistry,
} = require('../../src/services/decisionPlatform/decisionFamilyAdapterRegistry.ts');
const { DECISION_DEFINITIONS } = require('../../src/services/decisionPlatform/decisionDefinitionRegistry.ts');
const { DECISION_CONTEXT_CONTRACTS } = require('../../src/services/decisionPlatform/decisionContextContracts.ts');
const { ENVELOPE_MAPPINGS } = require('../../src/services/intelligenceEnvelope/envelopeMappingRegistry.ts');
const { evaluateQualifiedClaimVerdicts } = require('../../src/services/intelligenceEnvelope/qualifiedClaimCompatibilityRegistry.ts');

test('all four ReplaceRepairVerdict values map explicitly to a Decision Platform verdict code', () => {
  assert.deepEqual(APPLIANCE_VERDICT_TO_DECISION_VERDICT, {
    REPLACE_NOW: 'REPLACE',
    REPLACE_SOON: 'REPLACE',
    REPAIR_AND_MONITOR: 'REPAIR',
    REPAIR_ONLY: 'REPAIR',
  });
  assert.equal(mapApplianceVerdictToDecisionVerdict('REPLACE_NOW'), 'REPLACE');
  assert.equal(mapApplianceVerdictToDecisionVerdict('REPAIR_ONLY'), 'REPAIR');
});

test('the eligible-category boundary is every inventory category except HVAC', () => {
  assert.ok(APPLIANCE_REPAIR_REPLACE_ELIGIBLE_CATEGORIES.includes('APPLIANCE'));
  assert.ok(APPLIANCE_REPAIR_REPLACE_ELIGIBLE_CATEGORIES.includes('PLUMBING'));
  assert.ok(!APPLIANCE_REPAIR_REPLACE_ELIGIBLE_CATEGORIES.includes('HVAC'));
});

test('APPLIANCE_REPAIR_REPLACE is a fully registered Decision Platform family', () => {
  assert.deepEqual(validateDecisionFamilyAdapterRegistry(), []);
  assert.ok(DECISION_DEFINITIONS.APPLIANCE_REPAIR_REPLACE);
  assert.ok(DECISION_CONTEXT_CONTRACTS.APPLIANCE_REPAIR_REPLACE);
  const adapter = getDecisionFamilyAdapter('APPLIANCE_REPAIR_REPLACE');
  assert.equal(adapter, applianceDecisionFamilyAdapter);
  assert.equal(adapter.decisionDefinitionId, 'APPLIANCE_REPAIR_REPLACE');
  assert.equal(adapter.primaryEntityType, 'InventoryItem');
  assert.equal(typeof adapter.isEligiblePrimaryEntity, 'function');
  assert.equal(typeof adapter.selectThread, 'function');
  assert.equal(typeof adapter.createOrResumeThread, 'function');
});

test('the appliance family context contract snapshots rather than composes from Property Context', () => {
  assert.equal(DECISION_CONTEXT_CONTRACTS.APPLIANCE_REPAIR_REPLACE.composesFromPropertyContext, false);
  assert.deepEqual(DECISION_CONTEXT_CONTRACTS.APPLIANCE_REPAIR_REPLACE.requiredFactDefinitions, []);
});

test('a RecommendationSnapshot for APPLIANCE_REPAIR_REPLACE carries its own qualified-claim proposition type', () => {
  const mapping = ENVELOPE_MAPPINGS.find(
    (m) => m.producerModel === 'RecommendationSnapshot' && m.nativeSubtype === 'APPLIANCE_REPAIR_REPLACE',
  );
  assert.ok(mapping, 'expected an ENVELOPE_MAPPINGS entry for APPLIANCE_REPAIR_REPLACE');
  assert.equal(mapping.propositionType, 'APPLIANCE_REPAIR_REPLACE_VERDICT');
  assert.equal(mapping.domain, 'ASSET_LIFECYCLE');
  assert.notEqual(mapping.propositionType, 'HVAC_REPAIR_REPLACE_VERDICT');
});

test('REPAIR vs REPLACE is a domain-owned conflict for the appliance proposition, other pairs are unknown', () => {
  assert.equal(
    evaluateQualifiedClaimVerdicts({ propositionType: 'APPLIANCE_REPAIR_REPLACE_VERDICT', leftVerdict: 'REPAIR', rightVerdict: 'REPLACE' }),
    'CONFLICTED',
  );
  assert.equal(
    evaluateQualifiedClaimVerdicts({ propositionType: 'APPLIANCE_REPAIR_REPLACE_VERDICT', leftVerdict: 'REPAIR', rightVerdict: 'REPAIR' }),
    'COMPATIBLE',
  );
});
