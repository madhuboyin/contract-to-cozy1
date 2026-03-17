// apps/backend/src/refinanceRadar/config/refinanceRadar.config.ts
//
// Centralized thresholds and constants for the Mortgage Refinance Radar feature.
// Tune these without touching business logic.

/**
 * Thresholds that determine whether a refinance opportunity qualifies as actionable.
 * All values are conservative to avoid noisy low-value alerts.
 *
 * Hysteresis design:
 * - MIN_RATE_GAP_PCT is the OPEN threshold — the gap needed to enter an open window.
 * - CLOSE_RATE_GAP_PCT is the CLOSE threshold — the gap at which an open window closes.
 * - The 0.10pp buffer prevents flip-flopping when rates hover near the threshold.
 */
export const REFINANCE_THRESHOLDS = {
  // Rate gap to OPEN a refinance window (current rate must exceed market by this much)
  MIN_RATE_GAP_PCT: 0.5,
  // Rate gap to CLOSE an already-open window (lower than open threshold = hysteresis buffer)
  CLOSE_RATE_GAP_PCT: 0.4,
  // Maximum break-even period in months for an opportunity to be flagged at all
  MAX_BREAK_EVEN_MONTHS_OPPORTUNITY: 48,
  // Minimum estimated monthly savings in USD (below this → not worth surfacing)
  MIN_MONTHLY_SAVINGS_USD: 100,
  // Minimum projected lifetime savings in USD
  MIN_LIFETIME_SAVINGS_USD: 10_000,
  // Minimum remaining loan term in months (5 years = 60 months)
  MIN_REMAINING_TERM_MONTHS: 60,
  // Minimum loan balance in USD
  MIN_LOAN_BALANCE_USD: 80_000,
} as const;

/**
 * Multi-factor confidence classification thresholds.
 * Applied only after an opportunity already qualifies.
 * Both break-even AND monthly savings must meet the threshold for STRONG / GOOD.
 * WEAK is the fallback when break-even qualifies but savings are modest.
 */
export const CONFIDENCE_THRESHOLDS = {
  STRONG: 24,                    // break-even <= 24 months → candidate for STRONG
  STRONG_MONTHLY_SAVINGS_USD: 200, // AND monthly savings >= $200 → STRONG
  GOOD: 36,                      // break-even <= 36 months → candidate for GOOD
  GOOD_MONTHLY_SAVINGS_USD: 100,   // AND monthly savings >= $100 → GOOD
  WEAK: 48,                      // break-even <= 48 months → WEAK (max allowed)
} as const;

/**
 * Suppression thresholds for missed-opportunity insights.
 * Prevents surfacing trivial "you missed a slightly better rate" noise.
 */
export const MISSED_OPPORTUNITY_THRESHOLDS = {
  // Minimum rate difference (current snapshot vs best historical) to surface a missed window
  MIN_RATE_DELTA_PCT: 0.20,
  // Minimum lifetime savings difference (at best rate vs current rate) to surface a missed window
  MIN_LIFETIME_SAVINGS_DELTA_USD: 10_000,
} as const;

/** Default closing cost assumption as a fraction of the loan balance (2.5%). */
export const DEFAULT_CLOSING_COST_PCT = 0.025;

/** Days to look back when evaluating missed-opportunity insights. */
export const MISSED_OPPORTUNITY_LOOKBACK_DAYS = 180;

/**
 * Minimum monthly savings improvement (vs current market rate) required to surface
 * a missed-opportunity insight. Prevents surfacing trivial historical differences.
 * @deprecated Use MISSED_OPPORTUNITY_THRESHOLDS.MIN_LIFETIME_SAVINGS_DELTA_USD for the
 * primary check; this monthly savings delta acts as a secondary guard.
 */
export const MISSED_OPPORTUNITY_MIN_SAVINGS_DELTA_USD = 50;

/** Number of recent rate snapshots to include in trend data. */
export const RATE_TREND_LOOKBACK_SNAPSHOTS = 12;

/** Standard disclaimer appended to all refinance API responses. */
export const REFINANCE_DISCLAIMER =
  'These estimates are for informational purposes only and are based on simplified ' +
  'assumptions. Actual savings, rates, and closing costs will vary by lender. Consult a ' +
  'licensed mortgage professional before making refinancing decisions.';
