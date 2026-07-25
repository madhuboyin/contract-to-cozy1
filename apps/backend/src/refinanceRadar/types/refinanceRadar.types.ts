// apps/backend/src/refinanceRadar/types/refinanceRadar.types.ts
//
// TypeScript interfaces for the Mortgage Refinance Radar feature.
// These define internal domain objects and API response shapes.

import { RefinanceConfidenceLevel, RefinanceRadarState, RefinanceScenarioTerm } from '@prisma/client';
import type { RefinanceFreshnessContract } from '../refinanceFreshness';
import type { RefinanceEligibilityContext } from '../refinanceEligibilityContext';
import type {
  RefinanceObjective,
  RefinanceTermAlternative,
} from '../refinanceObjectiveComparison';

// ─── Internal Domain Objects ─────────────────────────────────────────────────

/**
 * Normalized mortgage context extracted from PropertyFinancingProfile.
 * All rates are in percentage form (e.g., 6.25 for 6.25%).
 */
export interface MortgageInputContext {
  loanBalance: number;          // USD
  currentRatePct: number;       // Annual rate as percentage (e.g., 6.25)
  remainingTermMonths: number;
  currentMonthlyPayment?: number; // Optional — computed from amortization if absent
  mortgageDataAsOf?: string | null;
}

/**
 * Raw output from the refinance calculation engine for a single scenario.
 */
export interface RefinanceCalcResult {
  rateGapPct: number;               // currentRate - targetRate (positive = homeowner paying more)
  effectiveClosingCostUsd: number;
  currentMonthlyPayment: number;
  newMonthlyPayment: number;
  monthlySavings: number;           // May be negative when shortening term significantly
  breakEvenMonths: number | null;   // null when monthlySavings <= 0
  totalInterestRemainingCurrent: number;
  totalInterestNewLoan: number;
  lifetimeSavings: number;          // Net interest savings after closing costs
  payoffDeltaMonths: number;        // new term vs remaining current term (negative = faster payoff)
  estimatedAprPct: number;          // Modeled APR including entered net upfront costs
  cashToCloseUsd: number;
  costBreakdown: RefinanceCostBreakdown;
}

export interface RefinanceCostBreakdown {
  baseClosingCostsUsd: number;
  discountPoints: number;
  discountPointsUsd: number;
  additionalFeesUsd: number;
  lenderCreditsUsd: number;
  grossClosingCostsUsd: number;
  netClosingCostsUsd: number;
}

/**
 * Result of evaluating whether a refinance opportunity is actionable.
 */
export interface RadarEvaluationResult {
  isOpportunity: boolean;
  currentRatePct: number;
  marketRatePct: number;            // 30yr benchmark from latest snapshot
  rateGapPct: number;
  loanBalance: number;
  monthlySavings: number;
  breakEvenMonths: number | null;
  lifetimeSavings: number;
  effectiveClosingCostUsd: number;
  remainingTermMonths: number;
  radarState: RefinanceRadarState;
  confidenceLevel: RefinanceConfidenceLevel | null;
  notQualifiedReasons: string[];
  triggerRatePct: number | null;
  triggerRateExplanation: string;
  topDecisionFactors: string[];
}

/**
 * Missed-opportunity insight derived from historical rate snapshots.
 */
export interface MissedOpportunityInsight {
  hasMissedOpportunity: boolean;
  bestHistoricalRate30yr: number | null;
  bestHistoricalDate: string | null;   // YYYY-MM-DD
  bestMonthlySavingsAtPeak: number | null;
  deltaVsCurrent: number | null;       // How much more monthly savings there would have been
  summary: string;
}

/**
 * Rate trend context computed from recent snapshots.
 */
export interface RateTrendSummary {
  current30yr: number | null;
  current15yr: number | null;
  prior30yr: number | null;
  deltaWeeks: number;
  trend30yr: 'RISING' | 'FALLING' | 'STABLE' | 'UNKNOWN';
  trendLabel: string;
}

/**
 * Phase-3: modeled market rate for an individual loan product.
 * ARM/FHA/VA/jumbo rates are estimated as spreads off the 30yr benchmark
 * until live multi-product feed is wired (clearly labeled as modeled).
 */
export interface LoanProductRate {
  product: 'FIXED_30' | 'FIXED_15' | 'ARM_5_1' | 'FHA_30' | 'VA_30' | 'JUMBO_30';
  label: string;
  ratePct: number;
  source: 'LIVE' | 'MODELED_SPREAD';
  spreadNote: string | null;
}

// ─── Service Return Types ────────────────────────────────────────────────────

export interface RadarStatusResponse extends RefinanceFreshnessContract {
  available: true;
  radarState: RefinanceRadarState;
  confidenceLevel: RefinanceConfidenceLevel | null;
  currentRatePct: number;
  marketRatePct: number;
  rateGapPct: number;
  loanBalance: number;
  monthlySavings: number;
  breakEvenMonths: number | null;
  lifetimeSavings: number;
  closingCostAssumptionUsd: number;
  remainingTermMonths: number;
  lastEvaluatedAt: string | null;
  trendSummary: RateTrendSummary;
  radarSummary: string;
  missedOpportunitySummary: MissedOpportunityInsight | null;
  notQualifiedReasons: string[];
  triggerRatePct: number | null;
  triggerRateExplanation: string;
  topDecisionFactors: string[];
  disclaimer: string;
  // Phase-3 additive fields
  rateDataFreshnessAt: string | null;   // ISO date of latest rate snapshot
  loanProducts: LoanProductRate[];       // Modeled rates for multiple loan products
  propertyContextVersion: string | null;
  eligibilityContext: RefinanceEligibilityContext;
}

export interface RadarUnavailableResponse {
  available: false;
  reason: 'MISSING_MORTGAGE_DATA' | 'NO_MORTGAGE' | 'NO_RATE_DATA' | 'PROPERTY_NOT_FOUND';
  missingFields?: Array<'currentMortgageBalance' | 'interestRate' | 'remainingTerm'>;
  trendSummary?: RateTrendSummary;
  rateDataFreshnessAt?: string | null;
  shouldPromptForMortgageDetails?: boolean;
}

export type RadarStatusResult = RadarStatusResponse | RadarUnavailableResponse;

export interface RefinanceOpportunityDTO {
  id: string;
  propertyId: string;
  currentRatePct: number;
  marketRatePct: number;
  rateGapPct: number;
  loanBalance: number;
  monthlySavings: number;
  breakEvenMonths: number;
  lifetimeSavings: number;
  confidenceLevel: RefinanceConfidenceLevel;
  radarState: RefinanceRadarState;
  evaluationDate: string;
  triggerDate: string | null;
  closingCostAssumptionUsd: number | null;
  remainingTermMonths: number | null;
  createdAt: string;
  propertyContextVersion: string | null;
}

export interface RefinanceScenarioResult {
  propertyContextVersion: string;
  targetRatePct: number;
  targetTerm: RefinanceScenarioTerm;
  targetTermMonths: number;
  currentMonthlyPayment: number;
  newMonthlyPayment: number;
  monthlySavings: number;
  breakEvenMonths: number | null;
  lifetimeSavings: number;
  closingCostUsd: number;
  payoffDeltaMonths: number;
  totalInterestRemainingCurrent: number;
  totalInterestNewLoan: number;
  rateGapPct: number;
  estimatedAprPct: number;
  cashToCloseUsd: number;
  costBreakdown: RefinanceCostBreakdown;
  scenarioDate: string;
  currentEstimatedPayoffDate: string;
  newEstimatedPayoffDate: string;
  objective: RefinanceObjective;
  recommendedTerm: RefinanceScenarioTerm;
  recommendationExplanation: string;
  alternatives: RefinanceTermAlternative[];
  assumptions: ScenarioAssumptions;
  disclaimer: string;
}

export interface ScenarioAssumptions {
  loanBalance: number;
  currentRatePct: number;
  remainingTermMonths: number;
  closingCostSource: 'PROVIDED_AMOUNT' | 'PROVIDED_PCT' | 'DEFAULT_2_5_PCT';
  closingCostPctUsed: number;
  discountPoints: number;
  additionalFeesUsd: number;
  lenderCreditsUsd: number;
  aprMethodology: 'MODELED_FROM_NOTE_PAYMENT_AND_NET_UPFRONT_COSTS';
}

export interface RefinanceScenarioSnapshotDTO {
  id: string;
  propertyId: string;
  targetRatePct: number;
  targetTerm: RefinanceScenarioTerm;
  targetTermMonths: number;
  closingCostUsd: number;
  monthlySavings: number | null;
  breakEvenMonths: number | null;
  lifetimeSavings: number | null;
  isSaved: boolean;
  createdAt: string;
  propertyContextVersion: string | null;
  estimatedAprPct: number | null;
  cashToCloseUsd: number | null;
  costBreakdown: RefinanceCostBreakdown | null;
}

export interface MortgageRateSnapshotDTO {
  id: string;
  date: string;
  rate30yr: number;
  rate15yr: number;
  source: string;
  sourceRef: string | null;
  createdAt: string;
}

export interface RefinanceTransitionDTO {
  id: string;
  transitionType: 'OPEN' | 'UPDATE' | 'CLOSED';
  previousState: RefinanceRadarState | null;
  nextState: RefinanceRadarState;
  snapshotId: string;
  opportunityId: string | null;
  materialChangeReasons: string[];
  occurredAt: string;
}
