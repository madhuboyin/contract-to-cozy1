export const REFINANCE_GUIDANCE_SOURCES = {
  creditScores:
    'https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/understand-your-credit-score/',
  loanEstimate:
    'https://www.consumerfinance.gov/owning-a-home/loan-estimate/',
  compareOffers:
    'https://www.consumerfinance.gov/owning-a-home/compare/',
} as const;

export const REFINANCE_CREDIT_SCORE_BOUNDARY =
  'A self-selected credit band is only a planning input. Consumer credit scores can differ from the score and scoring model a mortgage lender uses.';

export const REFINANCE_COMMERCIAL_BOUNDARY =
  'ContractToCozy does not endorse a lender, rank lenders for compensation, contact a lender, or transmit this analysis.';

export const REFINANCE_METRIC_RANKING_BOUNDARY =
  'Metric highlights compare only the reviewed figures; they are not an overall lender ranking or recommendation.';

export function refinanceGuidanceSourceLines(): string[] {
  return [
    `- CFPB — understanding credit scores: ${REFINANCE_GUIDANCE_SOURCES.creditScores}`,
    `- CFPB — Loan Estimate explainer: ${REFINANCE_GUIDANCE_SOURCES.loanEstimate}`,
    `- CFPB — comparing loan offers: ${REFINANCE_GUIDANCE_SOURCES.compareOffers}`,
  ];
}
