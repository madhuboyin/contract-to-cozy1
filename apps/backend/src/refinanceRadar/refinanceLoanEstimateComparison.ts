export interface RefinanceLoanEstimateInput {
  id: string;
  lenderName: string;
  loanTermYears: number;
  loanType: 'FIXED' | 'ARM' | 'OTHER';
  noteRatePct: number;
  aprPct: number;
  monthlyPrincipalAndInterestUsd: number;
  loanCostsUsd: number;
  lenderCreditsUsd: number;
  cashToCloseUsd: number;
  fiveYearTotalPaidUsd?: number;
  fiveYearPrincipalPaidUsd?: number;
}

export type LoanEstimateMetric =
  | 'APR'
  | 'MONTHLY_PRINCIPAL_AND_INTEREST'
  | 'NET_LOAN_COSTS'
  | 'CASH_TO_CLOSE'
  | 'FIVE_YEAR_BORROWING_COST';

export interface RefinanceLoanEstimateComparisonRow
  extends RefinanceLoanEstimateInput {
  netLoanCostsUsd: number;
  fiveYearBorrowingCostUsd: number | null;
  bestMetrics: LoanEstimateMetric[];
  cautions: string[];
}

export interface RefinanceLoanEstimateComparison {
  offers: RefinanceLoanEstimateComparisonRow[];
  leaders: Partial<Record<LoanEstimateMetric, string[]>>;
  summary: string[];
  missingFiveYearCostOfferIds: string[];
  disclaimer: string;
}

const roundCurrency = (value: number) => Math.round(value * 100) / 100;

function minimumOfferIds(
  offers: RefinanceLoanEstimateComparisonRow[],
  metric: (offer: RefinanceLoanEstimateComparisonRow) => number | null,
): string[] {
  const measured = offers
    .map((offer) => ({ id: offer.id, value: metric(offer) }))
    .filter((entry): entry is { id: string; value: number } => entry.value != null);
  if (!measured.length) return [];
  const minimum = Math.min(...measured.map((entry) => entry.value));
  return measured
    .filter((entry) => Math.abs(entry.value - minimum) < 0.005)
    .map((entry) => entry.id);
}

function leaderLabel(
  ids: string[],
  offers: RefinanceLoanEstimateComparisonRow[],
): string {
  return ids
    .map((id) => offers.find((offer) => offer.id === id)?.lenderName ?? id)
    .join(' and ');
}

/**
 * Compares values transcribed from the standardized Loan Estimate. It avoids a
 * single "winner" because cash, payment, and five-year cost can favor different
 * offers and because product terms may not be equivalent.
 */
export function compareRefinanceLoanEstimates(
  input: RefinanceLoanEstimateInput[],
): RefinanceLoanEstimateComparison {
  const offers: RefinanceLoanEstimateComparisonRow[] = input.map((offer) => {
    const hasFiveYearFields =
      offer.fiveYearTotalPaidUsd != null &&
      offer.fiveYearPrincipalPaidUsd != null;
    const fiveYearBorrowingCostUsd = hasFiveYearFields
      ? roundCurrency(
          offer.fiveYearTotalPaidUsd! - offer.fiveYearPrincipalPaidUsd!,
        )
      : null;
    const cautions: string[] = [];
    if (offer.aprPct < offer.noteRatePct) {
      cautions.push(
        'APR is below the note rate. Recheck the values copied from the Loan Estimate.',
      );
    }
    if (!hasFiveYearFields) {
      cautions.push(
        'Add the “In 5 years” total paid and principal paid values from page 3 for a stronger cost comparison.',
      );
    }
    return {
      ...offer,
      netLoanCostsUsd: roundCurrency(
        Math.max(0, offer.loanCostsUsd - offer.lenderCreditsUsd),
      ),
      fiveYearBorrowingCostUsd,
      bestMetrics: [],
      cautions,
    };
  });

  const leaders: RefinanceLoanEstimateComparison['leaders'] = {
    APR: minimumOfferIds(offers, (offer) => offer.aprPct),
    MONTHLY_PRINCIPAL_AND_INTEREST: minimumOfferIds(
      offers,
      (offer) => offer.monthlyPrincipalAndInterestUsd,
    ),
    NET_LOAN_COSTS: minimumOfferIds(offers, (offer) => offer.netLoanCostsUsd),
    CASH_TO_CLOSE: minimumOfferIds(offers, (offer) => offer.cashToCloseUsd),
  };
  const fiveYearLeaders = minimumOfferIds(
    offers,
    (offer) => offer.fiveYearBorrowingCostUsd,
  );
  if (fiveYearLeaders.length) {
    leaders.FIVE_YEAR_BORROWING_COST = fiveYearLeaders;
  }

  for (const [metric, ids] of Object.entries(leaders) as Array<
    [LoanEstimateMetric, string[]]
  >) {
    for (const id of ids) {
      offers.find((offer) => offer.id === id)?.bestMetrics.push(metric);
    }
  }

  const summary = [
    `${leaderLabel(leaders.APR ?? [], offers)} ${
      (leaders.APR?.length ?? 0) > 1 ? 'tie for' : 'has'
    } the lowest disclosed APR.`,
    `${leaderLabel(
      leaders.MONTHLY_PRINCIPAL_AND_INTEREST ?? [],
      offers,
    )} ${
      (leaders.MONTHLY_PRINCIPAL_AND_INTEREST?.length ?? 0) > 1
        ? 'tie for'
        : 'has'
    } the lowest monthly principal-and-interest payment.`,
  ];
  if (fiveYearLeaders.length) {
    summary.push(
      `${leaderLabel(fiveYearLeaders, offers)} ${
        fiveYearLeaders.length > 1 ? 'tie for' : 'has'
      } the lowest disclosed five-year borrowing cost (total paid minus principal paid).`,
    );
  }
  if (
    new Set(offers.map((offer) => `${offer.loanType}:${offer.loanTermYears}`))
      .size > 1
  ) {
    summary.push(
      'These offers do not all use the same loan type and term. Treat payment and total-cost differences as tradeoffs, not an apples-to-apples ranking.',
    );
  }

  return {
    offers,
    leaders,
    summary,
    missingFiveYearCostOfferIds: offers
      .filter((offer) => offer.fiveYearBorrowingCostUsd == null)
      .map((offer) => offer.id),
    disclaimer:
      'This comparison organizes figures you entered from lender Loan Estimates. It does not verify the documents, recommend a lender, determine eligibility, or replace the official disclosures and terms provided by each lender.',
  };
}
