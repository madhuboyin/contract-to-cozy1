import { APIError } from '../middleware/error.middleware';

// The mortgage interest rate a debt-aware estimate starts from. One resolver, used by every estimator that models a mortgage (Sell/Hold/Rent, Break-even), so
// they cannot disagree about where the rate came from.
//
// Precedence (owner ruling, 2026-10-17):
//   1. a valid scenario-specific override: the request's own rate, else the value saved for the tool (MORTGAGE_ANNUAL_RATE)
//   2. the canonical financing profile's rate (PropertyFinancingProfile.interestRateBps)
//   3. a disclosed modelling assumption, only when neither exists and a mortgage is otherwise known
//
// Units: a rate is a DECIMAL fraction in every estimator input and result (0.065 means 6.5%). The profile stores basis points (650 means 6.5%); `rateFromBasisPoints`
// is the only conversion. Nothing here guesses a unit: a value that cannot be a mortgage rate is rejected, never rescaled. In particular 6.5 is not read as 6.5%
// and 0.0006 is not read as 0.06%; both are refused with a message that says how to enter the rate.
//
// A persisted AssumptionSet is deliberately NOT a source: it stores the full merged assumptions, including this tool's old modelled default, so its interestRate cannot be
// told apart from a default.

/** Inclusive bounds of a plausible annual mortgage rate: 0.1% to 25%. */
export const MORTGAGE_RATE_MIN = 0.001;
export const MORTGAGE_RATE_MAX = 0.25;
/** The modelling assumption used only when no rate exists anywhere (6.5%), and always disclosed. */
export const ASSUMED_MORTGAGE_RATE = 0.065;

export type MortgageRateSource = 'SCENARIO_OVERRIDE' | 'CANONICAL_PROFILE' | 'MODELING_ASSUMPTION';
export type MortgageRateIssueReason = 'NOT_A_FINITE_NUMBER' | 'LOOKS_LIKE_A_PERCENT' | 'TOO_LOW_FOR_A_RATE' | 'OUT_OF_RANGE';

export interface MortgageRateIssue {
  /** Which candidate was rejected. */
  source: Exclude<MortgageRateSource, 'MODELING_ASSUMPTION'>;
  reason: MortgageRateIssueReason;
  detail: string;
}

export interface ResolvedMortgageRate {
  /** Decimal fraction, or null when no rate applies (no mortgage to model). */
  rate: number | null;
  source: MortgageRateSource | null;
  /** One sentence naming the rate and where it came from, shown with the estimate. */
  disclosure: string | null;
  /** Candidates that were present but unusable, each with a reason. */
  ignored: MortgageRateIssue[];
}

/** Basis points to a decimal fraction: 650 -> 0.065. The single place the profile's unit is converted. */
export function rateFromBasisPoints(basisPoints: number): number {
  return basisPoints / 10_000;
}

/** "6.5%" / "6.25%": at most three decimals, trailing zeros trimmed. */
export function formatRatePercent(decimal: number): string {
  return `${Number((decimal * 100).toFixed(3))}%`;
}

/** Why a decimal cannot be a mortgage rate, or null when it can. */
export function mortgageRateProblem(value: unknown): { reason: MortgageRateIssueReason; detail: string } | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return { reason: 'NOT_A_FINITE_NUMBER', detail: 'The mortgage interest rate must be a number.' };
  if (value >= MORTGAGE_RATE_MIN && value <= MORTGAGE_RATE_MAX) return null;
  if (value > MORTGAGE_RATE_MAX && value <= 100) {
    return { reason: 'LOOKS_LIKE_A_PERCENT', detail: `${value} looks like a percent. Enter the rate as a decimal: 0.065 means 6.5%.` };
  }
  if (value > 0 && value < MORTGAGE_RATE_MIN) {
    return { reason: 'TOO_LOW_FOR_A_RATE', detail: `${value} is below ${formatRatePercent(MORTGAGE_RATE_MIN)}. Was a decimal entered as a percent? 0.065 means 6.5%.` };
  }
  return { reason: 'OUT_OF_RANGE', detail: `The mortgage interest rate must be between ${formatRatePercent(MORTGAGE_RATE_MIN)} and ${formatRatePercent(MORTGAGE_RATE_MAX)} (as a decimal, 0.001 to 0.25).` };
}

/** For a rate supplied in a request: malformed input is refused with a structured 400, never rescaled or clamped. */
export function assertMortgageRateInput(value: number | undefined | null, field: string): void {
  if (value === undefined || value === null) return;
  const problem = mortgageRateProblem(value);
  if (problem) throw new APIError(`${field}: ${problem.detail}`, 400, 'MORTGAGE_RATE_INVALID');
}

export function resolveMortgageRate(input: {
  /** A rate meant for this scenario: the request's own, else the tool's saved value. Decimal. */
  scenarioOverride?: number | null;
  /** The financing profile's rate, already converted from basis points. Decimal. */
  canonicalRate?: number | null;
  /** True when a mortgage is otherwise known (balance and term), so a missing rate may be assumed. False means: with no rate, there is nothing to model. */
  assumeIfMissing: boolean;
}): ResolvedMortgageRate {
  const ignored: MortgageRateIssue[] = [];

  if (input.scenarioOverride !== undefined && input.scenarioOverride !== null) {
    const problem = mortgageRateProblem(input.scenarioOverride);
    if (!problem) {
      return {
        rate: input.scenarioOverride, source: 'SCENARIO_OVERRIDE', ignored,
        disclosure: `Using the mortgage interest rate you entered for this scenario: ${formatRatePercent(input.scenarioOverride)}. Your financing profile is unchanged.`,
      };
    }
    ignored.push({ source: 'SCENARIO_OVERRIDE', ...problem });
  }

  if (input.canonicalRate !== undefined && input.canonicalRate !== null) {
    const problem = mortgageRateProblem(input.canonicalRate);
    if (!problem) {
      return { rate: input.canonicalRate, source: 'CANONICAL_PROFILE', ignored, disclosure: `Using the interest rate on your financing profile: ${formatRatePercent(input.canonicalRate)}.` };
    }
    ignored.push({ source: 'CANONICAL_PROFILE', ...problem, detail: `The rate on your financing profile was not used. ${problem.detail}` });
  }

  if (!input.assumeIfMissing) return { rate: null, source: null, disclosure: null, ignored };
  return {
    rate: ASSUMED_MORTGAGE_RATE, source: 'MODELING_ASSUMPTION', ignored,
    disclosure: `No usable mortgage interest rate is on record, so this assumes ${formatRatePercent(ASSUMED_MORTGAGE_RATE)}. Add your rate to your financing profile for a closer estimate.`,
  };
}
