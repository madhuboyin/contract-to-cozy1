import { PlanningHomeValueRequiredError } from '../../planningHomeValue';
import type { AskOperationResult } from '../askOperationRegistry';

// The owner ruling for financial tools: with no scenario value, no appraisal and no purchase price there is no silent default; the homeowner is asked.
// A reply such as "What if my home is worth $450,000?" is already understood by the Sell/Hold/Rent and Break-even what-if routes, so the answer stays in
// the conversation and applies to that analysis only.
export const isPlanningHomeValueRequired = (error: unknown): error is PlanningHomeValueRequiredError => error instanceof PlanningHomeValueRequiredError;

export function planningHomeValueRequestResult(analysis: 'Sell, hold or rent' | 'Break-even'): AskOperationResult {
  return {
    status: 'ANSWERED', reasonCode: 'PLANNING_HOME_VALUE_REQUIRED',
    blocks: [{
      type: 'SUMMARY', id: 'planning-home-value-required', title: 'What value should I plan with?',
      body: `The ${analysis.toLowerCase()} analysis starts from your home’s value, and none is on record: no appraisal and no purchase price. Tell me a value to use, for example “What if my home is worth $450,000?”. It applies to this analysis only and does not change your home record. You can also add the latest appraisal or purchase price to the home record.`,
      tone: 'CAUTION', actions: [],
    }],
    suggestions: [],
  };
}
