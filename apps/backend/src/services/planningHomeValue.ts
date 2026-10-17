import { APIError } from '../middleware/error.middleware';
import { prisma } from '../lib/prisma';

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
    super(PLANNING_HOME_VALUE_MESSAGE, 422, PLANNING_HOME_VALUE_REQUIRED);
  }
}

const usd = (dollars: number) => `$${Math.round(dollars).toLocaleString('en-US')}`;
const positive = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

type PlanningHomeValueInput = {
  /** An override supplied for this analysis (request what-if first, then the value saved for this tool). */
  overrideDollars?: number | null;
  /** What the override is called to the user, e.g. "your saved Sell/Hold/Rent home value". */
  overrideLabel?: string;
  appraisedCents?: number | null;
  purchasePriceCents?: number | null;
};

/** The precedence above; null when no value exists (step 4). */
export function tryResolvePlanningHomeValue(input: PlanningHomeValueInput): PlanningHomeValue | null {
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
  return null;
}

/** The estimator's own invariant: it is only reached once a value is known (callers go through the outcome methods). */
export function resolvePlanningHomeValue(input: PlanningHomeValueInput): PlanningHomeValue {
  const resolved = tryResolvePlanningHomeValue(input);
  if (!resolved) throw new PlanningHomeValueRequiredError();
  return resolved;
}

// What every caller of a home-value analysis receives instead of an exception. Each caller adapts it: Ask asks in the conversation, the desktop
// pages show an inline prompt, background work records the reason and moves on, and the API answers a structured 422.
export const PLANNING_HOME_VALUE_REQUIRED = 'PLANNING_HOME_VALUE_REQUIRED' as const;
export const PLANNING_HOME_VALUE_MESSAGE = 'No home value is on record for this home. Enter a value to plan with, or add the latest appraisal or purchase price to the home record.';
export type PlanningHomeValueOutcome<T> =
  | { status: 'OK'; value: T }
  | { status: 'HOME_VALUE_REQUIRED'; code: typeof PLANNING_HOME_VALUE_REQUIRED; message: string };

export const homeValueRequired = (): { status: 'HOME_VALUE_REQUIRED'; code: typeof PLANNING_HOME_VALUE_REQUIRED; message: string } =>
  ({ status: 'HOME_VALUE_REQUIRED', code: PLANNING_HOME_VALUE_REQUIRED, message: PLANNING_HOME_VALUE_MESSAGE });

/** Reads the same two canonical fields the estimators read and reports whether a value exists, without running an analysis. */
export async function hasPlanningHomeValue(propertyId: string, overrideDollars?: number | null): Promise<boolean> {
  if (positive(overrideDollars)) return true;
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { lastAppraisedValue: true, financingProfile: { select: { purchasePriceCents: true } } },
  });
  return tryResolvePlanningHomeValue({ appraisedCents: property?.lastAppraisedValue, purchasePriceCents: property?.financingProfile?.purchasePriceCents }) !== null;
}
