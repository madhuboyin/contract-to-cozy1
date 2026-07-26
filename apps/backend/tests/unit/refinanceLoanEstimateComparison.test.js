const test = require('node:test');
const assert = require('node:assert/strict');

const {
  compareRefinanceLoanEstimates,
} = require('../../dist/refinanceRadar/refinanceLoanEstimateComparison');

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
    cashToCloseUsd: 9000,
    fiveYearTotalPaidUsd: 125000,
    fiveYearPrincipalPaidUsd: 26000,
    issuedDate: '2026-07-20',
    rateLockStatus: 'LOCKED',
    rateLockExpirationDate: '2026-08-20',
    ...overrides,
  };
}

test('compares disclosed costs without declaring one universal winner', () => {
  const result = compareRefinanceLoanEstimates([
    offer(),
    offer({
      id: 'offer-b',
      lenderName: 'Lender B',
      noteRatePct: 5.5,
      aprPct: 6.05,
      monthlyPrincipalAndInterestUsd: 1825,
      loanCostsUsd: 12000,
      lenderCreditsUsd: 500,
      cashToCloseUsd: 13000,
      fiveYearTotalPaidUsd: 122000,
      fiveYearPrincipalPaidUsd: 24000,
    }),
  ]);

  assert.deepEqual(result.leaders.APR, ['offer-a']);
  assert.deepEqual(result.leaders.MONTHLY_PRINCIPAL_AND_INTEREST, ['offer-b']);
  assert.deepEqual(result.leaders.NET_LOAN_COSTS, ['offer-a']);
  assert.deepEqual(result.leaders.FIVE_YEAR_BORROWING_COST, ['offer-b']);
  assert.equal(result.offers[0].netLoanCostsUsd, 7000);
  assert.equal(result.offers[1].fiveYearBorrowingCostUsd, 98000);
  assert.deepEqual(result.costTradeoffs, [
    {
      baselineOfferId: 'offer-a',
      baselineLenderName: 'Lender A',
      premiumOfferId: 'offer-b',
      premiumLenderName: 'Lender B',
      incrementalNetLoanCostsUsd: 4500,
      monthlyPaymentSavingsUsd: 75,
      breakEvenMonths: 60,
      withinNewLoanTerm: true,
    },
  ]);
  assert.match(result.disclaimer, /does not.*recommend a lender/i);
});

test('flags incomplete five-year disclosures and unlike terms', () => {
  const withoutFiveYear = offer({
    id: 'offer-b',
    lenderName: 'Lender B',
    loanTermYears: 15,
    fiveYearTotalPaidUsd: undefined,
    fiveYearPrincipalPaidUsd: undefined,
  });
  const result = compareRefinanceLoanEstimates([offer(), withoutFiveYear]);

  assert.deepEqual(result.missingFiveYearCostOfferIds, ['offer-b']);
  assert.equal(result.offers[1].fiveYearBorrowingCostUsd, null);
  assert.ok(
    result.offers[1].cautions.some((line) => /page 3/i.test(line)),
  );
  assert.ok(result.summary.some((line) => /not all use the same/i.test(line)));
});

test('preserves an APR transcription warning instead of silently correcting it', () => {
  const result = compareRefinanceLoanEstimates([
    offer({ aprPct: 5.5 }),
    offer({ id: 'offer-b', lenderName: 'Lender B' }),
  ]);
  assert.match(result.offers[0].cautions[0], /APR is below/i);
});

test('warns when lenders price different principal amounts', () => {
  const result = compareRefinanceLoanEstimates([
    offer(),
    offer({
      id: 'offer-b',
      lenderName: 'Lender B',
      loanAmountUsd: 310000,
    }),
  ]);
  assert.ok(result.summary.some((line) => /different loan amounts/i.test(line)));
  assert.equal(result.costTradeoffs.length, 0);
});

test('flags stale disclosures, expired locks, and mismatched lock status', () => {
  const result = compareRefinanceLoanEstimates(
    [
      offer({
        issuedDate: '2026-06-01',
        rateLockExpirationDate: '2026-07-01',
      }),
      offer({
        id: 'offer-b',
        lenderName: 'Lender B',
        issuedDate: '2026-07-25',
        rateLockStatus: 'NOT_LOCKED',
        rateLockExpirationDate: undefined,
      }),
    ],
    new Date('2026-07-25T12:00:00.000Z'),
  );

  assert.ok(result.offers[0].cautions.some((line) => /issued 54 days ago/i.test(line)));
  assert.ok(result.offers[0].cautions.some((line) => /lock expired/i.test(line)));
  assert.ok(result.offers[1].cautions.some((line) => /not locked/i.test(line)));
  assert.ok(result.summary.some((line) => /not all issued on the same date/i.test(line)));
  assert.ok(result.summary.some((line) => /do not share the same rate-lock status/i.test(line)));
});

test('flags a higher-cost comparable offer that does not lower payment', () => {
  const result = compareRefinanceLoanEstimates([
    offer(),
    offer({
      id: 'offer-b',
      lenderName: 'Lender B',
      loanCostsUsd: 12000,
      monthlyPrincipalAndInterestUsd: 1950,
    }),
  ]);

  assert.equal(result.costTradeoffs.length, 0);
  assert.ok(
    result.offers[1].cautions.some(
      (line) => /more in net loan costs.*without a lower monthly/i.test(line),
    ),
  );
});

test('explains discount points and flags incomplete point disclosures', () => {
  const result = compareRefinanceLoanEstimates([
    offer({
      discountPointsPct: 0.5,
      discountPointsUsd: 1500,
    }),
    offer({
      id: 'offer-b',
      lenderName: 'Lender B',
      discountPointsPct: 0.25,
    }),
  ]);

  assert.ok(
    result.offers[0].cautions.some(
      (line) => /includes \$1,500 in discount points/i.test(line),
    ),
  );
  assert.ok(
    result.offers[1].cautions.some(
      (line) => /only one discount-points value/i.test(line),
    ),
  );
});

test('compares complete total-payment estimates and exposes mortgage insurance', () => {
  const result = compareRefinanceLoanEstimates([
    offer(),
    offer({
      id: 'offer-b',
      lenderName: 'Lender B',
      monthlyPrincipalAndInterestUsd: 1850,
      monthlyMortgageInsuranceUsd: 0,
      estimatedTotalMonthlyPaymentUsd: 2250,
    }),
  ]);

  assert.deepEqual(result.leaders.ESTIMATED_TOTAL_MONTHLY_PAYMENT, ['offer-b']);
  assert.ok(
    result.offers[0].cautions.some(
      (line) => /includes \$120 per month of mortgage insurance/i.test(line),
    ),
  );
  assert.ok(
    result.summary.some(
      (line) => /lowest estimated total monthly payment/i.test(line),
    ),
  );
});

test('does not rank total payment when any offer is missing it', () => {
  const result = compareRefinanceLoanEstimates([
    offer(),
    offer({
      id: 'offer-b',
      lenderName: 'Lender B',
      estimatedTotalMonthlyPaymentUsd: undefined,
    }),
  ]);

  assert.equal(result.leaders.ESTIMATED_TOTAL_MONTHLY_PAYMENT, undefined);
  assert.ok(
    result.offers[1].cautions.some(
      (line) => /add the estimated total payment/i.test(line),
    ),
  );
});
