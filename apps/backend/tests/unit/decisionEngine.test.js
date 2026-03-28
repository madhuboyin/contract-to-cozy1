const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  computeDecisionScore,
  runDecisionEngine,
} = require('../../src/services/decisionEngine.service.ts');

function baseCandidate(overrides = {}) {
  return {
    id: 'candidate-1',
    source: 'ACTION_CENTER',
    title: 'Address risk exposure',
    detail: 'Reduce immediate risk pressure.',
    targetTool: 'risk-premium-optimizer',
    targetPath: '/dashboard/properties/p-1/tools/risk-premium-optimizer',
    dedupeKey: 'risk-1',
    conflictScope: 'scope-1',
    intent: 'REDUCE_EXPOSURE',
    urgency: 80,
    financialImpact: 70,
    riskReduction: 85,
    userEffort: 35,
    confidence: 0.8,
    freshness: 0.9,
    reversibility: 62,
    whyNow: ['Risk spike elevated this week.'],
    signalDrivers: ['RISK_SPIKE'],
    postureInputs: ['riskTolerance:MEDIUM'],
    assumptionInputs: ['assumptionSetId:set-1'],
    suppressionHints: {
      completedRecently: false,
      dismissedOrSnoozed: false,
      staleInput: false,
      criticalSafety: false,
    },
    ...overrides,
  };
}

test('computeDecisionScore returns bounded deterministic score', () => {
  const score = computeDecisionScore(baseCandidate());
  assert.ok(score.finalScore >= 0 && score.finalScore <= 100);
  assert.ok(score.urgency > 0);
  assert.ok(score.riskReduction > 0);
  assert.ok(score.effortPenalty > 0);
});

test('runDecisionEngine keeps stable ordering for same input', () => {
  const candidates = [
    baseCandidate({ id: 'a', dedupeKey: 'a', title: 'A', urgency: 72 }),
    baseCandidate({ id: 'b', dedupeKey: 'b', title: 'B', urgency: 65 }),
    baseCandidate({ id: 'c', dedupeKey: 'c', title: 'C', urgency: 88 }),
  ];

  const first = runDecisionEngine({ candidates, recommendationLimit: 3 });
  const second = runDecisionEngine({ candidates, recommendationLimit: 3 });

  assert.deepEqual(
    first.recommendations.map((entry) => entry.id),
    second.recommendations.map((entry) => entry.id)
  );
});

test('runDecisionEngine suppresses low-confidence weak candidates', () => {
  const weak = baseCandidate({
    id: 'weak',
    dedupeKey: 'weak',
    title: 'Weak suggestion',
    urgency: 45,
    riskReduction: 40,
    confidence: 0.2,
  });
  const strong = baseCandidate({
    id: 'strong',
    dedupeKey: 'strong',
    title: 'Strong suggestion',
    urgency: 88,
    confidence: 0.83,
  });

  const result = runDecisionEngine({
    candidates: [weak, strong],
    recommendationLimit: 5,
  });

  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].id, 'strong');
  assert.ok(result.suppressed.some((entry) => entry.candidateId === 'weak' && entry.reason === 'LOW_CONFIDENCE'));
});

test('runDecisionEngine merges duplicates and records suppression', () => {
  const higher = baseCandidate({
    id: 'dupe-high',
    dedupeKey: 'duplicate-key',
    title: 'Higher duplicate',
    urgency: 90,
  });
  const lower = baseCandidate({
    id: 'dupe-low',
    dedupeKey: 'duplicate-key',
    title: 'Lower duplicate',
    urgency: 62,
  });

  const result = runDecisionEngine({
    candidates: [lower, higher],
    recommendationLimit: 5,
  });

  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].id, 'dupe-high');
  assert.ok(result.suppressed.some((entry) => entry.reason === 'DUPLICATE_RECOMMENDATION'));
  assert.equal(result.diagnostics.duplicateMergeCount, 1);
});

test('runDecisionEngine resolves conflicts by strongest recommendation', () => {
  const replaceNow = baseCandidate({
    id: 'replace',
    dedupeKey: 'replace',
    intent: 'EXECUTE_MAINTENANCE',
    conflictScope: 'hvac',
    title: 'Replace now',
    urgency: 86,
  });

  const defer = baseCandidate({
    id: 'defer',
    dedupeKey: 'defer',
    intent: 'DEFER_MONITOR',
    conflictScope: 'hvac',
    title: 'Monitor and defer',
    urgency: 61,
  });

  const result = runDecisionEngine({
    candidates: [replaceNow, defer],
    recommendationLimit: 5,
  });

  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].id, 'replace');
  assert.ok(result.suppressed.some((entry) => entry.reason === 'CONFLICTING_RECOMMENDATION'));
  assert.equal(result.diagnostics.conflictResolutionCount, 1);
});

test('runDecisionEngine includes trace context for surfaced recommendation', () => {
  const result = runDecisionEngine({
    candidates: [baseCandidate()],
    recommendationLimit: 1,
  });
  const recommendation = result.recommendations[0];

  assert.ok(Array.isArray(recommendation.trace.whyNow));
  assert.ok(Array.isArray(recommendation.trace.contributedSignals));
  assert.ok(Array.isArray(recommendation.trace.postureInputs));
  assert.ok(Array.isArray(recommendation.trace.assumptionInputs));
  assert.ok(Array.isArray(recommendation.trace.suppressionsConsidered));
});

test('runDecisionEngine diagnostics include explicit decision model version', () => {
  const result = runDecisionEngine({
    candidates: [baseCandidate()],
    recommendationLimit: 1,
  });

  assert.ok(typeof result.diagnostics.decisionModelVersion === 'string');
  assert.ok(result.diagnostics.decisionModelVersion.length > 0);
});
