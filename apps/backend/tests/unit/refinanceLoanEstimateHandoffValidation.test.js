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
    cashToCloseUsd: 9000,
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
