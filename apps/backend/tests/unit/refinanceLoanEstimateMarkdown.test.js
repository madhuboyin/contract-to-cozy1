const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRefinanceLoanEstimateComparisonMarkdown,
  buildRefinanceLoanEstimateHandoffMarkdown,
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
    monthlyMortgageInsuranceUsd: 120,
    estimatedTotalMonthlyPaymentUsd: 2420,
    loanCostsUsd: 8000,
    lenderCreditsUsd: 1000,
    discountPointsPct: 0.5,
    discountPointsUsd: 1500,
    cashToCloseUsd: 9000,
    fiveYearTotalPaidUsd: 125000,
    fiveYearPrincipalPaidUsd: 26000,
    issuedDate: '2026-07-20',
    rateLockStatus: 'LOCKED',
    rateLockExpirationDate: '2026-08-20',
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
  assert.match(markdown, /\| Lender A \| 2026-07-20 \| Locked through 2026-08-20 \| \$300,000 \|/);
  assert.match(markdown, /different loan amounts/i);
  assert.match(markdown, /Verification checklist/);
  assert.match(markdown, /Rate-lock status/);
  assert.match(markdown, /not a lender recommendation/i);
});

test('exports only the selected lender in a homeowner-controlled discussion brief', () => {
  const markdown = buildRefinanceLoanEstimateHandoffMarkdown({
    propertyLabel: '94 Ashford Dr',
    generatedAt: new Date('2026-07-25T12:00:00.000Z'),
    selectedOfferId: 'offer-a',
    offers: [
      offer(),
      offer({
        id: 'offer-b',
        lenderName: 'Competitor Bank',
        noteRatePct: 5.9,
        aprPct: 6.1,
        monthlyPrincipalAndInterestUsd: 1800,
        loanCostsUsd: 12500,
      }),
    ],
  });

  assert.match(markdown, /^# Mortgage Refinance Lender Discussion Brief/m);
  assert.match(markdown, /\*\*Selected lender:\*\* Lender A/);
  assert.doesNotMatch(markdown, /Competitor Bank/);
  assert.match(markdown, /competitor lender identities are intentionally omitted/i);
  assert.match(markdown, /Loan amount: \$300,000/);
  assert.match(markdown, /Rate lock: Locked through 2026-08-20/);
  assert.match(markdown, /Discount points: 0\.500% \/ \$1,500/);
  assert.match(markdown, /Estimated total monthly payment: \$2,420/);
  assert.match(markdown, /Monthly mortgage insurance: \$120/);
  assert.match(markdown, /\[x\] The selected figures were checked/);
  assert.match(markdown, /did not send it to a lender/i);
  assert.match(markdown, /not a commitment, acceptance, application/i);
  assert.match(markdown, /lower-net-cost baseline/i);
});

test('exports the incremental cost break-even without implying a universal winner', () => {
  const markdown = buildRefinanceLoanEstimateComparisonMarkdown({
    propertyLabel: '94 Ashford Dr',
    generatedAt: new Date('2026-07-25T12:00:00.000Z'),
    offers: [
      offer(),
      offer({
        id: 'offer-b',
        lenderName: 'Lender B',
        monthlyPrincipalAndInterestUsd: 1800,
        loanCostsUsd: 12500,
      }),
    ],
  });

  assert.match(markdown, /## Upfront-cost tradeoffs/);
  assert.match(
    markdown,
    /\| Lender B \| Lender A \| \$4,500 \| \$100 \| 45 months \|/,
  );
  assert.match(markdown, /excludes taxes, insurance, escrow/i);
});
