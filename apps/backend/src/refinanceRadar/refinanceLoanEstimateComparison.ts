// Home Intelligence FRD §8.7 (HI-DOC-001/005), Phase 5 remediation item (d)
// — a durable link back to the extraction that produced this offer's
// values, when it came from one (an offer typed by hand carries none). The
// same field-confidence/evidence-location shape
// refinanceLoanEstimateExtractionEnvelope.adapter.ts's ExtractionEnvelope
// already computes; stored verbatim in offersJson (an existing JSON
// column), so no schema migration is needed for this to be durable.
export interface RefinanceLoanEstimateExtractionProvenance {
  envelope: import('../services/intelligence/extractionEnvelope.contract').ExtractionEnvelope;
  serverAttestation: string;
}

export interface RefinanceLoanEstimateInput {
  id: string;
  lenderName: string;
  loanAmountUsd: number;
  loanTermYears: number;
  loanType: 'FIXED' | 'ARM' | 'OTHER';
  noteRatePct: number;
  aprPct: number;
  monthlyPrincipalAndInterestUsd: number;
  monthlyMortgageInsuranceUsd?: number;
  estimatedTotalMonthlyPaymentUsd?: number;
  loanCostsUsd: number;
  lenderCreditsUsd: number;
  discountPointsPct?: number;
  discountPointsUsd?: number;
  cashToCloseUsd: number;
  cashToCloseDirection?: 'FROM_BORROWER' | 'TO_BORROWER' | 'UNKNOWN';
  fiveYearTotalPaidUsd?: number;
  fiveYearPrincipalPaidUsd?: number;
  issuedDate?: string;
  rateLockStatus?: 'LOCKED' | 'NOT_LOCKED' | 'UNKNOWN';
  rateLockExpirationDate?: string;
  extractionProvenance?: RefinanceLoanEstimateExtractionProvenance;
}

export type LoanEstimateMetric =
  | 'APR'
  | 'MONTHLY_PRINCIPAL_AND_INTEREST'
  | 'ESTIMATED_TOTAL_MONTHLY_PAYMENT'
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

export interface RefinanceLoanEstimateCostTradeoff {
  baselineOfferId: string;
  baselineLenderName: string;
  premiumOfferId: string;
  premiumLenderName: string;
  incrementalNetLoanCostsUsd: number;
  monthlyPaymentSavingsUsd: number;
  breakEvenMonths: number;
  withinNewLoanTerm: boolean;
}

export interface RefinanceLoanEstimateComparison {
  offers: RefinanceLoanEstimateComparisonRow[];
  leaders: Partial<Record<LoanEstimateMetric, string[]>>;
  costTradeoffs: RefinanceLoanEstimateCostTradeoff[];
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
  evaluatedAt: Date = new Date(),
): RefinanceLoanEstimateComparison {
  const evaluationDate = Date.UTC(
    evaluatedAt.getUTCFullYear(),
    evaluatedAt.getUTCMonth(),
    evaluatedAt.getUTCDate(),
  );
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
    if ((offer.monthlyMortgageInsuranceUsd ?? 0) > 0) {
      cautions.push(
        `The estimated payment includes ${offer.monthlyMortgageInsuranceUsd?.toLocaleString(
          'en-US',
          {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0,
          },
        )} per month of mortgage insurance. Confirm how and when it may end.`,
      );
    }
    if (
      offer.estimatedTotalMonthlyPaymentUsd != null &&
      offer.estimatedTotalMonthlyPaymentUsd + 0.005 <
        offer.monthlyPrincipalAndInterestUsd +
          (offer.monthlyMortgageInsuranceUsd ?? 0)
    ) {
      cautions.push(
        'Estimated total payment is below principal, interest, and mortgage insurance. Recheck the Projected Payments values.',
      );
    }
    if (!hasFiveYearFields) {
      cautions.push(
        'Add the “In 5 years” total paid and principal paid values from page 3 for a stronger cost comparison.',
      );
    }
    if (
      offer.discountPointsPct != null ||
      offer.discountPointsUsd != null
    ) {
      if (
        offer.discountPointsPct == null ||
        offer.discountPointsUsd == null
      ) {
        cautions.push(
          'Only one discount-points value was supplied. Confirm both the percentage and dollar charge from Section A.',
        );
      } else {
        const expectedPointsUsd =
          (offer.loanAmountUsd * offer.discountPointsPct) / 100;
        const tolerance = Math.max(10, expectedPointsUsd * 0.01);
        if (Math.abs(expectedPointsUsd - offer.discountPointsUsd) > tolerance) {
          cautions.push(
            'The discount-points percentage and dollar amount do not align with the disclosed loan amount. Recheck Section A.',
          );
        }
      }
      if ((offer.discountPointsUsd ?? 0) > 0) {
        cautions.push(
          `This offer includes ${offer.discountPointsUsd?.toLocaleString(
            'en-US',
            {
              style: 'currency',
              currency: 'USD',
              maximumFractionDigits: 0,
            },
          ) ?? 'discount points'} in discount points. Ask for a zero-point or lower-point option to compare the rate/cost tradeoff.`,
        );
      }
    }
    const cashDirection = offer.cashToCloseDirection ?? 'UNKNOWN';
    if (cashDirection === 'UNKNOWN') {
      cautions.push(
        'Cash-to-close direction is unknown. Confirm whether the disclosed amount is from or to the borrower.',
      );
    } else if (cashDirection === 'TO_BORROWER') {
      cautions.push(
        'This disclosure shows cash to the borrower. Confirm cash-out proceeds, payoff amounts, and whether every offer uses the same requested cash-out.',
      );
    }
    if (!offer.issuedDate) {
      cautions.push(
        'Add the Loan Estimate issue date to confirm that every offer reflects a comparable market window.',
      );
    } else {
      const issuedAt = Date.parse(`${offer.issuedDate}T00:00:00.000Z`);
      const ageDays = Math.floor(
        (evaluationDate - issuedAt) / (24 * 60 * 60 * 1000),
      );
      if (ageDays > 10) {
        cautions.push(
          `This Loan Estimate was issued ${ageDays} days ago. Confirm that the rate, credits, and costs are still available.`,
        );
      }
    }
    const lockStatus = offer.rateLockStatus ?? 'UNKNOWN';
    if (lockStatus === 'UNKNOWN') {
      cautions.push(
        'Rate-lock status is unknown. Confirm whether the rate is locked before relying on this comparison.',
      );
    } else if (lockStatus === 'NOT_LOCKED') {
      cautions.push(
        'The rate is not locked and may change before the lender issues revised terms.',
      );
    } else if (!offer.rateLockExpirationDate) {
      cautions.push(
        'The rate is marked locked, but no lock expiration date was supplied.',
      );
    } else {
      const expiresAt = Date.parse(
        `${offer.rateLockExpirationDate}T00:00:00.000Z`,
      );
      if (expiresAt < evaluationDate) {
        cautions.push(
          `The recorded rate lock expired on ${offer.rateLockExpirationDate}. Request current terms before proceeding.`,
        );
      }
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
  };
  const cashToCloseComparable =
    offers.every(
      (offer) => offer.cashToCloseDirection === 'FROM_BORROWER',
    ) &&
    new Set(
      offers.map(
        (offer) =>
          `${Math.round(offer.loanAmountUsd * 100)}:${offer.loanType}:${offer.loanTermYears}`,
      ),
    ).size === 1;
  if (cashToCloseComparable) {
    leaders.CASH_TO_CLOSE = minimumOfferIds(
      offers,
      (offer) => offer.cashToCloseUsd,
    );
  }
  const hasCompleteTotalPayments = offers.every(
    (offer) => offer.estimatedTotalMonthlyPaymentUsd != null,
  );
  if (hasCompleteTotalPayments) {
    leaders.ESTIMATED_TOTAL_MONTHLY_PAYMENT = minimumOfferIds(
      offers,
      (offer) => offer.estimatedTotalMonthlyPaymentUsd ?? null,
    );
  } else if (
    offers.some((offer) => offer.estimatedTotalMonthlyPaymentUsd != null)
  ) {
    for (const offer of offers) {
      if (offer.estimatedTotalMonthlyPaymentUsd == null) {
        offer.cautions.push(
          'Add the estimated total payment from Projected Payments before comparing all-in monthly estimates.',
        );
      }
    }
  }
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

  const costTradeoffs: RefinanceLoanEstimateCostTradeoff[] = [];
  const comparableGroups = new Map<
    string,
    RefinanceLoanEstimateComparisonRow[]
  >();
  for (const offer of offers) {
    const key = `${Math.round(offer.loanAmountUsd * 100)}:${offer.loanType}:${offer.loanTermYears}`;
    comparableGroups.set(key, [...(comparableGroups.get(key) ?? []), offer]);
  }
  for (const group of comparableGroups.values()) {
    if (group.length < 2) continue;
    const baseline = [...group].sort(
      (left, right) =>
        left.netLoanCostsUsd - right.netLoanCostsUsd ||
        left.monthlyPrincipalAndInterestUsd -
          right.monthlyPrincipalAndInterestUsd,
    )[0];
    for (const offer of group) {
      if (offer.id === baseline.id) continue;
      const incrementalNetLoanCostsUsd = roundCurrency(
        offer.netLoanCostsUsd - baseline.netLoanCostsUsd,
      );
      if (incrementalNetLoanCostsUsd <= 0) continue;
      const monthlyPaymentSavingsUsd = roundCurrency(
        baseline.monthlyPrincipalAndInterestUsd -
          offer.monthlyPrincipalAndInterestUsd,
      );
      if (monthlyPaymentSavingsUsd <= 0) {
        offer.cautions.push(
          `This offer has ${incrementalNetLoanCostsUsd.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0,
          })} more in net loan costs than the lowest-cost comparable offer without a lower monthly principal-and-interest payment.`,
        );
        continue;
      }
      const breakEvenMonths = Math.ceil(
        incrementalNetLoanCostsUsd / monthlyPaymentSavingsUsd,
      );
      costTradeoffs.push({
        baselineOfferId: baseline.id,
        baselineLenderName: baseline.lenderName,
        premiumOfferId: offer.id,
        premiumLenderName: offer.lenderName,
        incrementalNetLoanCostsUsd,
        monthlyPaymentSavingsUsd,
        breakEvenMonths,
        withinNewLoanTerm:
          breakEvenMonths <= offer.loanTermYears * 12,
      });
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
  if (leaders.ESTIMATED_TOTAL_MONTHLY_PAYMENT?.length) {
    summary.push(
      `${leaderLabel(
        leaders.ESTIMATED_TOTAL_MONTHLY_PAYMENT,
        offers,
      )} ${
        leaders.ESTIMATED_TOTAL_MONTHLY_PAYMENT.length > 1
          ? 'tie for'
          : 'has'
      } the lowest estimated total monthly payment. Taxes, insurance, and escrow estimates may still differ by lender.`,
    );
  }
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
  const loanAmounts = offers.map((offer) => offer.loanAmountUsd);
  if (Math.max(...loanAmounts) - Math.min(...loanAmounts) >= 1) {
    summary.push(
      'These offers use different loan amounts. Payment, APR, cash-to-close, and five-year cost are not directly comparable until each lender prices the same requested principal.',
    );
  }
  const issueDates = offers
    .map((offer) => offer.issuedDate)
    .filter((date): date is string => Boolean(date));
  if (
    issueDates.length !== offers.length ||
    new Set(issueDates).size > 1
  ) {
    summary.push(
      'These Loan Estimates were not all issued on the same date. Market movement may explain some rate or cost differences.',
    );
  }
  const lockStatuses = new Set(
    offers.map((offer) => offer.rateLockStatus ?? 'UNKNOWN'),
  );
  if (lockStatuses.size > 1) {
    summary.push(
      'The offers do not share the same rate-lock status. Locked and floating terms are not directly comparable.',
    );
  }
  if (!cashToCloseComparable) {
    summary.push(
      'Cash to close is shown but not ranked because direction, loan amount, product, or term is not fully aligned. Cash to the borrower is not equivalent to a lower upfront cost.',
    );
  }
  return {
    offers,
    leaders,
    costTradeoffs,
    summary,
    missingFiveYearCostOfferIds: offers
      .filter((offer) => offer.fiveYearBorrowingCostUsd == null)
      .map((offer) => offer.id),
    disclaimer:
      'This comparison organizes figures you entered from lender Loan Estimates. It does not verify the documents, recommend a lender, determine eligibility, or replace the official disclosures and terms provided by each lender.',
  };
}
