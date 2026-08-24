const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Home Intelligence Functional Completeness FRD Phase 3 review finding 4 —
// the per-action runtime rule every Home Action is evaluated against,
// regardless of its producer's static decisionLineagePolicy classification.

const { resolveActionDecisionLineagePolicy } = require('../../../src/services/decisionPlatform/homeActionDecisionLineage.ts');

function action(lineageId, safetyTier) {
  return { lineageId, governance: { safetyTier } };
}

test('LOW_CONSEQUENCE never requires a decision', () => {
  assert.deepEqual(resolveActionDecisionLineagePolicy(action('recall:1', 'LOW_CONSEQUENCE')), { kind: 'NOT_REQUIRED' });
});

test('SAFETY_EMERGENCY never requires a decision, even for a materially-shaped id', () => {
  assert.deepEqual(resolveActionDecisionLineagePolicy(action('incident:1', 'SAFETY_EMERGENCY')), { kind: 'NOT_REQUIRED' });
});

test('accepted/execution-continuity work is exempt even when material', () => {
  assert.deepEqual(
    resolveActionDecisionLineagePolicy(action('operational-work:item-1', 'MATERIAL_FINANCIAL')),
    { kind: 'NOT_REQUIRED' },
  );
  assert.deepEqual(
    resolveActionDecisionLineagePolicy(action('operational-work:item-1', 'REGULATED_COVERAGE')),
    { kind: 'NOT_REQUIRED' },
  );
});

test('a repair-replace item resolves to the registered HVAC decision family', () => {
  assert.deepEqual(
    resolveActionDecisionLineagePolicy(action('repair-replace:item-1', 'MATERIAL_FINANCIAL')),
    { kind: 'DECISION_REQUIRED', decisionDefinitionId: 'HVAC_REPAIR_REPLACE' },
  );
});

test('a material action with no registered decision family fails closed with a null decisionDefinitionId', () => {
  assert.deepEqual(
    resolveActionDecisionLineagePolicy(action('refinance-opportunity:property-1', 'MATERIAL_FINANCIAL')),
    { kind: 'DECISION_REQUIRED', decisionDefinitionId: null },
  );
  assert.deepEqual(
    resolveActionDecisionLineagePolicy(action('coverage-renewal:warranty-1', 'REGULATED_COVERAGE')),
    { kind: 'DECISION_REQUIRED', decisionDefinitionId: null },
  );
});
