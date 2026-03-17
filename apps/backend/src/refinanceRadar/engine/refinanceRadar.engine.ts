// apps/backend/src/refinanceRadar/engine/refinanceRadar.engine.ts
//
// Opportunity detection, confidence classification, and missed-opportunity analysis.
// Pure computation only — no DB writes. The service layer handles persistence.

import { RefinanceConfidenceLevel, RefinanceRadarState } from '@prisma/client';
import {
  CONFIDENCE_THRESHOLDS,
  MISSED_OPPORTUNITY_LOOKBACK_DAYS,
  MISSED_OPPORTUNITY_MIN_SAVINGS_DELTA_USD,
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
 * Derive a confidence level from the break-even period.
 * Only called when an opportunity has already been confirmed as qualifying.
 */
export function classifyConfidence(
  breakEvenMonths: number,
): RefinanceConfidenceLevel {
  if (breakEvenMonths <= CONFIDENCE_THRESHOLDS.STRONG) {
    return RefinanceConfidenceLevel.STRONG;
  }
  if (breakEvenMonths <= CONFIDENCE_THRESHOLDS.GOOD) {
    return RefinanceConfidenceLevel.GOOD;
  }
  return RefinanceConfidenceLevel.WEAK;
}

// ─── Radar Summary Text ───────────────────────────────────────────────────────

function buildRadarSummary(result: RadarEvaluationResult): string {
  if (!result.isOpportunity) {
    if (result.rateGapPct <= 0) {
      return `Current market rates (${result.marketRatePct.toFixed(3)}%) are at or above your mortgage rate. No refinance opportunity at this time.`;
    }
    return `The rate gap of ${result.rateGapPct.toFixed(3)}% does not yet meet the threshold for an actionable refinance opportunity.`;
  }

  const confidence = result.confidenceLevel;
  const breakEven = result.breakEvenMonths;

  if (confidence === RefinanceConfidenceLevel.STRONG) {
    return (
      `Rates are now low enough that refinancing may break even in ${breakEven} months — ` +
      `a strong window with an estimated $${Math.round(result.monthlySavings).toLocaleString()}/month in savings.`
    );
  }
  if (confidence === RefinanceConfidenceLevel.GOOD) {
    return (
      `A meaningful refinance window is open. Estimated break-even is ${breakEven} months, ` +
      `with potential monthly savings of $${Math.round(result.monthlySavings).toLocaleString()}.`
    );
  }
  return (
    `A marginal refinance opportunity exists. Break-even is ${breakEven} months — ` +
    `consider your plans for the property before proceeding.`
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
   * Returns a fully annotated RadarEvaluationResult — no DB writes occur here.
   */
  async evaluate(mortgageInput: MortgageInputContext): Promise<RadarEvaluationResult & { summary: string; latestSnapshotId: string | null }> {
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
      };
      return { ...empty, summary: empty.notQualifiedReasons[0], latestSnapshotId: null };
    }

    const marketRatePct = latestSnapshot.rate30yr;

    const calcResult = calcRefinanceScenario({
      loanBalance: mortgageInput.loanBalance,
      currentRatePct: mortgageInput.currentRatePct,
      remainingTermMonths: mortgageInput.remainingTermMonths,
      currentMonthlyPayment: mortgageInput.currentMonthlyPayment,
      targetRatePct: marketRatePct,
      targetTermMonths: 360, // 30-year refinance as radar benchmark
    });

    const notQualifiedReasons: string[] = [];

    if (calcResult.rateGapPct < REFINANCE_THRESHOLDS.MIN_RATE_GAP_PCT) {
      notQualifiedReasons.push(
        `Rate gap (${calcResult.rateGapPct.toFixed(3)}%) is below the ${REFINANCE_THRESHOLDS.MIN_RATE_GAP_PCT}% minimum.`,
      );
    }
    if (mortgageInput.remainingTermMonths < REFINANCE_THRESHOLDS.MIN_REMAINING_TERM_MONTHS) {
      notQualifiedReasons.push(
        `Remaining term (${mortgageInput.remainingTermMonths} months) is below the ${REFINANCE_THRESHOLDS.MIN_REMAINING_TERM_MONTHS}-month minimum.`,
      );
    }
    if (mortgageInput.loanBalance < REFINANCE_THRESHOLDS.MIN_LOAN_BALANCE_USD) {
      notQualifiedReasons.push(
        `Loan balance ($${mortgageInput.loanBalance.toLocaleString()}) is below the $${REFINANCE_THRESHOLDS.MIN_LOAN_BALANCE_USD.toLocaleString()} minimum.`,
      );
    }
    if (calcResult.monthlySavings < REFINANCE_THRESHOLDS.MIN_MONTHLY_SAVINGS_USD) {
      notQualifiedReasons.push(
        `Estimated monthly savings ($${Math.round(calcResult.monthlySavings)}) are below the $${REFINANCE_THRESHOLDS.MIN_MONTHLY_SAVINGS_USD} minimum.`,
      );
    }
    if (calcResult.lifetimeSavings < REFINANCE_THRESHOLDS.MIN_LIFETIME_SAVINGS_USD) {
      notQualifiedReasons.push(
        `Projected lifetime savings ($${Math.round(calcResult.lifetimeSavings).toLocaleString()}) are below the $${REFINANCE_THRESHOLDS.MIN_LIFETIME_SAVINGS_USD.toLocaleString()} minimum.`,
      );
    }
    if (
      calcResult.breakEvenMonths !== null &&
      calcResult.breakEvenMonths > REFINANCE_THRESHOLDS.MAX_BREAK_EVEN_MONTHS_OPPORTUNITY
    ) {
      notQualifiedReasons.push(
        `Break-even period (${calcResult.breakEvenMonths} months) exceeds the ${REFINANCE_THRESHOLDS.MAX_BREAK_EVEN_MONTHS_OPPORTUNITY}-month maximum.`,
      );
    }

    const isOpportunity = notQualifiedReasons.length === 0;
    const radarState = isOpportunity ? RefinanceRadarState.OPEN : RefinanceRadarState.CLOSED;

    let confidenceLevel: RefinanceConfidenceLevel | null = null;
    if (isOpportunity && calcResult.breakEvenMonths !== null) {
      confidenceLevel = classifyConfidence(calcResult.breakEvenMonths);
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
    };

    return {
      ...evalResult,
      summary: buildRadarSummary(evalResult),
      latestSnapshotId: latestSnapshot.id,
    };
  }

  /**
   * Evaluate whether a materially better refinance window existed in recent history.
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

    // Current market (most recent snapshot in lookback window)
    const currentSnapshot = historicalSnapshots[historicalSnapshots.length - 1];

    // Find the snapshot with the lowest 30yr rate (best opportunity)
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
        summary: 'Current rates are at or near the best levels seen recently. No missed opportunity detected.',
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

    const savingsDelta = bestCalc.monthlySavings - currentCalc.monthlySavings;

    if (savingsDelta < MISSED_OPPORTUNITY_MIN_SAVINGS_DELTA_USD) {
      return {
        hasMissedOpportunity: false,
        bestHistoricalRate30yr: bestSnapshot.rate30yr,
        bestHistoricalDate: bestSnapshot.date,
        bestMonthlySavingsAtPeak: bestCalc.monthlySavings > 0 ? Math.round(bestCalc.monthlySavings) : null,
        deltaVsCurrent: Math.round(savingsDelta),
        summary: 'Historical rates were only marginally better. No significant missed opportunity detected.',
      };
    }

    const approxMonthsAgo = Math.max(
      1,
      Math.round(
        (Date.now() - new Date(bestSnapshot.date).getTime()) / (30 * 24 * 60 * 60 * 1000),
      ),
    );

    const summary =
      `A stronger refinance window was available approximately ${approxMonthsAgo} month${approxMonthsAgo !== 1 ? 's' : ''} ago ` +
      `when the 30-year rate was ${bestSnapshot.rate30yr.toFixed(3)}%. ` +
      `Estimated monthly savings at that point would have been approximately $${Math.round(bestCalc.monthlySavings).toLocaleString()}, ` +
      `compared to $${Math.round(currentCalc.monthlySavings).toLocaleString()} at current rates.`;

    return {
      hasMissedOpportunity: true,
      bestHistoricalRate30yr: bestSnapshot.rate30yr,
      bestHistoricalDate: bestSnapshot.date,
      bestMonthlySavingsAtPeak: Math.round(bestCalc.monthlySavings),
      deltaVsCurrent: Math.round(savingsDelta),
      summary,
    };
  }
}
