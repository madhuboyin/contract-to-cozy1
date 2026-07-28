const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const {
  computeImpacts,
  rangeFromPoint,
  computePaybackSensitivity,
  qualifyImpact,
  reconcileActualCost,
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

test('persisted impacts carry source, freshness, assumptions, and qualification metadata', () => {
  const computedAt = new Date('2026-07-28T12:00:00.000Z');
  const assumptions = { componentType: 'HVAC', assumptions: { replacementCost: 10000 } };
  const qualified = qualifyImpact(
    {
      impactType: 'UPFRONT_COST',
      valueNumeric: 10000,
      valueLow: 9500,
      valueHigh: 10500,
      valueText: null,
      valueJson: null,
      unit: 'USD',
      direction: 'NEGATIVE',
      confidenceScore: 0.8,
      sortOrder: 0,
      isUserSupplied: true,
    },
    assumptions,
    null,
    computedAt,
  );

  assert.equal(qualified.sourceClass, 'HOMEOWNER_ASSUMPTION');
  assert.equal(qualified.sourceAsOf.toISOString(), computedAt.toISOString());
  assert.deepEqual(qualified.assumptionsJson, assumptions);
  assert.match(qualified.qualificationText, /not independently verified/i);
});

test('verified actual cost reconciles against a homeowner planning estimate', () => {
  const outcome = reconcileActualCost([
    {
      impactType: 'UPFRONT_COST',
      valueLow: 9500,
      valueHigh: 10500,
      valueNumeric: 10000,
      sourceClass: 'HOMEOWNER_ASSUMPTION',
    },
  ], 1100000);

  assert.equal(outcome.projectedCostSourceClass, 'HOMEOWNER_ASSUMPTION');
  assert.equal(outcome.projectedCostLow, 9500);
  assert.equal(outcome.projectedCostHigh, 10500);
  assert.equal(outcome.varianceCents, 100000);
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
  assert.equal(cost.isUserSupplied, true);
});

test('MAINTAIN_COMPONENT remains distinct from repair and exposes service cadence', () => {
  const { impacts } = computeImpacts(
    'MAINTAIN_COMPONENT',
    { componentType: 'HVAC', assumptions: { maintenanceCost: 325, serviceIntervalMonths: 6 } },
    component(),
  );
  const cost = impactOf(impacts, 'UPFRONT_COST');
  const note = impactOf(impacts, 'CUSTOM');

  assert.equal(cost.valueNumeric, 325);
  assert.equal(cost.isUserSupplied, true);
  assert.match(note.valueText, /every 6 months/i);
});

test('age-derived component state never produces repair or replacement risk-reduction claims', () => {
  const repair = computeImpacts('REPAIR_COMPONENT', { componentType: 'HVAC', assumptions: {} }, component());
  const replace = computeImpacts('REPLACE_COMPONENT', { componentType: 'HVAC', assumptions: {} }, component());

  assert.equal(impactOf(repair.impacts, 'RISK_REDUCTION'), undefined);
  assert.equal(impactOf(replace.impacts, 'RISK_REDUCTION'), undefined);
});

// ── WAIT_MONITOR ────────────────────────────────────────────────────────────

test('WAIT_MONITOR costs nothing and makes no age-based risk claim', () => {
  const { impacts } = computeImpacts('WAIT_MONITOR', { reviewMonths: 9 }, null);
  const cost = impactOf(impacts, 'UPFRONT_COST');
  const risk = impactOf(impacts, 'RISK_REDUCTION');

  assert.equal(cost.valueNumeric, 0);
  assert.equal(risk, undefined);
  const summary = impactOf(impacts, 'CUSTOM');
  assert.match(summary.valueText, /9 months/);
  assert.equal(summary.isUserSupplied, true);
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
  assert.equal(cost.isUserSupplied, true);
});

test('homeowner-entered savings and their derived payback remain input assumptions', () => {
  const { impacts } = computeImpacts(
    'REPLACE_COMPONENT',
    { componentType: 'HVAC', assumptions: { replacementCost: 10000, annualSavings: 400 } },
    component(),
  );

  assert.equal(impactOf(impacts, 'UPFRONT_COST').isUserSupplied, true);
  assert.equal(impactOf(impacts, 'ANNUAL_SAVINGS').isUserSupplied, true);
  assert.equal(impactOf(impacts, 'PAYBACK_PERIOD').isUserSupplied, true);
  assert.equal(
    impacts.some((impact) => impact.impactType === 'CUSTOM' && !impact.isUserSupplied),
    false,
    'heuristic scenarios must not emit a system-generated bottom-line summary',
  );
});

test('incentive and financing assumptions change net cost and expose cash-flow terms', () => {
  const { impacts } = computeImpacts(
    'UPGRADE_COMPONENT',
    {
      componentType: 'HVAC',
      assumptions: {
        replacementCost: 12000,
        incentiveAmount: 2000,
        financingAprPercent: 6,
        financingTermMonths: 60,
        downPayment: 1000,
        decisionDate: '2026-10-01',
        energyPriceEscalationPercent: 3,
      },
    },
    component(),
  );

  assert.equal(impactOf(impacts, 'UPFRONT_COST').valueNumeric, 10000);
  assert.ok(impacts.some((impact) => /month for 60 months/i.test(impact.valueText ?? '')));
  assert.ok(impacts.some((impact) => /Decision timing: 2026-10-01/.test(impact.valueText ?? '')));
});

test('explicit risk reduction is preserved only as a homeowner assumption', () => {
  const { impacts } = computeImpacts(
    'REPLACE_COMPONENT',
    { componentType: 'HVAC', assumptions: { riskReductionPercent: 40 } },
    component(),
  );
  const risk = impactOf(impacts, 'RISK_REDUCTION');

  assert.equal(risk.valueNumeric, 40);
  assert.equal(risk.isUserSupplied, true);
  assert.match(risk.valueText, /your assumption/i);
});

test('energy scenarios without a savings baseline suppress savings and payback', () => {
  const { impacts } = computeImpacts('ENERGY_IMPROVEMENT', { upfrontCost: 3500 }, null);

  assert.equal(impactOf(impacts, 'ANNUAL_SAVINGS'), undefined);
  assert.equal(impactOf(impacts, 'PAYBACK_PERIOD'), undefined);
  assert.equal(impactOf(impacts, 'ENERGY_USE_CHANGE'), undefined);
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
