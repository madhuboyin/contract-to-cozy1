const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRefinanceScenarioMarkdown,
} = require('../../dist/refinanceRadar/refinanceScenarioMarkdown');

function result() {
  return {
    propertyContextVersion: 'context-v1',
    targetRatePct: 5.5,
    targetTerm: 'TWENTY_YEAR',
    targetTermMonths: 240,
    currentMonthlyPayment: 2400,
    newMonthlyPayment: 2100,
    monthlySavings: 300,
    breakEvenMonths: 24,
    lifetimeSavings: 80_000,
    closingCostUsd: 7200,
    payoffDeltaMonths: -60,
    totalInterestRemainingCurrent: 250_000,
    totalInterestNewLoan: 170_000,
    rateGapPct: 1.25,
    estimatedAprPct: 5.71,
    cashToCloseUsd: 7200,
    costBreakdown: {
      baseClosingCostsUsd: 7500,
      discountPoints: 0.5,
      discountPointsUsd: 1500,
      additionalFeesUsd: 1000,
      escrowFundingUsd: 2500,
      prepaymentPenaltyUsd: 0,
      lenderCreditsUsd: 5300,
      grossClosingCostsUsd: 12_500,
      netClosingCostsUsd: 7200,
    },
    scenarioDate: '2026-07-25T12:00:00.000Z',
    currentEstimatedPayoffDate: '2051-07-25T12:00:00.000Z',
    newEstimatedPayoffDate: '2046-07-25T12:00:00.000Z',
    objective: 'BALANCED',
    recommendedTerm: 'TWENTY_YEAR',
    recommendationExplanation: 'The 20-year term balances payment and payoff.',
    alternatives: [{
      targetTerm: 'TWENTY_YEAR',
      targetTermMonths: 240,
      newMonthlyPayment: 2100,
      monthlySavings: 300,
      breakEvenMonths: 24,
      lifetimeSavings: 80_000,
      payoffDeltaMonths: -60,
      totalInterestNewLoan: 170_000,
      estimatedAprPct: 5.71,
      isRecommended: true,
      tradeoffs: [],
    }],
    decisionAlternatives: [{
      kind: 'RETAIN_CURRENT',
      label: 'Keep current mortgage',
      principalAfterActionUsd: 300_000,
      monthlyPaymentUsd: 2400,
      upfrontCashUsd: 0,
      estimatedTotalInterestUsd: 250_000,
      payoffMonths: 300,
      guidance: 'Avoids refinance costs.',
    }],
    assumptions: {
      loanBalance: 300_000,
      currentRatePct: 6.75,
      remainingTermMonths: 300,
      closingCostSource: 'PROVIDED_AMOUNT',
      closingCostPctUsed: 0.024,
      discountPoints: 0.5,
      additionalFeesUsd: 1000,
      lenderCreditsUsd: 5300,
      escrowFundingUsd: 2500,
      prepaymentPenaltyUsd: 0,
      extraPrincipalUsd: 0,
      recastPrincipalUsd: 0,
      cashOutAmountUsd: 0,
      borrowerCreditBand: 'GOOD',
      aprMethodology: 'MODELED_FROM_NOTE_PAYMENT_AND_NET_UPFRONT_COSTS',
    },
    disclaimer: 'Educational estimate only.',
  };
}

test('builds a Markdown-only lender discussion summary', () => {
  const markdown = buildRefinanceScenarioMarkdown({
    propertyLabel: '94 Ashford Dr | injected heading',
    generatedAt: new Date('2026-07-25T12:00:00.000Z'),
    result: result(),
  });
  assert.match(markdown, /^# Mortgage Refinance Scenario Summary/m);
  assert.match(markdown, /Educational planning estimate only/);
  assert.match(markdown, /## Questions for a lender or servicer/);
  assert.match(markdown, /Initial escrow funding: \$2,500/);
  assert.doesNotMatch(markdown, /<html|<script/i);
  assert.doesNotMatch(markdown, /94 Ashford Dr \|/);
});
