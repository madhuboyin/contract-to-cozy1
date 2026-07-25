import { RefinanceScenarioTerm } from '@prisma/client';
import {
  calcRefinanceScenario,
  TERM_TO_MONTHS,
  type RefinanceScenarioInput,
} from './engine/refinanceCalculation.engine';

export type RefinanceObjective =
  | 'BALANCED'
  | 'LOWER_PAYMENT'
  | 'FASTER_PAYOFF'
  | 'LOWER_TOTAL_COST';

export interface RefinanceTermAlternative {
  targetTerm: RefinanceScenarioTerm;
  targetTermMonths: number;
  newMonthlyPayment: number;
  monthlySavings: number;
  breakEvenMonths: number | null;
  lifetimeSavings: number;
  payoffDeltaMonths: number;
  totalInterestNewLoan: number;
  estimatedAprPct: number;
  isRecommended: boolean;
  tradeoffs: string[];
}

export interface RefinanceTermComparison {
  objective: RefinanceObjective;
  recommendedTerm: RefinanceScenarioTerm;
  recommendationExplanation: string;
  alternatives: RefinanceTermAlternative[];
}

const TERMS: RefinanceScenarioTerm[] = [
  RefinanceScenarioTerm.THIRTY_YEAR,
  RefinanceScenarioTerm.TWENTY_YEAR,
  RefinanceScenarioTerm.FIFTEEN_YEAR,
];

function tradeoffs(
  calculation: ReturnType<typeof calcRefinanceScenario>,
): string[] {
  const result: string[] = [];
  result.push(
    calculation.monthlySavings >= 0
      ? `Modeled payment is $${Math.round(calculation.monthlySavings).toLocaleString()} lower per month.`
      : `Modeled payment is $${Math.round(Math.abs(calculation.monthlySavings)).toLocaleString()} higher per month.`,
  );
  if (calculation.payoffDeltaMonths < 0) {
    result.push(
      `Payoff is approximately ${Math.abs(calculation.payoffDeltaMonths)} months sooner.`,
    );
  } else if (calculation.payoffDeltaMonths > 0) {
    result.push(
      `Payoff is approximately ${calculation.payoffDeltaMonths} months later.`,
    );
  } else {
    result.push('Modeled payoff timing is unchanged.');
  }
  result.push(
    calculation.lifetimeSavings >= 0
      ? `Estimated lifetime savings are $${Math.round(calculation.lifetimeSavings).toLocaleString()} after modeled costs.`
      : `Estimated lifetime cost is $${Math.round(Math.abs(calculation.lifetimeSavings)).toLocaleString()} higher after modeled costs.`,
  );
  return result;
}

function selectRecommended(
  alternatives: Array<
    Omit<RefinanceTermAlternative, 'isRecommended' | 'tradeoffs'>
  >,
  objective: RefinanceObjective,
) {
  const byLargest = (
    field: 'monthlySavings' | 'lifetimeSavings',
    candidates = alternatives,
  ) =>
    [...candidates].sort(
      (a, b) =>
        b[field] - a[field] ||
        a.targetTermMonths - b.targetTermMonths,
    )[0];

  if (objective === 'LOWER_PAYMENT') return byLargest('monthlySavings');
  if (objective === 'FASTER_PAYOFF') {
    return [...alternatives].sort(
      (a, b) =>
        a.targetTermMonths - b.targetTermMonths ||
        b.lifetimeSavings - a.lifetimeSavings,
    )[0];
  }
  if (objective === 'LOWER_TOTAL_COST') return byLargest('lifetimeSavings');

  // BALANCED: avoid recommending a modeled payment increase when at least one
  // term lowers the payment, then choose the best lifetime result in that set.
  const nonIncreasingPayment = alternatives.filter(
    (alternative) => alternative.monthlySavings >= 0,
  );
  return byLargest(
    'lifetimeSavings',
    nonIncreasingPayment.length > 0 ? nonIncreasingPayment : alternatives,
  );
}

export function compareRefinanceTerms(
  input: Omit<RefinanceScenarioInput, 'targetTermMonths'> & {
    objective: RefinanceObjective;
  },
): RefinanceTermComparison {
  const rawAlternatives = TERMS.map((targetTerm) => {
    const targetTermMonths = TERM_TO_MONTHS[targetTerm];
    const calculation = calcRefinanceScenario({
      ...input,
      targetTermMonths,
    });
    return {
      targetTerm,
      targetTermMonths,
      newMonthlyPayment: calculation.newMonthlyPayment,
      monthlySavings: calculation.monthlySavings,
      breakEvenMonths: calculation.breakEvenMonths,
      lifetimeSavings: calculation.lifetimeSavings,
      payoffDeltaMonths: calculation.payoffDeltaMonths,
      totalInterestNewLoan: calculation.totalInterestNewLoan,
      estimatedAprPct: calculation.estimatedAprPct,
      calculation,
    };
  });
  const recommended = selectRecommended(rawAlternatives, input.objective);
  const objectiveLabel: Record<RefinanceObjective, string> = {
    BALANCED: 'balances payment relief with lifetime savings',
    LOWER_PAYMENT: 'produces the lowest modeled monthly payment',
    FASTER_PAYOFF: 'produces the earliest modeled payoff',
    LOWER_TOTAL_COST: 'produces the greatest modeled lifetime savings',
  };

  return {
    objective: input.objective,
    recommendedTerm: recommended.targetTerm,
    recommendationExplanation:
      `Under the same entered rate and cost assumptions, the ` +
      `${recommended.targetTermMonths / 12}-year term ${objectiveLabel[input.objective]}. ` +
      'Actual lender rates and fees commonly differ by term.',
    alternatives: rawAlternatives.map(({ calculation, ...alternative }) => ({
      ...alternative,
      isRecommended: alternative.targetTerm === recommended.targetTerm,
      tradeoffs: tradeoffs(calculation),
    })),
  };
}
