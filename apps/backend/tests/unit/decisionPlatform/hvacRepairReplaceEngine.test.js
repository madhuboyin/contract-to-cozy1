const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  evaluateHvacRepairReplace,
  HVAC_ENGINE_VERSION,
} = require('../../../src/services/decisionPlatform/hvacRepairReplaceEngine.service.ts');

function baseContext(overrides = {}) {
  return {
    propertyId: 'property-1',
    inventoryItemId: 'item-1',
    itemName: 'Furnace',
    ageYears: 8,
    condition: 'GOOD',
    repairSpendCentsLast30Months: 0,
    repairEventCountLast30Months: 0,
    warrantyActive: true,
    currentQuoteAmountCents: null,
    currentQuoteVendor: null,
    recordedReplacementCostCents: 900_000,
    ownershipHorizonMonths: null,
    repairReplaceApproach: null,
    ...overrides,
  };
}

test('a young, good-condition, warrantied system with low repair spend leans REPAIR', () => {
  const result = evaluateHvacRepairReplace(baseContext({ ageYears: 2 }));
  assert.equal(result.verdict, 'REPAIR');
  assert.equal(result.engineVersion, HVAC_ENGINE_VERSION);
  assert.ok(result.reasonCodes.includes('ACTIVE_WARRANTY_REDUCES_REPAIR_RISK'));
});

test('a system at or beyond typical lifespan in poor condition with high repair spend leans REPLACE', () => {
  const result = evaluateHvacRepairReplace(baseContext({
    ageYears: 17,
    condition: 'POOR',
    repairSpendCentsLast30Months: 400_000,
    repairEventCountLast30Months: 3,
    warrantyActive: false,
  }));
  assert.equal(result.verdict, 'REPLACE');
  assert.ok(result.reasonCodes.includes('SYSTEM_AT_OR_BEYOND_TYPICAL_LIFESPAN'));
  assert.ok(result.reasonCodes.includes('CONDITION_POOR'));
  assert.ok(result.reasonCodes.includes('ELEVATED_REPAIR_SPEND'));
  assert.ok(result.reasonCodes.includes('NO_ACTIVE_WARRANTY'));
});

test('a mid-life system with moderate repair spend and no strong signal lands on MONITOR', () => {
  const result = evaluateHvacRepairReplace(baseContext({
    ageYears: 9,
    condition: 'FAIR',
    repairSpendCentsLast30Months: 150_000,
    repairEventCountLast30Months: 1,
    warrantyActive: false,
  }));
  assert.equal(result.verdict, 'MONITOR');
});

test('a short ownership horizon relative to remaining life dampens the score toward REPAIR (FRD §11.2 OWNERSHIP_HORIZON)', () => {
  const withoutHorizon = evaluateHvacRepairReplace(baseContext({ ageYears: 10, condition: 'FAIR' }));
  const withShortHorizon = evaluateHvacRepairReplace(baseContext({ ageYears: 10, condition: 'FAIR', ownershipHorizonMonths: 6 }));
  assert.ok(withShortHorizon.score < withoutHorizon.score);
  assert.ok(withShortHorizon.reasonCodes.includes('OWNERSHIP_HORIZON_SHORTER_THAN_REMAINING_LIFE'));
});

test('MAXIMIZE_RELIABILITY approach leans more toward REPLACE than MINIMIZE_UPFRONT_COST for identical facts (FRD §11.2 REPAIR_REPLACE_APPROACH)', () => {
  const reliability = evaluateHvacRepairReplace(baseContext({ ageYears: 10, condition: 'FAIR', repairReplaceApproach: 'MAXIMIZE_RELIABILITY' }));
  const upfront = evaluateHvacRepairReplace(baseContext({ ageYears: 10, condition: 'FAIR', repairReplaceApproach: 'MINIMIZE_UPFRONT_COST' }));
  assert.ok(reliability.score > upfront.score);
});

test('a scenario quote amount overrides the current quote without mutating other factors (FRD §13 isolation)', () => {
  const base = baseContext({ recordedReplacementCostCents: null, currentQuoteAmountCents: 500_000 });
  const withScenario = evaluateHvacRepairReplace({ ...base, scenarioQuoteAmountCents: 1_200_000 });
  const withoutScenario = evaluateHvacRepairReplace(base);
  // A materially higher scenario replacement cost lowers the repair-spend-ratio
  // contribution (same repair spend, larger denominator), nudging the score down.
  assert.ok(withScenario.score <= withoutScenario.score);
});

test('unknown age, condition, and replacement cost are disclosed as limitations, never silently guessed as zero (FRD §1)', () => {
  const result = evaluateHvacRepairReplace(baseContext({
    ageYears: undefined,
    condition: 'UNKNOWN',
    recordedReplacementCostCents: null,
    currentQuoteAmountCents: null,
  }));
  assert.ok(result.limitationCodes.includes('INSTALL_DATE_UNKNOWN'));
  assert.ok(result.limitationCodes.includes('CONDITION_UNKNOWN'));
  assert.ok(result.limitationCodes.includes('REPLACEMENT_COST_RANGE_UNAVAILABLE'));
  assert.equal(result.confidenceBreakdown.label, 'LOW');
});

test('the technician-assessment limitation clears only when qualifying evidence is on file', () => {
  const result = evaluateHvacRepairReplace(baseContext());
  assert.ok(result.limitationCodes.includes('NO_TECHNICIAN_ASSESSMENT_ON_FILE'));
  const withEvidence = evaluateHvacRepairReplace(baseContext({ technicianAssessmentOnFile: true }));
  assert.ok(!withEvidence.limitationCodes.includes('NO_TECHNICIAN_ASSESSMENT_ON_FILE'));
});

test('confidence is HIGH only when age, condition, replacement cost, and ownership horizon are all known', () => {
  const allKnown = evaluateHvacRepairReplace(baseContext({ ownershipHorizonMonths: 24 }));
  assert.equal(allKnown.confidenceBreakdown.label, 'HIGH');
  const someUnknown = evaluateHvacRepairReplace(baseContext({ condition: 'UNKNOWN' }));
  assert.notEqual(someUnknown.confidenceBreakdown.label, 'HIGH');
});
