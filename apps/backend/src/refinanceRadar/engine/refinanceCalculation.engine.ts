// apps/backend/src/refinanceRadar/engine/refinanceCalculation.engine.ts
//
// Pure amortization-based refinance calculation engine.
// No side effects, no DB access — deterministic and testable.

import { RefinanceScenarioTerm } from '@prisma/client';
import { DEFAULT_CLOSING_COST_PCT } from '../config/refinanceRadar.config';
import { RefinanceCalcResult } from '../types/refinanceRadar.types';

// ─── Term Mapping ─────────────────────────────────────────────────────────────

export const TERM_TO_MONTHS: Record<RefinanceScenarioTerm, number> = {
  [RefinanceScenarioTerm.THIRTY_YEAR]: 360,
  [RefinanceScenarioTerm.TWENTY_YEAR]: 240,
  [RefinanceScenarioTerm.FIFTEEN_YEAR]: 180,
};

// ─── Core Amortization Functions ──────────────────────────────────────────────

/**
 * Calculate the standard amortized monthly payment (P&I only).
 *
 * Formula: M = P × r(1+r)^n / ((1+r)^n − 1)
 *
 * @param principalUsd  - Outstanding principal in USD
 * @param annualRatePct - Annual interest rate as a percentage (e.g., 6.25 for 6.25%)
 * @param termMonths    - Loan term in months
 */
export function calcMonthlyPayment(
  principalUsd: number,
  annualRatePct: number,
  termMonths: number,
): number {
  if (termMonths <= 0 || principalUsd <= 0) return 0;

  const monthlyRate = annualRatePct / 100 / 12;

  if (monthlyRate === 0) {
    // Zero-interest edge case
    return principalUsd / termMonths;
  }

  const factor = Math.pow(1 + monthlyRate, termMonths);
  return (principalUsd * monthlyRate * factor) / (factor - 1);
}

/**
 * Calculate the total interest paid over the full term of a loan.
 * totalInterest = monthlyPayment × termMonths − principal
 */
export function calcTotalInterest(
  monthlyPayment: number,
  termMonths: number,
  principalUsd: number,
): number {
  return Math.max(0, monthlyPayment * termMonths - principalUsd);
}

// ─── Scenario Input / Output ─────────────────────────────────────────────────

export interface RefinanceScenarioInput {
  // Current loan
  loanBalance: number;            // USD — remaining principal
  currentRatePct: number;         // Annual rate as percentage (e.g., 6.25)
  remainingTermMonths: number;    // Months left on current loan
  currentMonthlyPayment?: number; // If provided, used directly; otherwise computed

  // Target refinance
  targetRatePct: number;          // Annual rate as percentage (e.g., 5.50)
  targetTermMonths: number;       // New loan term in months (360 / 240 / 180)

  // Closing cost — one of the three; DEFAULT_CLOSING_COST_PCT used if none provided
  closingCostUsd?: number;
  closingCostPct?: number;        // Fraction of balance, e.g., 0.025
}

/**
 * Run a full amortization-based refinance scenario comparison.
 *
 * Returns all metrics needed for opportunity detection, confidence classification,
 * and API display. Math is conservative and does not overstate savings.
 *
 * Notes:
 * - Shortening the term (e.g., 30→15) may yield negative monthlySavings
 *   but positive lifetimeSavings. This is intentional and correctly modelled.
 * - Lifetime savings are net of closing costs.
 * - Break-even is null when monthly savings ≤ 0 (no monthly cash-flow benefit).
 */
export function calcRefinanceScenario(input: RefinanceScenarioInput): RefinanceCalcResult {
  const {
    loanBalance,
    currentRatePct,
    remainingTermMonths,
    targetRatePct,
    targetTermMonths,
    closingCostUsd,
    closingCostPct,
  } = input;

  // ── Effective closing cost ──
  let effectiveClosingCostUsd: number;
  if (closingCostUsd !== undefined && closingCostUsd > 0) {
    effectiveClosingCostUsd = closingCostUsd;
  } else if (closingCostPct !== undefined && closingCostPct > 0) {
    effectiveClosingCostUsd = loanBalance * closingCostPct;
  } else {
    effectiveClosingCostUsd = loanBalance * DEFAULT_CLOSING_COST_PCT;
  }

  // ── Monthly payments ──
  const currentMonthlyPayment =
    input.currentMonthlyPayment && input.currentMonthlyPayment > 0
      ? input.currentMonthlyPayment
      : calcMonthlyPayment(loanBalance, currentRatePct, remainingTermMonths);

  const newMonthlyPayment = calcMonthlyPayment(loanBalance, targetRatePct, targetTermMonths);

  // ── Monthly savings ──
  const monthlySavings = currentMonthlyPayment - newMonthlyPayment;

  // ── Break-even ──
  const breakEvenMonths =
    monthlySavings > 0
      ? Math.ceil(effectiveClosingCostUsd / monthlySavings)
      : null;

  // ── Interest comparison ──
  // Current loan: total interest over its remaining term
  const totalInterestRemainingCurrent = calcTotalInterest(
    currentMonthlyPayment,
    remainingTermMonths,
    loanBalance,
  );

  // New loan: total interest over its full new term
  const totalInterestNewLoan = calcTotalInterest(
    newMonthlyPayment,
    targetTermMonths,
    loanBalance,
  );

  // Lifetime savings = interest difference minus closing costs (conservative)
  const lifetimeSavings =
    totalInterestRemainingCurrent - totalInterestNewLoan - effectiveClosingCostUsd;

  const rateGapPct = currentRatePct - targetRatePct;
  const payoffDeltaMonths = targetTermMonths - remainingTermMonths;

  return {
    rateGapPct,
    effectiveClosingCostUsd,
    currentMonthlyPayment,
    newMonthlyPayment,
    monthlySavings,
    breakEvenMonths,
    totalInterestRemainingCurrent,
    totalInterestNewLoan,
    lifetimeSavings,
    payoffDeltaMonths,
  };
}
