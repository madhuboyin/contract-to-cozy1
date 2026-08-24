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
  INTELLIGENCE_CONSUMER_REGISTRY,
  validateIntelligenceConsumerRegistry,
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

// FRD §15 Phase 2 work item 4 — 5 of the 10 "initial high-value consumers"
// are registered for real this pass; the other 5 are deliberately deferred
// (see intelligenceConsumerRegistry.ts's header) rather than stubbed.
test('the intelligence consumer registry has exactly the 8 consumers registered so far (2 of the FRD\'s 10 remain deferred), each with a real recompute handler', () => {
  const keys = INTELLIGENCE_CONSUMER_REGISTRY.map((entry) => entry.consumerKey).sort();
  assert.deepEqual(keys, [
    'compound-radar',
    'coverage',
    'home-briefing',
    'maintenance-prediction',
    'personalization',
    'recommendation-snapshots',
    'risk-assessment',
    'sale-readiness',
  ]);
  for (const entry of INTELLIGENCE_CONSUMER_REGISTRY) {
    assert.equal(typeof entry.recompute, 'function', `${entry.consumerKey} must declare a recompute handler`);
  }
});

test('the one DYNAMIC consumer (recommendation-snapshots) declares a resolveTargets resolver; every STATIC consumer does not', () => {
  for (const entry of INTELLIGENCE_CONSUMER_REGISTRY) {
    if (entry.consumerKey === 'recommendation-snapshots') {
      assert.equal(entry.resolutionMode, 'DYNAMIC');
      assert.equal(typeof entry.resolveTargets, 'function');
    } else {
      assert.equal(entry.resolutionMode, 'STATIC');
      assert.equal(entry.resolveTargets, undefined);
    }
  }
});

test('validateIntelligenceConsumerRegistry fails fast on a duplicate consumerKey', () => {
  const dup = [...INTELLIGENCE_CONSUMER_REGISTRY, INTELLIGENCE_CONSUMER_REGISTRY[0]];
  const issues = validateIntelligenceConsumerRegistry(dup);
  assert.ok(issues.some((issue) => issue.includes('Duplicate intelligenceConsumerRegistry entry')));
});

test('validateIntelligenceConsumerRegistry fails fast on a STATIC consumer that declares resolveTargets', () => {
  const bad = INTELLIGENCE_CONSUMER_REGISTRY.map((entry) =>
    entry.consumerKey === 'risk-assessment' ? { ...entry, resolveTargets: async () => [] } : entry);
  const issues = validateIntelligenceConsumerRegistry(bad);
  assert.ok(issues.some((issue) => issue.includes('risk-assessment') && issue.includes('STATIC but declares a resolveTargets resolver')));
});

// Finding (Phase 2 follow-up review): a declared MARK_STALE/MARK_UNAVAILABLE
// failureBehavior with no onPermanentFailure handler is an unenforced claim
// — HI-REC-006's "existing output shall be marked stale" promise silently
// wouldn't happen. Machine-verifiable now rather than only prose-documented.
test('validateIntelligenceConsumerRegistry fails fast on MARK_STALE with no onPermanentFailure handler', () => {
  const bad = INTELLIGENCE_CONSUMER_REGISTRY.map((entry) =>
    entry.consumerKey === 'maintenance-prediction' ? { ...entry, failureBehavior: 'MARK_STALE', onPermanentFailure: undefined } : entry);
  const issues = validateIntelligenceConsumerRegistry(bad);
  assert.ok(issues.some((issue) => issue.includes('maintenance-prediction') && issue.includes('no onPermanentFailure handler')));
});

test('every real consumer\'s failureBehavior is honest: RETRY_ONLY unless a real onPermanentFailure handler is declared', () => {
  assert.deepEqual(validateIntelligenceConsumerRegistry(INTELLIGENCE_CONSUMER_REGISTRY), []);
  for (const entry of INTELLIGENCE_CONSUMER_REGISTRY) {
    if (entry.failureBehavior !== 'RETRY_ONLY') {
      assert.equal(typeof entry.onPermanentFailure, 'function', `${entry.consumerKey} declares ${entry.failureBehavior} and must have a real handler`);
    }
  }
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
