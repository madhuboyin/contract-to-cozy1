const test = require('node:test');
const assert = require('node:assert/strict');

const {
  compareRefinanceDecisionAlternatives,
} = require('../../dist/refinanceRadar/refinanceAlternativeComparison');

const base = {
  loanBalanceUsd: 300_000,
  currentRatePct: 7,
  remainingTermMonths: 300,
  currentMonthlyPaymentUsd: 2_120,
  targetRatePct: 5.5,
  targetTermMonths: 240,
  refinanceMonthlyPaymentUsd: 2_064,
  refinanceTotalInterestUsd: 195_360,
  refinanceCashToCloseUsd: 8_000,
};

test('always includes retaining the current mortgage', () => {
  const result = compareRefinanceDecisionAlternatives(base);
  assert.deepEqual(result.map((item) => item.kind), ['RETAIN_CURRENT']);
  assert.equal(result[0].payoffMonths, 300);
});

test('models extra-principal, recast, and cash-out alternatives only when entered', () => {
  const result = compareRefinanceDecisionAlternatives({
    ...base,
    extraPrincipalUsd: 20_000,
    recastPrincipalUsd: 30_000,
    recastFeeUsd: 250,
    cashOutAmountUsd: 40_000,
  });
  assert.deepEqual(result.map((item) => item.kind), [
    'RETAIN_CURRENT',
    'EXTRA_PRINCIPAL',
    'RECAST',
    'CASH_OUT_REFINANCE',
  ]);
  assert.ok(result.find((item) => item.kind === 'EXTRA_PRINCIPAL').payoffMonths < 300);
  assert.ok(result.find((item) => item.kind === 'RECAST').monthlyPaymentUsd < 2_120);
  assert.equal(
    result.find((item) => item.kind === 'CASH_OUT_REFINANCE').principalAfterActionUsd,
    340_000,
  );
});
