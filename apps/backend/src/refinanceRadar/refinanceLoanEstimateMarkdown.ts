import {
  compareRefinanceLoanEstimates,
  type LoanEstimateMetric,
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

function rateLockLabel(offer: RefinanceLoanEstimateInput): string {
  if (offer.rateLockStatus === 'LOCKED') {
    return offer.rateLockExpirationDate
      ? `Locked through ${offer.rateLockExpirationDate}`
      : 'Locked; expiration not supplied';
  }
  if (offer.rateLockStatus === 'NOT_LOCKED') return 'Not locked';
  return 'Unknown';
}

const HANDOFF_METRIC_LABELS: Record<LoanEstimateMetric, string> = {
  APR: 'lowest disclosed APR',
  MONTHLY_PRINCIPAL_AND_INTEREST:
    'lowest monthly principal-and-interest payment',
  NET_LOAN_COSTS: 'lowest net loan costs',
  CASH_TO_CLOSE: 'lowest cash to close',
  FIVE_YEAR_BORROWING_COST: 'lowest disclosed five-year borrowing cost',
};

export function buildRefinanceLoanEstimateComparisonMarkdown(input: {
  propertyLabel: string;
  generatedAt: Date;
  offers: RefinanceLoanEstimateInput[];
}): string {
  const comparison = compareRefinanceLoanEstimates(
    input.offers,
    input.generatedAt,
  );
  const rows = comparison.offers.map(
    (offer) =>
      `| ${safeInline(offer.lenderName)} | ${offer.issuedDate ?? 'Not supplied'} | ` +
      `${rateLockLabel(offer)} | ${money(offer.loanAmountUsd)} | ` +
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
    '| Lender | Issued | Rate lock | Loan amount | Product | Note rate | APR | Monthly P&I | Net loan costs | Cash to close | 5-year borrowing cost |',
    '| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
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

export function buildRefinanceLoanEstimateHandoffMarkdown(input: {
  propertyLabel: string;
  generatedAt: Date;
  offers: RefinanceLoanEstimateInput[];
  selectedOfferId: string;
}): string {
  const comparison = compareRefinanceLoanEstimates(
    input.offers,
    input.generatedAt,
  );
  const selected = comparison.offers.find(
    (offer) => offer.id === input.selectedOfferId,
  );
  if (!selected) {
    throw new Error('Selected Loan Estimate offer was not found.');
  }
  const sameLoanAmount =
    new Set(input.offers.map((offer) => offer.loanAmountUsd)).size === 1;
  const sameProduct =
    new Set(
      input.offers.map(
        (offer) => `${offer.loanType}:${offer.loanTermYears}`,
      ),
    ).size === 1;
  const selectedStrengths = selected.bestMetrics.map(
    (metric) => `- ${HANDOFF_METRIC_LABELS[metric]} among the reviewed offers`,
  );
  const selectedCautions = selected.cautions.map(
    (caution) => `- ${safeInline(caution)}`,
  );

  return [
    '# Mortgage Refinance Lender Discussion Brief',
    '',
    `**Property:** ${safeInline(input.propertyLabel)}`,
    `**Selected lender:** ${safeInline(selected.lenderName)}`,
    `**Prepared:** ${input.generatedAt.toISOString()}`,
    '',
    '> Homeowner-controlled discussion copy. Downloading this Markdown file did not send it to a lender, create an application, authorize a credit inquiry, or accept an offer.',
    '',
    '## Selected Loan Estimate',
    '',
    `- Date issued: ${selected.issuedDate ?? 'Not supplied'}`,
    `- Rate lock: ${rateLockLabel(selected)}`,
    `- Loan amount: ${money(selected.loanAmountUsd)}`,
    `- Product: ${selected.loanTermYears}-year ${selected.loanType.toLowerCase()}`,
    `- Note rate: ${pct(selected.noteRatePct)}`,
    `- Disclosed APR: ${pct(selected.aprPct)}`,
    `- Monthly principal and interest: ${money(selected.monthlyPrincipalAndInterestUsd)}`,
    `- Total loan costs: ${money(selected.loanCostsUsd)}`,
    `- Lender credits: ${money(selected.lenderCreditsUsd)}`,
    `- Net loan costs: ${money(selected.netLoanCostsUsd)}`,
    `- Cash to close: ${money(selected.cashToCloseUsd)}`,
    `- Five-year borrowing cost: ${money(selected.fiveYearBorrowingCostUsd)}`,
    '',
    '## Private comparison context',
    '',
    `- Reviewed against ${input.offers.length - 1} other offer(s); competitor lender identities are intentionally omitted.`,
    `- Requested loan amount alignment: ${sameLoanAmount ? 'confirmed across reviewed offers' : 'not aligned; request corrected estimates before relying on rankings'}.`,
    `- Product and term alignment: ${sameProduct ? 'confirmed across reviewed offers' : 'not aligned; treat payment and cost differences as tradeoffs'}.`,
    ...(selectedStrengths.length
      ? selectedStrengths
      : ['- No single lowest-cost metric was assigned to this offer.']),
    '',
    ...(selectedCautions.length
      ? ['## Items to correct or confirm', '', ...selectedCautions, '']
      : []),
    '## Requested confirmations from the selected lender',
    '',
    '- Confirm whether the interest rate is locked, the expiration date, and every condition that could change it.',
    '- Confirm the loan amount, term, product, occupancy, and cash-out amount used for this disclosure.',
    '- Explain points, Section A origination charges, lender credits, and which settlement services may be shopped.',
    '- Separate prepaid taxes, insurance, initial escrow, and payoff timing from lender-controlled costs.',
    '- Confirm mortgage insurance, prepayment penalty, balloon payment, and adjustable-rate terms, if any.',
    '- Provide a revised Loan Estimate if the rate, credits, loan amount, product, or closing date changes.',
    '- Confirm when the Closing Disclosure and final cash-to-close figure will be available.',
    '',
    '## Homeowner verification recorded at download',
    '',
    '- [x] The selected figures were checked against the latest official Loan Estimate.',
    '- [x] The reviewed offers reflect the intended loan request or visible differences were understood.',
    '- [x] The homeowner understands that ContractToCozy did not transmit this file or contact a lender.',
    '',
    '## Important limitations',
    '',
    comparison.disclaimer,
    '',
    'This brief intentionally excludes competitor lender identities and is not a commitment, acceptance, application, approval, or authorization for a credit inquiry. Reconfirm all terms using the latest official disclosures before proceeding.',
    '',
  ].join('\n');
}
