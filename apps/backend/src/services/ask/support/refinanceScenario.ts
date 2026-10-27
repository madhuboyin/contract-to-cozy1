import { z } from 'zod';

export const REFINANCE_SCENARIO_CAPTURE_KEY = 'REFINANCE_SCENARIO_INPUTS';

export const refinanceScenarioCaptureSchema = z.object({
  targetRatePct: z.coerce.number().positive().max(30),
  targetTerm: z.enum(['FIFTEEN_YEAR', 'TWENTY_YEAR', 'THIRTY_YEAR']),
  closingCostAmount: z.coerce.number().min(0).max(1_000_000),
  objective: z.enum(['BALANCED', 'LOWER_PAYMENT', 'FASTER_PAYOFF', 'LOWER_TOTAL_COST']),
});

export type RefinanceScenarioCaptureAnswer = z.infer<typeof refinanceScenarioCaptureSchema>;

export function refinanceScenarioMessage(answer: RefinanceScenarioCaptureAnswer): string {
  const years = answer.targetTerm === 'FIFTEEN_YEAR' ? 15 : answer.targetTerm === 'TWENTY_YEAR' ? 20 : 30;
  const objective = answer.objective === 'LOWER_PAYMENT' ? 'lower payment'
    : answer.objective === 'FASTER_PAYOFF' ? 'faster payoff'
      : answer.objective === 'LOWER_TOTAL_COST' ? 'lower total cost' : 'balanced';
  return `What if I refinanced at ${answer.targetRatePct}% for ${years} years with $${answer.closingCostAmount} closing costs, with a ${objective} objective?`;
}
