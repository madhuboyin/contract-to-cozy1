const test = require('node:test');
const assert = require('node:assert/strict');

const {
  exportLoanEstimateHandoffSchema,
} = require('../../dist/refinanceRadar/validators/refinanceRadar.validators');

function offer(id) {
  return {
    id,
    lenderName: `Lender ${id}`,
    loanAmountUsd: 300000,
    loanTermYears: 30,
    loanType: 'FIXED',
    noteRatePct: 5.75,
    aprPct: 5.95,
    monthlyPrincipalAndInterestUsd: 1900,
    loanCostsUsd: 8000,
    lenderCreditsUsd: 1000,
    discountPointsPct: 0.5,
    discountPointsUsd: 1500,
    cashToCloseUsd: 9000,
    issuedDate: '2026-07-20',
    rateLockStatus: 'LOCKED',
    rateLockExpirationDate: '2026-08-20',
  };
}

const validInput = {
  offers: [offer('a'), offer('b')],
  selectedOfferId: 'a',
  acknowledgements: {
    figuresVerified: true,
    sameLoanRequestConfirmed: true,
    manualSharingUnderstood: true,
  },
};

test('requires every homeowner acknowledgement before handoff export', () => {
  assert.equal(
    exportLoanEstimateHandoffSchema.safeParse(validInput).success,
    true,
  );
  assert.equal(
    exportLoanEstimateHandoffSchema.safeParse({
      ...validInput,
      acknowledgements: {
        ...validInput.acknowledgements,
        manualSharingUnderstood: false,
      },
    }).success,
    false,
  );
});

test('requires a selected offer from the reviewed comparison', () => {
  assert.equal(
    exportLoanEstimateHandoffSchema.safeParse({
      ...validInput,
      selectedOfferId: 'unreviewed-offer',
    }).success,
    false,
  );
});

test('rejects impossible or inconsistent Loan Estimate lock dates', () => {
  assert.equal(
    exportLoanEstimateHandoffSchema.safeParse({
      ...validInput,
      offers: [
        offer('a'),
        {
          ...offer('b'),
          rateLockStatus: 'NOT_LOCKED',
          rateLockExpirationDate: '2026-08-20',
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    exportLoanEstimateHandoffSchema.safeParse({
      ...validInput,
      offers: [
        offer('a'),
        {
          ...offer('b'),
          issuedDate: '2026-09-01',
          rateLockExpirationDate: '2026-08-20',
        },
      ],
    }).success,
    false,
  );
});

test('rejects discount-point dollars that do not match the disclosed percentage', () => {
  assert.equal(
    exportLoanEstimateHandoffSchema.safeParse({
      ...validInput,
      offers: [
        offer('a'),
        {
          ...offer('b'),
          discountPointsPct: 1,
          discountPointsUsd: 500,
        },
      ],
    }).success,
    false,
  );
});
