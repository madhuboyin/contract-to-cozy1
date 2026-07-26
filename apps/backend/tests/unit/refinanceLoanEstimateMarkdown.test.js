const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRefinanceLoanEstimateComparisonMarkdown,
} = require('../../dist/refinanceRadar/refinanceLoanEstimateMarkdown');

function offer(overrides = {}) {
  return {
    id: 'offer-a',
    lenderName: 'Lender A',
    loanAmountUsd: 300000,
    loanTermYears: 30,
    loanType: 'FIXED',
    noteRatePct: 5.75,
    aprPct: 5.95,
    monthlyPrincipalAndInterestUsd: 1900,
    loanCostsUsd: 8000,
    lenderCreditsUsd: 1000,
    cashToCloseUsd: 9000,
    fiveYearTotalPaidUsd: 125000,
    fiveYearPrincipalPaidUsd: 26000,
    ...overrides,
  };
}

test('exports reviewed offers, comparison context, and verification checklist', () => {
  const markdown = buildRefinanceLoanEstimateComparisonMarkdown({
    propertyLabel: '94 Ashford Dr | unsafe',
    generatedAt: new Date('2026-07-25T12:00:00.000Z'),
    offers: [
      offer(),
      offer({
        id: 'offer-b',
        lenderName: 'Lender B',
        aprPct: 6.1,
        loanAmountUsd: 310000,
      }),
    ],
  });

  assert.match(markdown, /^# Mortgage Refinance Loan Estimate Comparison/m);
  assert.match(markdown, /94 Ashford Dr unsafe/);
  assert.match(markdown, /\| Lender A \| \$300,000 \|/);
  assert.match(markdown, /different loan amounts/i);
  assert.match(markdown, /Verification checklist/);
  assert.match(markdown, /Rate-lock status/);
  assert.match(markdown, /not a lender recommendation/i);
});
