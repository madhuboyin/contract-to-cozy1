import { APIError } from '../middleware/error.middleware';

// One precedence for the home value a financial analysis starts from (owner ruling, 2026-10-16):
//   1. an explicit override that belongs to that analysis (a what-if in the request, or the value saved for that tool),
//   2. the property's latest appraisal (Property.lastAppraisedValue),
//   3. the purchase price, disclosed as a fallback,
//   4. otherwise there is no value: the homeowner is asked for one. There is no silent default.
// An override is local to its analysis. It never writes or replaces the canonical property value.
export type PlanningHomeValueSource = 'SCENARIO_OVERRIDE' | 'APPRAISAL' | 'PURCHASE_PRICE_FALLBACK';

export interface PlanningHomeValue {
  valueDollars: number;
  source: PlanningHomeValueSource;
  /** Plain-language statement of where the value came from, shown with the analysis. */
  disclosure: string;
}

export class PlanningHomeValueRequiredError extends APIError {
  constructor() {
    super(
      'No home value is on record for this home. Tell me what value to plan with, or add the latest appraisal or purchase price to the home record.',
      422,
      'PLANNING_HOME_VALUE_REQUIRED',
    );
  }
}

const usd = (dollars: number) => `$${Math.round(dollars).toLocaleString('en-US')}`;
const positive = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

export function resolvePlanningHomeValue(input: {
  /** An override supplied for this analysis (request what-if first, then the value saved for this tool). */
  overrideDollars?: number | null;
  /** What the override is called to the user, e.g. "your saved Sell/Hold/Rent home value". */
  overrideLabel?: string;
  appraisedCents?: number | null;
  purchasePriceCents?: number | null;
}): PlanningHomeValue {
  if (positive(input.overrideDollars)) {
    return {
      valueDollars: input.overrideDollars,
      source: 'SCENARIO_OVERRIDE',
      disclosure: `Using ${input.overrideLabel ?? 'the home value you entered for this analysis'}: ${usd(input.overrideDollars)}. This applies to this analysis only; your home record is unchanged.`,
    };
  }
  if (positive(input.appraisedCents)) {
    const valueDollars = input.appraisedCents / 100;
    return { valueDollars, source: 'APPRAISAL', disclosure: `Using the latest appraisal on record: ${usd(valueDollars)}.` };
  }
  if (positive(input.purchasePriceCents)) {
    const valueDollars = input.purchasePriceCents / 100;
    return {
      valueDollars,
      source: 'PURCHASE_PRICE_FALLBACK',
      disclosure: `No appraisal is on record, so this uses the purchase price (${usd(valueDollars)}) as a stand-in for today's value. Add a current value for a closer estimate.`,
    };
  }
  throw new PlanningHomeValueRequiredError();
}
