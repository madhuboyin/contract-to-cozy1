const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRefinanceEligibilityContext,
} = require('../../dist/refinanceRadar/refinanceEligibilityContext');

const now = new Date('2026-07-25T12:00:00.000Z');

function build(overrides = {}) {
  return buildRefinanceEligibilityContext({
    currentMortgageBalanceUsd: 320_000,
    appraisedValueUsd: 500_000,
    appraisalDate: '2026-04-01T00:00:00.000Z',
    purchasePriceUsd: 450_000,
    hasSecondMortgage: false,
    secondMortgageBalanceUsd: null,
    hasMortgageInsurance: false,
    loanType: 'CONVENTIONAL_30_FIXED',
    ...overrides,
  }, now);
}

test('uses a current appraisal and calculates first and combined LTV', () => {
  const result = build();
  assert.equal(result.valueSource, 'APPRAISED_VALUE');
  assert.equal(result.valueConfidence, 'HIGH');
  assert.equal(result.firstLienLtvPct, 64);
  assert.equal(result.combinedLtvPct, 64);
  assert.equal(result.estimatedEquityUsd, 180_000);
  assert.equal(result.leverageBand, 'LOWER_LEVERAGE');
  assert.deepEqual(result.warnings, []);
});

test('includes a known second lien in combined LTV and equity', () => {
  const result = build({
    hasSecondMortgage: true,
    secondMortgageBalanceUsd: 60_000,
  });
  assert.equal(result.firstLienLtvPct, 64);
  assert.equal(result.combinedLtvPct, 76);
  assert.equal(result.estimatedEquityUsd, 120_000);
});

test('refuses to invent combined LTV when a recorded second lien has no balance', () => {
  const result = build({
    hasSecondMortgage: true,
    secondMortgageBalanceUsd: null,
  });
  assert.equal(result.firstLienLtvPct, 64);
  assert.equal(result.combinedLtvPct, null);
  assert.equal(result.estimatedEquityUsd, null);
  assert.equal(result.leverageBand, 'UNKNOWN');
  assert.ok(result.followUpActions.includes('CONFIRM_SECOND_LIEN_BALANCE'));
});

test('labels purchase price as a low-confidence fallback, not current value', () => {
  const result = build({
    appraisedValueUsd: null,
    appraisalDate: null,
  });
  assert.equal(result.valueSource, 'PURCHASE_PRICE_FALLBACK');
  assert.equal(result.valueConfidence, 'LOW');
  assert.ok(result.warnings.some((warning) => /purchase price/i.test(warning)));
  assert.ok(result.followUpActions.includes('UPDATE_PROPERTY_VALUE'));
});

test('missing property value leaves leverage unknown', () => {
  const result = build({
    appraisedValueUsd: null,
    purchasePriceUsd: null,
  });
  assert.equal(result.valueSource, 'UNKNOWN');
  assert.equal(result.firstLienLtvPct, null);
  assert.equal(result.combinedLtvPct, null);
  assert.equal(result.valueConfidence, 'UNKNOWN');
});

test('stale appraisals and mortgage insurance produce calm follow-up guidance', () => {
  const result = build({
    appraisalDate: '2024-01-01T00:00:00.000Z',
    hasMortgageInsurance: true,
  });
  assert.equal(result.valueConfidence, 'MEDIUM');
  assert.ok(result.warnings.some((warning) => /more than one year old/i.test(warning)));
  assert.ok(result.warnings.some((warning) => /mortgage insurance/i.test(warning)));
  assert.ok(result.followUpActions.includes('REVIEW_MORTGAGE_INSURANCE'));
});

test('higher combined leverage is contextual guidance, not an approval decision', () => {
  const result = build({
    currentMortgageBalanceUsd: 425_000,
    hasSecondMortgage: true,
    secondMortgageBalanceUsd: 30_000,
  });
  assert.equal(result.combinedLtvPct, 91);
  assert.equal(result.leverageBand, 'HIGHER_LEVERAGE');
  assert.ok(result.warnings.some((warning) => /may affect pricing/i.test(warning)));
});
