import type { RefinanceScenarioResult } from './types/refinanceRadar.types';
import type { RefinanceEligibilityContext } from './refinanceEligibilityContext';

function money(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function pct(value: number): string {
  return `${value.toFixed(3)}%`;
}

function months(value: number | null): string {
  return value == null ? 'Not reached from monthly savings' : `${value} months`;
}

function safeInline(value: string): string {
  return value.replace(/[\r\n|]/g, ' ').trim();
}

export function buildRefinanceScenarioMarkdown(input: {
  propertyLabel: string;
  generatedAt: Date;
  result: RefinanceScenarioResult;
  eligibilityContext?: RefinanceEligibilityContext | null;
}): string {
  const { result } = input;
  const termRows = result.alternatives.map((alternative) =>
    `| ${alternative.targetTermMonths / 12}-year${alternative.isRecommended ? ' — modeled fit' : ''} | ` +
    `${money(alternative.newMonthlyPayment)} | ${money(alternative.monthlySavings)} | ` +
    `${months(alternative.breakEvenMonths)} | ${money(alternative.lifetimeSavings)} |`,
  );
  const decisionRows = result.decisionAlternatives.map((alternative) =>
    `| ${safeInline(alternative.label)} | ${money(alternative.monthlyPaymentUsd)} | ` +
    `${money(alternative.upfrontCashUsd)} | ${alternative.payoffMonths} months | ` +
    `${money(alternative.estimatedTotalInterestUsd)} |`,
  );
  const programSections = (input.eligibilityContext?.programPathways ?? []).flatMap(
    (pathway) => [
      `### ${safeInline(pathway.title)}`,
      '',
      `${safeInline(pathway.summary)} **Relevance:** ${pathway.relevance.replace(/_/g, ' ').toLowerCase()}.`,
      '',
      '**Confirm:**',
      ...pathway.requirementsToConfirm.map((item) => `- ${safeInline(item)}`),
      '',
      '**Cautions:**',
      ...pathway.cautions.map((item) => `- ${safeInline(item)}`),
      '',
    ],
  );

  return [
    '# Mortgage Refinance Scenario Summary',
    '',
    `**Property:** ${safeInline(input.propertyLabel)}`,
    `**Generated:** ${input.generatedAt.toISOString()}`,
    `**Scenario context version:** ${safeInline(result.propertyContextVersion)}`,
    '',
    '> Educational planning estimate only. This is not a Loan Estimate, lender quote, approval, appraisal, tax advice, or commitment to lend.',
    '',
    '## Scenario overview',
    '',
    `- Target note rate: ${pct(result.targetRatePct)}`,
    `- Modeled APR: ${pct(result.estimatedAprPct)}`,
    `- Target term: ${result.targetTermMonths / 12} years`,
    `- Current monthly principal-and-interest payment: ${money(result.currentMonthlyPayment)}`,
    `- Modeled new monthly principal-and-interest payment: ${money(result.newMonthlyPayment)}`,
    `- Modeled monthly savings: ${money(result.monthlySavings)}`,
    `- Break-even: ${months(result.breakEvenMonths)}`,
    `- Modeled lifetime savings: ${money(result.lifetimeSavings)}`,
    `- Cash to close: ${money(result.cashToCloseUsd)}`,
    `- Current estimated payoff: ${result.currentEstimatedPayoffDate}`,
    `- New estimated payoff: ${result.newEstimatedPayoffDate}`,
    '',
    '## Cost assumptions',
    '',
    `- Base closing costs: ${money(result.costBreakdown.baseClosingCostsUsd)}`,
    `- Discount points: ${result.costBreakdown.discountPoints.toFixed(3)} points (${money(result.costBreakdown.discountPointsUsd)})`,
    `- Other entered fees: ${money(result.costBreakdown.additionalFeesUsd)}`,
    `- Initial escrow funding: ${money(result.costBreakdown.escrowFundingUsd)}`,
    `- Existing-loan prepayment constraint: ${money(result.costBreakdown.prepaymentPenaltyUsd)}`,
    `- Lender credits: ${money(result.costBreakdown.lenderCreditsUsd)}`,
    `- Net modeled costs: ${money(result.costBreakdown.netClosingCostsUsd)}`,
    `- Broad credit band supplied for planning: ${result.assumptions.borrowerCreditBand}`,
    '',
    '## Term comparison',
    '',
    '| Term | Payment | Monthly savings | Break-even | Lifetime savings |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...termRows,
    '',
    `Modeled objective: **${result.objective.replace(/_/g, ' ').toLowerCase()}**. ${safeInline(result.recommendationExplanation)}`,
    '',
    '## Mortgage decision alternatives',
    '',
    '| Alternative | Payment | Upfront cash | Payoff | Estimated interest |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...decisionRows,
    '',
    '## Program and lien pathways',
    '',
    ...(programSections.length > 0
      ? programSections
      : ['No program-specific pathway could be identified from the recorded loan facts.', '']),
    '## Questions for a lender or servicer',
    '',
    '- What note rate, APR, points, credits, and cash-to-close apply to this property and borrower?',
    '- Does the current mortgage have a prepayment penalty or permit a recast?',
    '- How will escrow refunds and the new escrow deposit affect actual cash needed?',
    '- Are mortgage-insurance removal, cash-out, or program-specific options available?',
    '- What appraisal, occupancy, credit, income, and loan-limit rules apply?',
    '',
    '## Important limitations',
    '',
    result.disclaimer,
    '',
    'Market rates and lender fees can change. Confirm every amount using an official lender Loan Estimate before making a decision.',
    '',
  ].join('\n');
}
