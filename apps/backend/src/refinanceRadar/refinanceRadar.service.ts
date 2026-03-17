// apps/backend/src/refinanceRadar/refinanceRadar.service.ts
//
// Orchestrates radar evaluation, DB persistence, and read APIs for the
// Mortgage Refinance Radar feature. All methods are property-scoped.

import { RefinanceConfidenceLevel, RefinanceRadarState, RefinanceScenarioTerm } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { REFINANCE_DISCLAIMER, RATE_TREND_LOOKBACK_SNAPSHOTS } from './config/refinanceRadar.config';
import {
  calcRefinanceScenario,
  TERM_TO_MONTHS,
} from './engine/refinanceCalculation.engine';
import { MortgageRateService } from './engine/mortgageRate.service';
import { RefinanceRadarEngine } from './engine/refinanceRadar.engine';
import {
  mapOpportunityToDTO,
  mapScenarioToDTO,
} from './mappers/refinanceRadar.mapper';
import {
  MissedOpportunityInsight,
  MortgageInputContext,
  RadarStatusResult,
  RefinanceOpportunityDTO,
  RefinanceScenarioResult,
  RefinanceScenarioSnapshotDTO,
  ScenarioAssumptions,
} from './types/refinanceRadar.types';
import { IngestSnapshotInput } from './engine/mortgageRate.service';
import { MortgageRateSnapshotDTO } from './types/refinanceRadar.types';
import { DEFAULT_CLOSING_COST_PCT } from './config/refinanceRadar.config';

// ─── Service ──────────────────────────────────────────────────────────────────

export class RefinanceRadarService {
  private rateService: MortgageRateService;
  private engine: RefinanceRadarEngine;

  constructor() {
    this.rateService = new MortgageRateService();
    this.engine = new RefinanceRadarEngine(this.rateService);
  }

  // ── Internal helpers ─────────────────────────────────────────────────────────

  /**
   * Extract normalized mortgage context from PropertyFinanceSnapshot.
   *
   * IMPORTANT: PropertyFinanceSnapshot stores interestRate as a decimal fraction
   * (e.g., 0.0625 for 6.25%). The engine works in percentage form (6.25).
   * Conversion happens here — all engine inputs use percentage form.
   */
  private async getMortgageContext(
    propertyId: string,
  ): Promise<MortgageInputContext | null> {
    const snap = await prisma.propertyFinanceSnapshot.findUnique({
      where: { propertyId },
    });

    if (
      !snap ||
      snap.mortgageBalance == null ||
      snap.interestRate == null ||
      snap.remainingTermMonths == null
    ) {
      return null;
    }

    return {
      loanBalance: snap.mortgageBalance,
      currentRatePct: snap.interestRate * 100, // fraction → percentage
      remainingTermMonths: snap.remainingTermMonths,
      currentMonthlyPayment: snap.monthlyPayment ?? undefined,
    };
  }

  // ── Radar State Persistence ───────────────────────────────────────────────────

  /**
   * Persist a RefinanceOpportunity record and transition PropertyRefinanceRadarState.
   *
   * Transition rules:
   * - CLOSED → OPEN: create opportunity, record lastOpenedAt, link as currentOpportunity
   * - OPEN  → OPEN:  create opportunity (for history), do NOT re-open or reset lastOpenedAt
   * - OPEN  → CLOSED: clear currentOpportunityId, record lastClosedAt
   * - CLOSED → CLOSED: update lastEvaluatedAt only; no new opportunity record needed
   */
  private async persistEvaluationResult(
    propertyId: string,
    evalResult: Awaited<ReturnType<RefinanceRadarEngine['evaluate']>>,
    latestSnapshotId: string | null,
  ): Promise<void> {
    const now = new Date();

    // Normalize evaluation date to midnight UTC
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const currentState = await prisma.propertyRefinanceRadarState.findUnique({
      where: { propertyId },
    });

    const previousRadarState: RefinanceRadarState | null = currentState?.radarState ?? null;
    const isTransitionToOpen =
      evalResult.radarState === RefinanceRadarState.OPEN &&
      previousRadarState !== RefinanceRadarState.OPEN;
    const isTransitionToClose =
      evalResult.radarState === RefinanceRadarState.CLOSED &&
      previousRadarState === RefinanceRadarState.OPEN;

    // Create opportunity record only when:
    // - transitioning to OPEN (new window opened), or
    // - already OPEN and a new day (preserves historical trail, avoids same-day dupes)
    let newOpportunityId: string | null = null;

    if (evalResult.isOpportunity) {
      // Check for same-day record to avoid noisy duplicate creation
      const existingTodayOpportunity = await prisma.refinanceOpportunity.findFirst({
        where: {
          propertyId,
          evaluationDate: today,
          radarState: RefinanceRadarState.OPEN,
        },
        select: { id: true },
      });

      if (!existingTodayOpportunity) {
        const created = await prisma.refinanceOpportunity.create({
          data: {
            propertyId,
            currentRate: evalResult.currentRatePct,
            marketRate: evalResult.marketRatePct,
            rateGap: evalResult.rateGapPct,
            loanBalance: evalResult.loanBalance,
            monthlySavings: evalResult.monthlySavings,
            breakEvenMonths: evalResult.breakEvenMonths ?? 0,
            lifetimeSavings: evalResult.lifetimeSavings,
            confidenceLevel: evalResult.confidenceLevel as RefinanceConfidenceLevel,
            radarState: RefinanceRadarState.OPEN,
            evaluationDate: today,
            triggerDate: isTransitionToOpen ? now : undefined,
            closingCostAssumption: evalResult.effectiveClosingCostUsd,
            remainingTermMonths: evalResult.remainingTermMonths,
          },
          select: { id: true },
        });
        newOpportunityId = created.id;
      } else {
        newOpportunityId = existingTodayOpportunity.id;
      }
    }

    // Upsert the current radar state
    const radarStateUpdate = {
      radarState: evalResult.radarState,
      lastEvaluatedAt: now,
      lastRateSnapshotId: latestSnapshotId,
      currentOpportunityId: evalResult.isOpportunity
        ? (newOpportunityId ?? currentState?.currentOpportunityId ?? null)
        : null,
      ...(isTransitionToOpen && { lastOpenedAt: now }),
      ...(isTransitionToClose && { lastClosedAt: now }),
    };

    await prisma.propertyRefinanceRadarState.upsert({
      where: { propertyId },
      create: {
        propertyId,
        ...radarStateUpdate,
      },
      update: radarStateUpdate,
    });
  }

  // ── Public API Methods ────────────────────────────────────────────────────────

  /**
   * Evaluate the current refinance radar status for a property.
   * Persists results and returns a complete status response.
   * Safe to call repeatedly — deduplicates same-day opportunity records.
   */
  async evaluateProperty(propertyId: string): Promise<RadarStatusResult> {
    const mortgageContext = await this.getMortgageContext(propertyId);
    if (!mortgageContext) {
      return { available: false, reason: 'MISSING_MORTGAGE_DATA' };
    }

    const evalResult = await this.engine.evaluate(mortgageContext);

    // Persist opportunity + radar state transition (fire-and-settle)
    await this.persistEvaluationResult(propertyId, evalResult, evalResult.latestSnapshotId);

    // Load trend and missed opportunity in parallel
    const [recentSnapshots, missedOpportunity] = await Promise.all([
      this.rateService.getRecentSnapshots(RATE_TREND_LOOKBACK_SNAPSHOTS),
      this.engine.evaluateMissedOpportunity(mortgageContext),
    ]);
    const trendSummary = this.rateService.computeTrendSummary(recentSnapshots);

    // Load the persisted radar state for lastEvaluatedAt
    const radarState = await prisma.propertyRefinanceRadarState.findUnique({
      where: { propertyId },
      select: { lastEvaluatedAt: true },
    });

    return {
      available: true,
      radarState: evalResult.radarState,
      confidenceLevel: evalResult.confidenceLevel,
      currentRatePct: evalResult.currentRatePct,
      marketRatePct: evalResult.marketRatePct,
      rateGapPct: evalResult.rateGapPct,
      loanBalance: evalResult.loanBalance,
      monthlySavings: evalResult.monthlySavings,
      breakEvenMonths: evalResult.breakEvenMonths,
      lifetimeSavings: evalResult.lifetimeSavings,
      closingCostAssumptionUsd: evalResult.effectiveClosingCostUsd,
      remainingTermMonths: evalResult.remainingTermMonths,
      lastEvaluatedAt: radarState?.lastEvaluatedAt?.toISOString() ?? null,
      trendSummary,
      radarSummary: evalResult.summary,
      missedOpportunitySummary: missedOpportunity.hasMissedOpportunity ? missedOpportunity : null,
      notQualifiedReasons: evalResult.notQualifiedReasons,
      disclaimer: REFINANCE_DISCLAIMER,
    };
  }

  /**
   * Return the current radar status without re-evaluating.
   * Reads from the persisted radar state and most recent opportunity.
   * Falls back to a live evaluation if no state exists yet.
   */
  async getCurrentStatus(propertyId: string): Promise<RadarStatusResult> {
    const mortgageContext = await this.getMortgageContext(propertyId);
    if (!mortgageContext) {
      return { available: false, reason: 'MISSING_MORTGAGE_DATA' };
    }

    const radarState = await prisma.propertyRefinanceRadarState.findUnique({
      where: { propertyId },
      include: { currentOpportunity: true },
    });

    // No state persisted yet — run a live evaluation to initialize
    if (!radarState) {
      return this.evaluateProperty(propertyId);
    }

    const [recentSnapshots, missedOpportunity] = await Promise.all([
      this.rateService.getRecentSnapshots(RATE_TREND_LOOKBACK_SNAPSHOTS),
      this.engine.evaluateMissedOpportunity(mortgageContext),
    ]);
    const trendSummary = this.rateService.computeTrendSummary(recentSnapshots);

    const opp = radarState.currentOpportunity;

    // Build a summary from stored state
    let radarSummary: string;
    if (radarState.radarState === RefinanceRadarState.OPEN && opp) {
      const savedBreakEven = opp.breakEvenMonths;
      radarSummary = `A refinance window is open — break-even estimated at ${savedBreakEven} months with approximately $${Math.round(opp.monthlySavings.toNumber()).toLocaleString()}/month in savings.`;
    } else {
      radarSummary = 'No actionable refinance opportunity detected at the last evaluation.';
    }

    return {
      available: true,
      radarState: radarState.radarState,
      confidenceLevel: opp?.confidenceLevel ?? null,
      currentRatePct: mortgageContext.currentRatePct,
      marketRatePct: recentSnapshots[0]?.rate30yr ?? 0,
      rateGapPct: opp?.rateGap ?? 0,
      loanBalance: opp?.loanBalance.toNumber() ?? mortgageContext.loanBalance,
      monthlySavings: opp?.monthlySavings.toNumber() ?? 0,
      breakEvenMonths: opp?.breakEvenMonths ?? null,
      lifetimeSavings: opp?.lifetimeSavings.toNumber() ?? 0,
      closingCostAssumptionUsd: opp?.closingCostAssumption?.toNumber() ?? 0,
      remainingTermMonths: opp?.remainingTermMonths ?? mortgageContext.remainingTermMonths,
      lastEvaluatedAt: radarState.lastEvaluatedAt?.toISOString() ?? null,
      trendSummary,
      radarSummary,
      missedOpportunitySummary: missedOpportunity.hasMissedOpportunity ? missedOpportunity : null,
      notQualifiedReasons: [],
      disclaimer: REFINANCE_DISCLAIMER,
    };
  }

  /**
   * Return paginated history of refinance opportunity evaluations for a property.
   */
  async getOpportunityHistory(
    propertyId: string,
    limit: number,
    offset: number,
  ): Promise<{ opportunities: RefinanceOpportunityDTO[]; total: number }> {
    const [rows, total] = await prisma.$transaction([
      prisma.refinanceOpportunity.findMany({
        where: { propertyId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.refinanceOpportunity.count({ where: { propertyId } }),
    ]);

    return {
      opportunities: rows.map(mapOpportunityToDTO),
      total,
    };
  }

  /**
   * Return the missed-opportunity insight for the most recent lookback window.
   */
  async getMissedOpportunity(propertyId: string): Promise<MissedOpportunityInsight> {
    const mortgageContext = await this.getMortgageContext(propertyId);
    if (!mortgageContext) {
      return {
        hasMissedOpportunity: false,
        bestHistoricalRate30yr: null,
        bestHistoricalDate: null,
        bestMonthlySavingsAtPeak: null,
        deltaVsCurrent: null,
        summary: 'Mortgage data is not available for this property.',
      };
    }
    return this.engine.evaluateMissedOpportunity(mortgageContext);
  }

  /**
   * Return recent market rate snapshots and trend summary.
   */
  async getRateHistory(
    limit: number,
  ): Promise<{ snapshots: MortgageRateSnapshotDTO[]; trendSummary: ReturnType<MortgageRateService['computeTrendSummary']> }> {
    const snapshots = await this.rateService.getRecentSnapshots(limit);
    const trendSummary = this.rateService.computeTrendSummary(snapshots);
    return { snapshots, trendSummary };
  }

  /**
   * Run a refinance scenario calculation and optionally persist it.
   */
  async runScenario(
    propertyId: string,
    input: {
      targetRate: number;
      targetTerm: RefinanceScenarioTerm;
      closingCostAmount?: number;
      closingCostPercent?: number;
      saveScenario: boolean;
    },
  ): Promise<RefinanceScenarioResult> {
    const mortgageContext = await this.getMortgageContext(propertyId);
    if (!mortgageContext) {
      throw new APIError(
        'Mortgage data is not available for this property. Please update your mortgage information first.',
        422,
        'MISSING_MORTGAGE_DATA',
      );
    }

    const targetTermMonths = TERM_TO_MONTHS[input.targetTerm];

    // Determine closing cost source for assumptions metadata
    let closingCostSource: ScenarioAssumptions['closingCostSource'];
    let closingCostPctUsed: number;
    if (input.closingCostAmount) {
      closingCostSource = 'PROVIDED_AMOUNT';
      closingCostPctUsed = input.closingCostAmount / mortgageContext.loanBalance;
    } else if (input.closingCostPercent) {
      closingCostSource = 'PROVIDED_PCT';
      closingCostPctUsed = input.closingCostPercent;
    } else {
      closingCostSource = 'DEFAULT_2_5_PCT';
      closingCostPctUsed = DEFAULT_CLOSING_COST_PCT;
    }

    const calcResult = calcRefinanceScenario({
      loanBalance: mortgageContext.loanBalance,
      currentRatePct: mortgageContext.currentRatePct,
      remainingTermMonths: mortgageContext.remainingTermMonths,
      currentMonthlyPayment: mortgageContext.currentMonthlyPayment,
      targetRatePct: input.targetRate,
      targetTermMonths,
      closingCostUsd: input.closingCostAmount,
      closingCostPct: input.closingCostPercent,
    });

    // Persist if requested
    if (input.saveScenario) {
      await prisma.refinanceScenarioSnapshot.create({
        data: {
          propertyId,
          targetRate: input.targetRate,
          targetTerm: input.targetTerm,
          closingCost: calcResult.effectiveClosingCostUsd,
          monthlySavings: calcResult.monthlySavings,
          breakEvenMonths: calcResult.breakEvenMonths ?? undefined,
          lifetimeSavings: calcResult.lifetimeSavings,
          isSaved: true,
          metadataJson: {
            closingCostSource,
            closingCostPctUsed,
            computedAt: new Date().toISOString(),
          },
        },
      });
    }

    return {
      targetRatePct: input.targetRate,
      targetTerm: input.targetTerm,
      targetTermMonths,
      currentMonthlyPayment: calcResult.currentMonthlyPayment,
      newMonthlyPayment: calcResult.newMonthlyPayment,
      monthlySavings: calcResult.monthlySavings,
      breakEvenMonths: calcResult.breakEvenMonths,
      lifetimeSavings: calcResult.lifetimeSavings,
      closingCostUsd: calcResult.effectiveClosingCostUsd,
      payoffDeltaMonths: calcResult.payoffDeltaMonths,
      totalInterestRemainingCurrent: calcResult.totalInterestRemainingCurrent,
      totalInterestNewLoan: calcResult.totalInterestNewLoan,
      rateGapPct: calcResult.rateGapPct,
      assumptions: {
        loanBalance: mortgageContext.loanBalance,
        currentRatePct: mortgageContext.currentRatePct,
        remainingTermMonths: mortgageContext.remainingTermMonths,
        closingCostSource,
        closingCostPctUsed,
      },
      disclaimer: REFINANCE_DISCLAIMER,
    };
  }

  /**
   * Return saved refinance scenario snapshots for a property.
   */
  async getSavedScenarios(propertyId: string): Promise<RefinanceScenarioSnapshotDTO[]> {
    const rows = await prisma.refinanceScenarioSnapshot.findMany({
      where: { propertyId, isSaved: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map(mapScenarioToDTO);
  }

  /**
   * Ingest a market rate snapshot (admin / scheduled orchestration seam).
   */
  async ingestRateSnapshot(
    input: IngestSnapshotInput,
  ): Promise<{ snapshot: MortgageRateSnapshotDTO; created: boolean }> {
    return this.rateService.ingestSnapshot(input);
  }
}
