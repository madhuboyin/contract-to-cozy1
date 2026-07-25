export type RefinanceProgramCode =
  | 'CONVENTIONAL_RATE_TERM'
  | 'FHA_STREAMLINE'
  | 'VA_IRRRL'
  | 'JUMBO_REFINANCE'
  | 'ARM_TO_FIXED'
  | 'PMI_REVIEW'
  | 'SECOND_LIEN_COORDINATION';

export type RefinanceProgramRelevance =
  | 'CURRENT_LOAN_PATH'
  | 'POTENTIAL_PATH'
  | 'CONDITIONAL'
  | 'NOT_APPLICABLE';

export interface RefinanceProgramPathway {
  program: RefinanceProgramCode;
  relevance: RefinanceProgramRelevance;
  title: string;
  summary: string;
  requirementsToConfirm: string[];
  cautions: string[];
  planningOnly: true;
}

function pathway(
  input: Omit<RefinanceProgramPathway, 'planningOnly'>,
): RefinanceProgramPathway {
  return { ...input, planningOnly: true };
}

export function buildRefinanceProgramGuidance(input: {
  loanType: string;
  occupancyStatus: string;
  firstLienLtvPct: number | null;
  combinedLtvPct: number | null;
  hasMortgageInsurance: boolean;
  hasSecondMortgage: boolean;
  secondMortgageBalanceUsd: number | null;
  conformingContext:
    | 'WITHIN_CONFIGURED_LIMIT'
    | 'ABOVE_CONFIGURED_LIMIT'
    | 'NOT_CONFIGURED';
}): RefinanceProgramPathway[] {
  const results: RefinanceProgramPathway[] = [];
  const ownerOccupied = input.occupancyStatus === 'OWNER_OCCUPIED';

  if (input.loanType === 'FHA_30') {
    results.push(pathway({
      program: 'FHA_STREAMLINE',
      relevance: 'CURRENT_LOAN_PATH',
      title: 'Ask about FHA streamline refinancing',
      summary:
        'An existing FHA loan may have a streamlined rate-and-term path with reduced documentation.',
      requirementsToConfirm: [
        'The current mortgage is FHA-insured.',
        'Program seasoning, payment-history, and net-tangible-benefit rules are satisfied.',
        'The lender confirms whether an appraisal, income review, and cash-to-close are required.',
      ],
      cautions: [
        'Mortgage insurance and upfront funding costs may continue or change.',
        'Streamline programs generally do not support unrestricted cash-out.',
      ],
    }));
  } else if (input.loanType === 'VA_30') {
    results.push(pathway({
      program: 'VA_IRRRL',
      relevance: 'CURRENT_LOAN_PATH',
      title: 'Ask about a VA interest-rate reduction refinance loan',
      summary:
        'An existing VA-backed loan may qualify for a streamlined rate-and-term refinance pathway.',
      requirementsToConfirm: [
        'The current mortgage is VA-backed and the borrower remains program eligible.',
        'Seasoning, recoupment, payment-history, and net-tangible-benefit requirements are satisfied.',
        'Occupancy certification and lender overlays are confirmed.',
      ],
      cautions: [
        'A VA funding fee may apply unless an exemption is confirmed.',
        'IRRRL is different from VA cash-out refinancing.',
      ],
    }));
  } else if (input.loanType === 'JUMBO_30' || input.conformingContext === 'ABOVE_CONFIGURED_LIMIT') {
    results.push(pathway({
      program: 'JUMBO_REFINANCE',
      relevance: input.loanType === 'JUMBO_30' ? 'CURRENT_LOAN_PATH' : 'CONDITIONAL',
      title: 'Compare jumbo refinance underwriting',
      summary:
        'The balance may require jumbo or high-balance pricing rather than the baseline conforming benchmark.',
      requirementsToConfirm: [
        'The applicable county and unit-count loan limit.',
        'Lender reserve, income, appraisal, credit, and combined-LTV overlays.',
        'Whether the quote is jumbo, agency high-balance, or another portfolio product.',
      ],
      cautions: [
        'A national baseline conforming limit cannot determine the correct program by itself.',
        'Jumbo pricing can differ materially by lender and borrower profile.',
      ],
    }));
  } else {
    results.push(pathway({
      program: 'CONVENTIONAL_RATE_TERM',
      relevance:
        input.loanType === 'OTHER' || input.loanType === 'UNKNOWN'
          ? 'CONDITIONAL'
          : 'CURRENT_LOAN_PATH',
      title: 'Compare conventional rate-and-term options',
      summary:
        'Use the modeled term comparison as a starting point for official conventional quotes.',
      requirementsToConfirm: [
        'Property occupancy, appraisal, income, credit, and debt-to-income requirements.',
        'Applicable conforming or high-balance loan limit.',
        'Points, credits, mortgage insurance, and cash-to-close on each Loan Estimate.',
      ],
      cautions: [
        'The displayed market benchmark is not a lender quote.',
      ],
    }));
  }

  if (input.loanType === 'ARM_5' || input.loanType === 'ARM_7') {
    results.push(pathway({
      program: 'ARM_TO_FIXED',
      relevance: 'CURRENT_LOAN_PATH',
      title: 'Compare ARM-to-fixed rate-risk reduction',
      summary:
        'A fixed-rate refinance may reduce future adjustment uncertainty even when immediate savings are modest.',
      requirementsToConfirm: [
        'Next adjustment date, current index, margin, caps, and remaining fixed period.',
        'Current fully indexed rate and payment-adjustment scenarios.',
      ],
      cautions: [
        'The radar does not yet project the current ARM index path.',
        'A lower introductory ARM quote may introduce future rate risk.',
      ],
    }));
  }

  if (input.hasMortgageInsurance) {
    results.push(pathway({
      program: 'PMI_REVIEW',
      relevance:
        input.firstLienLtvPct != null && input.firstLienLtvPct <= 80
          ? 'POTENTIAL_PATH'
          : 'CONDITIONAL',
      title: 'Review mortgage-insurance treatment',
      summary:
        'A new valuation or loan structure may affect mortgage insurance, but removal is not automatic.',
      requirementsToConfirm: [
        'Current loan program and mortgage-insurance type.',
        'Lender valuation, seasoning, payment history, and LTV requirements.',
      ],
      cautions: [
        'FHA MIP, conventional PMI, and lender-paid mortgage insurance follow different rules.',
      ],
    }));
  }

  if (input.hasSecondMortgage) {
    results.push(pathway({
      program: 'SECOND_LIEN_COORDINATION',
      relevance:
        input.secondMortgageBalanceUsd == null ? 'CONDITIONAL' : 'CURRENT_LOAN_PATH',
      title: 'Coordinate the second lien before refinancing',
      summary:
        'The second-lien holder may need to subordinate, be paid off, or be included in a new structure.',
      requirementsToConfirm: [
        'Current second-lien balance, rate, payment, draw availability, and payoff terms.',
        'Whether the lien holder permits subordination and its processing time and fees.',
        'The lender’s maximum combined LTV for the proposed transaction.',
      ],
      cautions: [
        'The first mortgage cannot be evaluated in isolation when another lien remains.',
        input.secondMortgageBalanceUsd == null
          ? 'Combined LTV remains unavailable until the second-lien balance is confirmed.'
          : 'Paying off a second lien may change cash-out classification and pricing.',
      ],
    }));
  }

  if (!ownerOccupied) {
    for (const item of results) {
      item.cautions.push(
        'Non-owner-occupied or unconfirmed occupancy may change pricing and program eligibility.',
      );
    }
  }

  return results;
}
