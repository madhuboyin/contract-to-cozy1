require('ts-node/register/transpile-only');
const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { applianceFailureRiskFromView } = require('../../src/services/ask/askOrchestrator.service.ts');

const route = (message) => resolveAskRoutingCascade(message, { localRoutingEnabled: true });

test('supported compound capability prompts start the governed read instead of clarification or fallback', () => {
  // The Oracle prompt is a provisional read since 2026-11-18 (FR-FAST-10 slice 12), the seller-prep prompt since 2026-11-19 (a classifier-routed answer cannot use the canonical bypass, so it needs the grounded check); the other is still chosen by the local classifier.
  for (const [message, operationId, stage] of [
    ['which appliances have an estimated replacement cost over $1000 and high failure risk?', 'APPLIANCE_FAILURE_RISK', 'PROVISIONAL'],
    ['show seller prep items that cost less than $500 and are high priority', 'SELLER_PREP_CHECKLIST', 'PROVISIONAL'],
    ['compare furnace replacement options and show return on investment', 'HOME_UPGRADE_SCENARIOS', 'LOCAL_CLASSIFIER'],
  ]) {
    const decision = route(message);
    assert.equal(decision.stage, stage, message);
    assert.equal(decision.operation.operationId, operationId, message);
    assert.equal(decision.requiresClarification, false, message);
  }
});

test('Appliance Oracle applies strict replacement-cost and high-risk filters to its own estimates', () => {
  const prediction = (id, urgency, replacementCost) => ({ inventoryItemId: id, applianceName: id, currentAge: 9, expectedLife: 10, remainingLife: 1, failureRisk: 60, urgency, estimatedFailureDate: new Date('2027-01-01'), replacementCost, maintenanceImpact: 'Plan ahead', typicalLifeYears: { min: 8, max: 12 } });
  const report = { totalAppliances: 4, criticalCount: 1, highRiskCount: 2, estimatedTotalCost: 4000, predictions: [prediction('over-high', 'HIGH', 1200), prediction('equal-high', 'HIGH', 1000), prediction('over-low', 'LOW', 1500), prediction('over-critical', 'CRITICAL', 1800)], appliancesWithoutAge: 0, appliancesWithoutAgeItems: [], meta: { disclaimer: 'Educational estimate.' } };
  const result = applianceFailureRiskFromView(report, 'p1', { replacementCostOverCents: 100000, highRiskOnly: true });
  const rows = result.blocks.find((block) => block.id === 'appliance-oracle-items').items;
  assert.deepEqual(rows.map((row) => row.id), ['over-high', 'over-critical']);
});
