// apps/backend/src/refinanceRadar/engine/refinanceRadar.engine.ts
//
// Opportunity detection, confidence classification, and missed-opportunity analysis.
// Pure computation only — no DB writes. The service layer handles persistence.

import { RefinanceConfidenceLevel, RefinanceRadarState } from '@prisma/client';
import {
  CONFIDENCE_THRESHOLDS,
  MISSED_OPPORTUNITY_LOOKBACK_DAYS,
  MISSED_OPPORTUNITY_MIN_SAVINGS_DELTA_USD,
  MISSED_OPPORTUNITY_THRESHOLDS,
  REFINANCE_THRESHOLDS,
} from '../config/refinanceRadar.config';
import { calcRefinanceScenario } from './refinanceCalculation.engine';
import { MortgageRateService } from './mortgageRate.service';
import {
  MissedOpportunityInsight,
  MortgageInputContext,
  RadarEvaluationResult,
} from '../types/refinanceRadar.types';

// ─── Confidence Classification ────────────────────────────────────────────────

/**
 * Derive a confidence level from break-even months AND monthly savings.
 * Both dimensions must meet the threshold to earn STRONG or GOOD classification.
 * WEAK is the fallback when the break-even qualifies but savings are modest.
 *
 * Only called when an opportunity has already been confirmed as qualifying.
 */
export function classifyConfidence(
  breakEvenMonths: number,
  monthlySavings: number,
): RefinanceConfidenceLevel {
  if (
    breakEvenMonths <= CONFIDENCE_THRESHOLDS.STRONG &&
    monthlySavings >= CONFIDENCE_THRESHOLDS.STRONG_MONTHLY_SAVINGS_USD
  ) {
    return RefinanceConfidenceLevel.STRONG;
  }
  if (
    breakEvenMonths <= CONFIDENCE_THRESHOLDS.GOOD &&
    monthlySavings >= CONFIDENCE_THRESHOLDS.GOOD_MONTHLY_SAVINGS_USD
  ) {
    return RefinanceConfidenceLevel.GOOD;
  }
  return RefinanceConfidenceLevel.WEAK;
}

type QualificationResult = {
  calculation: ReturnType<typeof calcRefinanceScenario>;
  notQualifiedReasons: string[];
};

function evaluateScenarioQualification(
  mortgageInput: MortgageInputContext,
  targetRatePct: number,
  rateGapThreshold: number,
): QualificationResult {
  const calculation = calcRefinanceScenario({
    loanBalance: mortgageInput.loanBalance,
    currentRatePct: mortgageInput.currentRatePct,
    remainingTermMonths: mortgageInput.remainingTermMonths,
    currentMonthlyPayment: mortgageInput.currentMonthlyPayment,
    targetRatePct,
    targetTermMonths: 360,
  });
  const notQualifiedReasons: string[] = [];

  if (calculation.rateGapPct < rateGapThreshold) {
    notQualifiedReasons.push(
      `Rate gap (${calculation.rateGapPct.toFixed(2)}%) is below the minimum threshold.`,
    );
  }
  if (mortgageInput.remainingTermMonths < REFINANCE_THRESHOLDS.MIN_REMAINING_TERM_MONTHS) {
    notQualifiedReasons.push(
      `Remaining term (${mortgageInput.remainingTermMonths} months) is too short for refinancing to make sense.`,
    );
  }
  if (mortgageInput.loanBalance < REFINANCE_THRESHOLDS.MIN_LOAN_BALANCE_USD) {
    notQualifiedReasons.push(
      `Loan balance ($${mortgageInput.loanBalance.toLocaleString()}) is below the minimum for a meaningful refinance.`,
    );
  }
  if (calculation.monthlySavings < REFINANCE_THRESHOLDS.MIN_MONTHLY_SAVINGS_USD) {
    notQualifiedReasons.push(
      `Estimated monthly savings ($${Math.round(calculation.monthlySavings)}) are below the minimum required.`,
    );
  }
  if (calculation.lifetimeSavings < REFINANCE_THRESHOLDS.MIN_LIFETIME_SAVINGS_USD) {
    notQualifiedReasons.push(
      `Projected lifetime savings ($${Math.round(calculation.lifetimeSavings).toLocaleString()}) are below the minimum required.`,
    );
  }
  if (
    calculation.breakEvenMonths !== null &&
    calculation.breakEvenMonths > REFINANCE_THRESHOLDS.MAX_BREAK_EVEN_MONTHS_OPPORTUNITY
  ) {
    notQualifiedReasons.push(
      `Break-even period (${calculation.breakEvenMonths} months) is too long to be practical.`,
    );
  }

  return { calculation, notQualifiedReasons };
}

/**
 * Find the highest modeled 30-year benchmark rate that passes every OPEN gate.
 * A bounded binary search keeps scheduled portfolio evaluation inexpensive;
 * the result is rounded down to a basis point to avoid overstating precision
 * or returning a rate that narrowly misses a gate.
 */
export function calculateTriggerRate(
  mortgageInput: MortgageInputContext,
): number | null {
  if (
    mortgageInput.remainingTermMonths < REFINANCE_THRESHOLDS.MIN_REMAINING_TERM_MONTHS ||
    mortgageInput.loanBalance < REFINANCE_THRESHOLDS.MIN_LOAN_BALANCE_USD
  ) {
    return null;
  }

  const highestCandidate =
    mortgageInput.currentRatePct - REFINANCE_THRESHOLDS.MIN_RATE_GAP_PCT;
  const lowestCandidate = 0.5;
  if (highestCandidate < lowestCandidate) return null;

  const qualifies = (candidateRate: number) =>
    evaluateScenarioQualification(
      mortgageInput,
      candidateRate,
      REFINANCE_THRESHOLDS.MIN_RATE_GAP_PCT,
    ).notQualifiedReasons.length === 0;

  if (!qualifies(lowestCandidate)) return null;
  if (qualifies(highestCandidate)) {
    return Math.floor(highestCandidate * 100) / 100;
  }

  let qualifyingRate = lowestCandidate;
  let nonQualifyingRate = highestCandidate;
  for (let iteration = 0; iteration < 16; iteration++) {
    const candidateRate = (qualifyingRate + nonQualifyingRate) / 2;
    if (qualifies(candidateRate)) {
      qualifyingRate = candidateRate;
    } else {
      nonQualifyingRate = candidateRate;
    }
  }
  return Math.floor(qualifyingRate * 100) / 100;
}

function buildDecisionExplanation(
  mortgageInput: MortgageInputContext,
  marketRatePct: number,
  calculation: ReturnType<typeof calcRefinanceScenario>,
  notQualifiedReasons: string[],
) {
  const triggerRatePct = calculateTriggerRate(mortgageInput);
  const isOpportunity = notQualifiedReasons.length === 0;
  const topDecisionFactors = isOpportunity
    ? [
        `The modeled market benchmark is ${calculation.rateGapPct.toFixed(2)} percentage points below your current rate.`,
        `Estimated principal-and-interest savings are about $${Math.round(calculation.monthlySavings).toLocaleString()} per month.`,
        calculation.breakEvenMonths == null
          ? 'The modeled payment does not recover estimated closing costs through monthly savings.'
          : `Estimated closing costs are recovered in about ${calculation.breakEvenMonths} months.`,
      ]
    : notQualifiedReasons.slice(0, 3);
  let triggerRateExplanation: string;
  if (triggerRatePct == null) {
    triggerRateExplanation =
      'A rate-only trigger is not currently available because balance, remaining term, or modeled savings would still miss an opportunity gate.';
  } else if (isOpportunity && marketRatePct > triggerRatePct) {
    triggerRateExplanation =
      `The existing window remains open under the stability buffer; a new window would open near ${triggerRatePct.toFixed(2)}% or lower under current assumptions.`;
  } else if (marketRatePct <= triggerRatePct) {
    triggerRateExplanation =
      `The current benchmark is at or below the approximate ${triggerRatePct.toFixed(2)}% monitoring threshold.`;
  } else {
    triggerRateExplanation =
      `The 30-year benchmark would need to reach approximately ${triggerRatePct.toFixed(2)}% or lower under current assumptions.`;
  }

  return { triggerRatePct, triggerRateExplanation, topDecisionFactors };
}

// ─── Radar Summary Text ───────────────────────────────────────────────────────

/**
 * Build a calm, informative summary message for the radar state.
 * Avoids financial hype and aggressive framing.
 */
function buildRadarSummary(result: RadarEvaluationResult): string {
  if (!result.isOpportunity) {
    if (result.rateGapPct <= 0) {
      return (
        `Market rates (${result.marketRatePct.toFixed(3)}%) are at or above your current mortgage rate. ` +
        `No refinance opportunity at this time.`
      );
    }
    if (result.rateGapPct < REFINANCE_THRESHOLDS.MIN_RATE_GAP_PCT) {
      return (
        `The current rate gap of ${result.rateGapPct.toFixed(2)}% is below the minimum needed ` +
        `for a meaningful refinance. The radar continues monitoring.`
      );
    }
    // Other disqualifying reasons (loan balance, term, savings thresholds)
    return `Current conditions don't yet meet the threshold for an actionable refinance opportunity. The radar is monitoring for changes.`;
  }

  const confidence = result.confidenceLevel;
  const breakEven = result.breakEvenMonths!;
  const savings = Math.round(result.monthlySavings);

  if (confidence === RefinanceConfidenceLevel.STRONG) {
    return (
      `Market rates are meaningfully below your mortgage rate. Refinancing may recover closing costs ` +
      `in approximately ${breakEven} months, with estimated monthly savings of $${savings.toLocaleString()}.`
    );
  }
  if (confidence === RefinanceConfidenceLevel.GOOD) {
    return (
      `A refinance window is open. Estimated closing cost recovery is approximately ${breakEven} months, ` +
      `with potential monthly savings of $${savings.toLocaleString()}.`
    );
  }
  return (
    `A marginal refinance opportunity exists with an estimated ${breakEven}-month break-even. ` +
    `Consider your plans for the property before acting.`
  );
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class RefinanceRadarEngine {
  private rateService: MortgageRateService;

  constructor(rateService: MortgageRateService) {
    this.rateService = rateService;
  }

  /**
   * Evaluate whether the given mortgage context qualifies as an actionable
   * refinance opportunity against the current market 30-year rate.
   *
   * Accepts the caller's current radar state to apply hysteresis logic:
   * - If OPEN: uses CLOSE_RATE_GAP_PCT (lower threshold) to prevent flip-flopping.
   * - If CLOSED or unknown: uses MIN_RATE_GAP_PCT (standard open threshold).
   *
   * Returns a fully annotated RadarEvaluationResult — no DB writes occur here.
   */
  async evaluate(
    mortgageInput: MortgageInputContext,
    currentRadarState?: RefinanceRadarState | null,
  ): Promise<RadarEvaluationResult & { summary: string; latestSnapshotId: string | null }> {
    const latestSnapshot = await this.rateService.getLatestSnapshot();

    if (!latestSnapshot) {
      const empty: RadarEvaluationResult = {
        isOpportunity: false,
        currentRatePct: mortgageInput.currentRatePct,
        marketRatePct: 0,
        rateGapPct: 0,
        loanBalance: mortgageInput.loanBalance,
        monthlySavings: 0,
        breakEvenMonths: null,
        lifetimeSavings: 0,
        effectiveClosingCostUsd: 0,
        remainingTermMonths: mortgageInput.remainingTermMonths,
        radarState: RefinanceRadarState.CLOSED,
        confidenceLevel: null,
        notQualifiedReasons: ['No market rate data available. Ingest a rate snapshot first.'],
        triggerRatePct: calculateTriggerRate(mortgageInput),
        triggerRateExplanation: 'Current market data is unavailable, so the monitoring threshold cannot be compared.',
        topDecisionFactors: ['No current market rate is available for comparison.'],
      };
      return { ...empty, summary: empty.notQualifiedReasons[0], latestSnapshotId: null };
    }

    const marketRatePct = latestSnapshot.rate30yr;

    // ── Hysteresis: apply lower close threshold if window is currently OPEN ──
    // This prevents the radar from toggling rapidly when rates hover near the threshold.
    const rateGapThreshold =
      currentRadarState === RefinanceRadarState.OPEN
        ? REFINANCE_THRESHOLDS.CLOSE_RATE_GAP_PCT
        : REFINANCE_THRESHOLDS.MIN_RATE_GAP_PCT;
    const { calculation: calcResult, notQualifiedReasons } =
      evaluateScenarioQualification(mortgageInput, marketRatePct, rateGapThreshold);

    const isOpportunity = notQualifiedReasons.length === 0;
    const radarState = isOpportunity ? RefinanceRadarState.OPEN : RefinanceRadarState.CLOSED;

    let confidenceLevel: RefinanceConfidenceLevel | null = null;
    if (isOpportunity && calcResult.breakEvenMonths !== null) {
      confidenceLevel = classifyConfidence(calcResult.breakEvenMonths, calcResult.monthlySavings);
    }

    const evalResult: RadarEvaluationResult = {
      isOpportunity,
      currentRatePct: mortgageInput.currentRatePct,
      marketRatePct,
      rateGapPct: calcResult.rateGapPct,
      loanBalance: mortgageInput.loanBalance,
      monthlySavings: calcResult.monthlySavings,
      breakEvenMonths: calcResult.breakEvenMonths,
      lifetimeSavings: calcResult.lifetimeSavings,
      effectiveClosingCostUsd: calcResult.effectiveClosingCostUsd,
      remainingTermMonths: mortgageInput.remainingTermMonths,
      radarState,
      confidenceLevel,
      notQualifiedReasons,
      ...buildDecisionExplanation(
        mortgageInput,
        marketRatePct,
        calcResult,
        notQualifiedReasons,
      ),
    };

    return {
      ...evalResult,
      summary: buildRadarSummary(evalResult),
      latestSnapshotId: latestSnapshot.id,
    };
  }

  /**
   * Evaluate whether a materially better refinance window existed in recent history.
   *
   * Suppression rules (to avoid trivial "you missed a slightly better rate" noise):
   * - Historical rate must have been >= 0.20pp better than current
   * - Lifetime savings difference must be >= $10,000
   * - Monthly savings delta must be >= $50 (secondary guard)
   *
   * Read-only — produces an insight summary, does not persist anything.
   */
  async evaluateMissedOpportunity(
    mortgageInput: MortgageInputContext,
  ): Promise<MissedOpportunityInsight> {
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - MISSED_OPPORTUNITY_LOOKBACK_DAYS);

    const historicalSnapshots = await this.rateService.getSnapshotsSince(lookbackDate);

    if (historicalSnapshots.length < 2) {
      return {
        hasMissedOpportunity: false,
        bestHistoricalRate30yr: null,
        bestHistoricalDate: null,
        bestMonthlySavingsAtPeak: null,
        deltaVsCurrent: null,
        summary: 'Not enough historical rate data to evaluate missed opportunities.',
      };
    }

    // Current market: most recent snapshot in lookback window (oldest-first array, so last = newest)
    const currentSnapshot = historicalSnapshots[historicalSnapshots.length - 1];

    // Find the snapshot with the lowest 30yr rate (best historical opportunity)
    const bestSnapshot = historicalSnapshots.reduce((best, snap) =>
      snap.rate30yr < best.rate30yr ? snap : best,
    );

    // Skip if best was the current snapshot
    if (bestSnapshot.id === currentSnapshot.id) {
      return {
        hasMissedOpportunity: false,
        bestHistoricalRate30yr: null,
        bestHistoricalDate: null,
        bestMonthlySavingsAtPeak: null,
        deltaVsCurrent: null,
        summary: 'Current rates are at or near their best levels recently. No missed window detected.',
      };
    }

    // ── Suppression: rate delta too small ──
    const rateDeltaPct = currentSnapshot.rate30yr - bestSnapshot.rate30yr;
    if (rateDeltaPct < MISSED_OPPORTUNITY_THRESHOLDS.MIN_RATE_DELTA_PCT) {
      return {
        hasMissedOpportunity: false,
        bestHistoricalRate30yr: bestSnapshot.rate30yr,
        bestHistoricalDate: bestSnapshot.date,
        bestMonthlySavingsAtPeak: null,
        deltaVsCurrent: null,
        summary: 'Historical rates were only marginally different. No meaningful missed window detected.',
      };
    }

    const currentCalc = calcRefinanceScenario({
      loanBalance: mortgageInput.loanBalance,
      currentRatePct: mortgageInput.currentRatePct,
      remainingTermMonths: mortgageInput.remainingTermMonths,
      currentMonthlyPayment: mortgageInput.currentMonthlyPayment,
      targetRatePct: currentSnapshot.rate30yr,
      targetTermMonths: 360,
    });

    const bestCalc = calcRefinanceScenario({
      loanBalance: mortgageInput.loanBalance,
      currentRatePct: mortgageInput.currentRatePct,
      remainingTermMonths: mortgageInput.remainingTermMonths,
      currentMonthlyPayment: mortgageInput.currentMonthlyPayment,
      targetRatePct: bestSnapshot.rate30yr,
      targetTermMonths: 360,
    });

    // ── Suppression: lifetime savings delta too small ──
    const lifetimeSavingsDelta = bestCalc.lifetimeSavings - currentCalc.lifetimeSavings;
    if (lifetimeSavingsDelta < MISSED_OPPORTUNITY_THRESHOLDS.MIN_LIFETIME_SAVINGS_DELTA_USD) {
      return {
        hasMissedOpportunity: false,
        bestHistoricalRate30yr: bestSnapshot.rate30yr,
        bestHistoricalDate: bestSnapshot.date,
        bestMonthlySavingsAtPeak:
          bestCalc.monthlySavings > 0 ? Math.round(bestCalc.monthlySavings) : null,
        deltaVsCurrent: Math.round(bestCalc.monthlySavings - currentCalc.monthlySavings),
        summary: 'The potential savings difference from the historical window was not substantial.',
      };
    }

    // ── Suppression: monthly savings delta too small (secondary guard) ──
    const monthlySavingsDelta = bestCalc.monthlySavings - currentCalc.monthlySavings;
    if (monthlySavingsDelta < MISSED_OPPORTUNITY_MIN_SAVINGS_DELTA_USD) {
      return {
        hasMissedOpportunity: false,
        bestHistoricalRate30yr: bestSnapshot.rate30yr,
        bestHistoricalDate: bestSnapshot.date,
        bestMonthlySavingsAtPeak:
          bestCalc.monthlySavings > 0 ? Math.round(bestCalc.monthlySavings) : null,
        deltaVsCurrent: Math.round(monthlySavingsDelta),
        summary: 'Historical rates offered only a marginal improvement over current levels.',
      };
    }

    const approxMonthsAgo = Math.max(
      1,
      Math.round(
        (Date.now() - new Date(bestSnapshot.date).getTime()) / (30 * 24 * 60 * 60 * 1000),
      ),
    );

    // Calm, informative tone — not judgmental
    const summary =
      `Rates were lower approximately ${approxMonthsAgo} month${approxMonthsAgo !== 1 ? 's' : ''} ago ` +
      `(${bestSnapshot.rate30yr.toFixed(3)}% vs ${currentSnapshot.rate30yr.toFixed(3)}% today). ` +
      `A stronger refinance window existed then, with estimated monthly savings of ` +
      `$${Math.round(bestCalc.monthlySavings).toLocaleString()} vs ` +
      `$${Math.round(currentCalc.monthlySavings).toLocaleString()} at current rates.`;

    return {
      hasMissedOpportunity: true,
      bestHistoricalRate30yr: bestSnapshot.rate30yr,
      bestHistoricalDate: bestSnapshot.date,
      bestMonthlySavingsAtPeak: Math.round(bestCalc.monthlySavings),
      deltaVsCurrent: Math.round(monthlySavingsDelta),
      summary,
    };
  }
}
