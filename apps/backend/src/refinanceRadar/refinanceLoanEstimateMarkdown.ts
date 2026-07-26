import {
  compareRefinanceLoanEstimates,
  type RefinanceLoanEstimateInput,
} from './refinanceLoanEstimateComparison';

function money(value: number | null): string {
  if (value == null) return 'Not supplied';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(value: number): string {
  return `${value.toFixed(3)}%`;
}

function safeInline(value: string): string {
  return value.replace(/[\r\n|]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function buildRefinanceLoanEstimateComparisonMarkdown(input: {
  propertyLabel: string;
  generatedAt: Date;
  offers: RefinanceLoanEstimateInput[];
}): string {
  const comparison = compareRefinanceLoanEstimates(input.offers);
  const rows = comparison.offers.map(
    (offer) =>
      `| ${safeInline(offer.lenderName)} | ${money(offer.loanAmountUsd)} | ` +
      `${offer.loanTermYears}-year ${offer.loanType.toLowerCase()} | ` +
      `${pct(offer.noteRatePct)} | ${pct(offer.aprPct)} | ` +
      `${money(offer.monthlyPrincipalAndInterestUsd)} | ` +
      `${money(offer.netLoanCostsUsd)} | ${money(offer.cashToCloseUsd)} | ` +
      `${money(offer.fiveYearBorrowingCostUsd)} |`,
  );
  const cautionLines = comparison.offers.flatMap((offer) =>
    offer.cautions.map(
      (caution) => `- **${safeInline(offer.lenderName)}:** ${safeInline(caution)}`,
    ),
  );

  return [
    '# Mortgage Refinance Loan Estimate Comparison',
    '',
    `**Property:** ${safeInline(input.propertyLabel)}`,
    `**Generated:** ${input.generatedAt.toISOString()}`,
    '',
    '> Review copy based on homeowner-entered or homeowner-confirmed figures from official Loan Estimates. This is not a lender recommendation, approval, quote, or commitment to lend.',
    '',
    '## Side-by-side comparison',
    '',
    '| Lender | Loan amount | Product | Note rate | APR | Monthly P&I | Net loan costs | Cash to close | 5-year borrowing cost |',
    '| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows,
    '',
    'Five-year borrowing cost is calculated as the disclosed “In 5 years” total paid minus principal paid. Net loan costs are total loan costs minus lender credits.',
    '',
    '## What stands out',
    '',
    ...comparison.summary.map((line) => `- ${safeInline(line)}`),
    '',
    '## Verification checklist',
    '',
    '- [ ] Every offer uses the same requested loan amount and cash-out amount.',
    '- [ ] Every offer uses the intended loan type and term.',
    '- [ ] Rate-lock status, expiration date, and any float-down option are confirmed.',
    '- [ ] APR, monthly principal and interest, and page-3 five-year values were copied from the same revision of each Loan Estimate.',
    '- [ ] Section A origination charges, points, lender credits, and total loan costs are understood.',
    '- [ ] Cash to close is separated from prepaid taxes, insurance, initial escrow, and payoff-related timing.',
    '- [ ] Mortgage insurance, balloon payment, prepayment penalty, and adjustable-rate features are confirmed.',
    '- [ ] A revised Loan Estimate will be requested if loan amount, rate, credits, or product terms change.',
    '',
    '## Questions for each lender',
    '',
    '- Is the interest rate locked? If so, until when, and what conditions could change it?',
    '- Which fees are lender-controlled, and which services may I shop for?',
    '- Are lender credits tied to a higher rate, shorter lock, or other condition?',
    '- What will change if the appraisal, payoff amount, escrow funding, or closing date differs?',
    '- Does this offer include mortgage insurance, a prepayment penalty, a balloon payment, or adjustable-rate risk?',
    '- When should I expect a revised Loan Estimate, Closing Disclosure, and final cash-to-close figure?',
    '',
    ...(cautionLines.length
      ? ['## Items requiring review', '', ...cautionLines, '']
      : []),
    '## Important limitations',
    '',
    comparison.disclaimer,
    '',
    'ContractToCozy does not verify the uploaded document, lender identity, eligibility, rate lock, or final closing terms. Compare the latest official disclosures and consult qualified professionals before committing.',
    '',
  ].join('\n');
}
