// apps/backend/src/refinanceRadar/config/refinanceRadar.config.ts
//
// Centralized thresholds and constants for the Mortgage Refinance Radar feature.
// Tune these without touching business logic.

/**
 * Thresholds that determine whether a refinance opportunity qualifies as actionable.
 * All values are conservative to avoid noisy low-value alerts.
 */
export const REFINANCE_THRESHOLDS = {
  // Minimum rate gap in percentage points (e.g., 0.50 = current rate must be 0.5% above market)
  MIN_RATE_GAP_PCT: 0.5,
  // Maximum break-even period in months for an opportunity to be flagged at all
  MAX_BREAK_EVEN_MONTHS_OPPORTUNITY: 48,
  // Minimum estimated monthly savings in USD
  MIN_MONTHLY_SAVINGS_USD: 100,
  // Minimum projected lifetime savings in USD
  MIN_LIFETIME_SAVINGS_USD: 10_000,
  // Minimum remaining loan term in months (5 years = 60 months)
  MIN_REMAINING_TERM_MONTHS: 60,
  // Minimum loan balance in USD
  MIN_LOAN_BALANCE_USD: 80_000,
} as const;

/**
 * Break-even month thresholds that drive confidence level classification.
 * Applied only after an opportunity already qualifies.
 */
export const CONFIDENCE_THRESHOLDS = {
  STRONG: 24, // break-even <= 24 months → STRONG
  GOOD: 36,   // break-even <= 36 months → GOOD
  WEAK: 48,   // break-even <= 48 months → WEAK (above this = not an opportunity)
} as const;

/** Default closing cost assumption as a fraction of the loan balance (2.5%). */
export const DEFAULT_CLOSING_COST_PCT = 0.025;

/** Days to look back when evaluating missed-opportunity insights. */
export const MISSED_OPPORTUNITY_LOOKBACK_DAYS = 180;

/**
 * Minimum monthly savings improvement (vs current market rate) required to surface
 * a missed-opportunity insight. Prevents surfacing trivial historical differences.
 */
export const MISSED_OPPORTUNITY_MIN_SAVINGS_DELTA_USD = 50;

/** Number of recent rate snapshots to include in trend data. */
export const RATE_TREND_LOOKBACK_SNAPSHOTS = 12;

/** Standard disclaimer appended to all refinance API responses. */
export const REFINANCE_DISCLAIMER =
  'These estimates are for informational purposes only and are based on simplified ' +
  'assumptions. Actual savings, rates, and closing costs will vary. Consult a licensed ' +
  'mortgage professional before making refinancing decisions.';
