const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const {
  computeImpacts,
  rangeFromPoint,
  computePaybackSensitivity,
} = require('../../src/services/homeDigitalTwinScenario.service.ts');

function component(overrides = {}) {
  return {
    componentType: 'HVAC',
    estimatedAgeYears: 12,
    conditionScore: 0.3,
    failureRiskScore: 0.7,
    annualMaintenanceCostEstimate: { toString: () => '500' },
    annualOperatingCostEstimate: { toString: () => '1800' },
    replacementCostEstimate: { toString: () => '9500' },
    ...overrides,
  };
}

function impactOf(impacts, type) {
  return impacts.find((i) => i.impactType === type);
}

// ── rangeFromPoint ──────────────────────────────────────────────────────────

test('rangeFromPoint spreads symmetrically around the base value', () => {
  const r = rangeFromPoint(1000, 0.2);
  assert.deepEqual(r, { low: 800, base: 1000, high: 1200 });
});

// ── REPAIR_COMPONENT ────────────────────────────────────────────────────────

test('REPAIR_COMPONENT defaults to a fraction of replacement cost with a wide range', () => {
  const { impacts } = computeImpacts('REPAIR_COMPONENT', { componentType: 'HVAC', assumptions: {} }, component());
  const cost = impactOf(impacts, 'UPFRONT_COST');

  assert.equal(cost.valueNumeric, Math.round(9500 * 0.3));
  assert.ok(cost.valueLow < cost.valueNumeric);
  assert.ok(cost.valueHigh > cost.valueNumeric);
  assert.equal(cost.isUserSupplied, false);
});

test('REPAIR_COMPONENT respects a homeowner-supplied repair cost with a narrower range', () => {
  const { impacts } = computeImpacts(
    'REPAIR_COMPONENT',
    { componentType: 'HVAC', assumptions: { repairCost: 800 } },
    component(),
  );
  const cost = impactOf(impacts, 'UPFRONT_COST');
  const defaultResult = computeImpacts('REPAIR_COMPONENT', { componentType: 'HVAC', assumptions: {} }, component());
  const defaultCost = impactOf(defaultResult.impacts, 'UPFRONT_COST');

  assert.equal(cost.valueNumeric, 800);
  const suppliedSpread = cost.valueHigh - cost.valueLow;
  const defaultSpread = defaultCost.valueHigh - defaultCost.valueLow;
  assert.ok(suppliedSpread / cost.valueNumeric < defaultSpread / defaultCost.valueNumeric, 'homeowner-supplied cost should have a narrower relative range than the default');
});

test('REPAIR_COMPONENT never claims to reset age-related risk the way replacement does', () => {
  const repair = computeImpacts('REPAIR_COMPONENT', { componentType: 'HVAC', assumptions: {} }, component());
  const replace = computeImpacts('REPLACE_COMPONENT', { componentType: 'HVAC', assumptions: {} }, component());

  const repairRisk = impactOf(repair.impacts, 'RISK_REDUCTION');
  const replaceRisk = impactOf(replace.impacts, 'RISK_REDUCTION');
  assert.ok(repairRisk.valueNumeric < replaceRisk.valueNumeric);
});

// ── WAIT_MONITOR ────────────────────────────────────────────────────────────

test('WAIT_MONITOR costs nothing and claims zero risk reduction', () => {
  const { impacts } = computeImpacts('WAIT_MONITOR', { reviewMonths: 9 }, null);
  const cost = impactOf(impacts, 'UPFRONT_COST');
  const risk = impactOf(impacts, 'RISK_REDUCTION');

  assert.equal(cost.valueNumeric, 0);
  assert.equal(risk.valueNumeric, 0);
  assert.equal(risk.direction, 'NEUTRAL');
  const summary = impactOf(impacts, 'CUSTOM');
  assert.match(summary.valueText, /9 months/);
});

// ── Ranges on REPLACE_COMPONENT ─────────────────────────────────────────────

test('REPLACE_COMPONENT upfront cost range narrows when a real component record exists', () => {
  const withComponent = computeImpacts('REPLACE_COMPONENT', { componentType: 'HVAC', assumptions: {} }, component());
  const withoutComponent = computeImpacts('REPLACE_COMPONENT', { componentType: 'HVAC', assumptions: {} }, null);

  const costWith = impactOf(withComponent.impacts, 'UPFRONT_COST');
  const costWithout = impactOf(withoutComponent.impacts, 'UPFRONT_COST');

  const spreadWith = (costWith.valueHigh - costWith.valueLow) / costWith.valueNumeric;
  const spreadWithout = (costWithout.valueHigh - costWithout.valueLow) / costWithout.valueNumeric;
  assert.ok(spreadWith < spreadWithout, 'a real component record should narrow the range vs. a category default');
});

test('an explicit homeowner-provided replacement cost gets the narrowest range', () => {
  const { impacts } = computeImpacts(
    'REPLACE_COMPONENT',
    { componentType: 'HVAC', assumptions: { replacementCost: 10000 } },
    component(),
  );
  const cost = impactOf(impacts, 'UPFRONT_COST');
  assert.equal(cost.valueNumeric, 10000);
  assert.equal(cost.valueLow, 9000);
  assert.equal(cost.valueHigh, 11000);
});

test('PAYBACK_PERIOD is expressed as a range, not a single point, once there are savings', () => {
  const { impacts } = computeImpacts(
    'REPLACE_COMPONENT',
    { componentType: 'HVAC', assumptions: { annualSavings: 400 } },
    component(),
  );
  const payback = impactOf(impacts, 'PAYBACK_PERIOD');
  assert.ok(payback.valueLow != null && payback.valueHigh != null);
  assert.ok(payback.valueLow < payback.valueHigh);
  assert.match(payback.valueText, /–/); // en dash range separator
});

// ── Sensitivity ──────────────────────────────────────────────────────────────

test('computePaybackSensitivity ranks the assumption with the larger payback swing first', () => {
  const factors = computePaybackSensitivity(9500, 0.35, 400, 0.25);
  assert.equal(factors.length, 2);
  assert.ok(factors[0].swingYears >= factors[1].swingYears);
});

test('a REPLACE_COMPONENT scenario with savings produces sensitivity factors', () => {
  const { sensitivity } = computeImpacts(
    'REPLACE_COMPONENT',
    { componentType: 'HVAC', assumptions: { annualSavings: 400 } },
    component(),
  );
  assert.equal(sensitivity.length, 2);
  assert.deepEqual(sensitivity.map((s) => s.assumption).sort(), [
    'Annual savings estimate',
    'Upfront cost estimate',
  ]);
});

test('a scenario type with no savings math (WAIT_MONITOR) produces no sensitivity factors', () => {
  const { sensitivity } = computeImpacts('WAIT_MONITOR', {}, null);
  assert.deepEqual(sensitivity, []);
});
