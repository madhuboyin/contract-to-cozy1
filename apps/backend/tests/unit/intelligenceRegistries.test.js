const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  validateIntelligenceRegistries,
  HOME_ACTION_ADAPTER_OWNERSHIP,
  validateHomeActionAdapterOwnership,
  CAPABILITY_SKILL_GUIDANCE_BRIDGE,
  COMPLETION_EVIDENCE_POLICY,
  validateCompletionEvidencePolicy,
} = require('../../src/services/intelligence/index.ts');
const { HOME_ACTION_SOURCE_KINDS } = require('../../src/productFramework/homeAction.contract.ts');
const { RECOMMENDATION_SAFETY_TIERS } = require('../../src/productFramework/recommendationGovernance.contract.ts');

test('the real Home Intelligence registries pass validation cleanly', () => {
  assert.deepEqual(validateIntelligenceRegistries(), []);
});

test('every HomeAction source kind has exactly one declared adapter-ownership entry', () => {
  const kinds = HOME_ACTION_ADAPTER_OWNERSHIP.map((entry) => entry.sourceKind).sort();
  assert.deepEqual(kinds, [...HOME_ACTION_SOURCE_KINDS].sort());
});

test('every recommendation safety tier has exactly one declared completion evidence policy', () => {
  const tiers = COMPLETION_EVIDENCE_POLICY.map((entry) => entry.safetyTier).sort();
  assert.deepEqual(tiers, [...RECOMMENDATION_SAFETY_TIERS].sort());
});

test('the capability/skill/guidance bridge is non-empty and every entry declares an execution owner', () => {
  assert.ok(CAPABILITY_SKILL_GUIDANCE_BRIDGE.length > 0);
  for (const entry of CAPABILITY_SKILL_GUIDANCE_BRIDGE) {
    assert.ok(entry.executionOwner.trim().length > 0, `${entry.capabilityId} is missing an executionOwner`);
  }
});

test('validateHomeActionAdapterOwnership fails fast on a missing source kind', () => {
  const incomplete = HOME_ACTION_ADAPTER_OWNERSHIP.filter((entry) => entry.sourceKind !== 'PERSONALIZATION');
  const issues = validateHomeActionAdapterOwnership(incomplete);
  assert.ok(issues.some((issue) => issue.includes('PERSONALIZATION')));
});

test('validateHomeActionAdapterOwnership fails fast on inconsistent ownership flags', () => {
  const bad = [
    ...HOME_ACTION_ADAPTER_OWNERSHIP.filter((entry) => entry.sourceKind !== 'MAINTENANCE'),
    { ...HOME_ACTION_ADAPTER_OWNERSHIP.find((entry) => entry.sourceKind === 'MAINTENANCE'), workKeyEligible: true, workItemSourceType: null },
  ];
  const issues = validateHomeActionAdapterOwnership(bad);
  assert.ok(issues.some((issue) => issue.includes('workKeyEligible but declares no workItemSourceType')));
});

test('validateHomeActionAdapterOwnership fails fast on inconsistent outcome-adapter flags', () => {
  const bad = [
    ...HOME_ACTION_ADAPTER_OWNERSHIP.filter((entry) => entry.sourceKind !== 'MAINTENANCE'),
    { ...HOME_ACTION_ADAPTER_OWNERSHIP.find((entry) => entry.sourceKind === 'MAINTENANCE'), hasOutcomeAdapter: true, outcomeAdapterOwner: null },
  ];
  const issues = validateHomeActionAdapterOwnership(bad);
  assert.ok(issues.some((issue) => issue.includes('hasOutcomeAdapter but declares no outcomeAdapterOwner')));
});

test('validateCompletionEvidencePolicy fails fast on a missing safety tier', () => {
  const incomplete = COMPLETION_EVIDENCE_POLICY.filter((entry) => entry.safetyTier !== 'SAFETY_EMERGENCY');
  const issues = validateCompletionEvidencePolicy(incomplete);
  assert.ok(issues.some((issue) => issue.includes('SAFETY_EMERGENCY')));
});
