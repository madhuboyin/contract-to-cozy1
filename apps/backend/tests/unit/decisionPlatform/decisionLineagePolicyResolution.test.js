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

// C2C Intelligence & Agentic Evolution Phase 4A (architecture §12.7):
// non-HVAC repair/replace routes to APPLIANCE_REPAIR_REPLACE via its own
// lineageId prefix, still DECISION_REQUIRED under MATERIAL_FINANCIAL.
test('an appliance-repair-replace item resolves to the APPLIANCE_REPAIR_REPLACE decision family', () => {
  assert.deepEqual(
    resolveActionDecisionLineagePolicy(action('appliance-repair-replace:item-1', 'MATERIAL_FINANCIAL')),
    { kind: 'DECISION_REQUIRED', decisionDefinitionId: 'APPLIANCE_REPAIR_REPLACE' },
  );
});

test('a material action with no registered decision family fails closed with a null decisionDefinitionId', () => {
  // Phase 3 review finding 4 delivery step 6 registered adapters for every
  // producer that was null at Phase 3's original review — this exercises
  // the fail-closed behavior itself against a hypothetical unregistered
  // prefix, independent of which real producers currently have adapters.
  assert.deepEqual(
    resolveActionDecisionLineagePolicy(action('hypothetical-unregistered-domain:item-1', 'MATERIAL_FINANCIAL')),
    { kind: 'DECISION_REQUIRED', decisionDefinitionId: null },
  );
  assert.deepEqual(
    resolveActionDecisionLineagePolicy(action('hypothetical-unregistered-domain:item-1', 'REGULATED_COVERAGE')),
    { kind: 'DECISION_REQUIRED', decisionDefinitionId: null },
  );
});

test('every domain registered in Phase 3 review finding 4 delivery step 6 resolves to its decision family', () => {
  assert.deepEqual(
    resolveActionDecisionLineagePolicy(action('refinance-opportunity:property-1', 'MATERIAL_FINANCIAL')),
    { kind: 'DECISION_REQUIRED', decisionDefinitionId: 'REFINANCE_OPPORTUNITY' },
  );
  assert.deepEqual(
    resolveActionDecisionLineagePolicy(action('home-capital-timeline-window:item-1', 'MATERIAL_FINANCIAL')),
    { kind: 'DECISION_REQUIRED', decisionDefinitionId: 'HOME_CAPITAL_TIMELINE_WINDOW' },
  );
  assert.deepEqual(
    resolveActionDecisionLineagePolicy(action('ownership-cost-change:property-1:UTILITIES', 'MATERIAL_FINANCIAL')),
    { kind: 'DECISION_REQUIRED', decisionDefinitionId: 'OWNERSHIP_COST_CHANGE' },
  );
  assert.deepEqual(
    resolveActionDecisionLineagePolicy(action('savings-benefit-match:match-1', 'MATERIAL_FINANCIAL')),
    { kind: 'DECISION_REQUIRED', decisionDefinitionId: 'SAVINGS_BENEFIT_MATCH' },
  );
  assert.deepEqual(
    resolveActionDecisionLineagePolicy(action('coverage-review:question-key-1', 'MATERIAL_FINANCIAL')),
    { kind: 'DECISION_REQUIRED', decisionDefinitionId: 'COVERAGE_QUESTION' },
  );
  // Delivery step 7: the one genuinely missing engine — persistence,
  // producer, and adapter all added together (sellHoldRent.service.ts,
  // homeActionSourcePromotion.service.ts's loadSellHoldRentActions,
  // domainSnapshotAdapters.ts's sellHoldRentDecisionFamilyAdapter).
  assert.deepEqual(
    resolveActionDecisionLineagePolicy(action('sell-hold-rent:property-1', 'MATERIAL_FINANCIAL')),
    { kind: 'DECISION_REQUIRED', decisionDefinitionId: 'SELL_HOLD_RENT' },
  );
});

test('reclassified execution-continuity/workflow prefixes never require a decision even when material', () => {
  assert.deepEqual(
    resolveActionDecisionLineagePolicy(action('savings-benefit-action:action-1', 'MATERIAL_FINANCIAL')),
    { kind: 'NOT_REQUIRED' },
  );
  assert.deepEqual(
    resolveActionDecisionLineagePolicy(action('coverage-renewal:warranty:warranty-1', 'MATERIAL_FINANCIAL')),
    { kind: 'NOT_REQUIRED' },
  );
  assert.deepEqual(
    resolveActionDecisionLineagePolicy(action('property-tax-appeal-case:case-1', 'MATERIAL_FINANCIAL')),
    { kind: 'NOT_REQUIRED' },
  );
});
