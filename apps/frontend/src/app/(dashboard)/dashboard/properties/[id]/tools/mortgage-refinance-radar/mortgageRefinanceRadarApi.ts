// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/mortgage-refinance-radar/mortgageRefinanceRadarApi.ts
import { api } from '@/lib/api/client';
import type { PropertyContextEnvelope } from '@/components/property-context/propertyContextTypes';
import type { PropertyFinancingProfile } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export type RefinanceRadarState = 'OPEN' | 'CLOSED';
export type RefinanceConfidenceLevel = 'WEAK' | 'GOOD' | 'STRONG';
export type RefinanceScenarioTerm = 'THIRTY_YEAR' | 'TWENTY_YEAR' | 'FIFTEEN_YEAR';

export type RateTrendSummary = {
  current30yr: number | null;
  current15yr: number | null;
  prior30yr: number | null;
  deltaWeeks: number;
  trend30yr: 'RISING' | 'FALLING' | 'STABLE' | 'UNKNOWN';
  trendLabel: string;
};

export type MissedOpportunityInsight = {
  hasMissedOpportunity: boolean;
  bestHistoricalRate30yr: number | null;
  bestHistoricalDate: string | null;
  bestMonthlySavingsAtPeak: number | null;
  deltaVsCurrent: number | null;
  summary: string;
};

export type RadarStatusAvailable = {
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
  triggerRatePct?: number | null;
  triggerRateExplanation?: string;
  topDecisionFactors?: string[];
  mortgageDataAsOf?: string | null;
  mortgageDataFreshness?: 'CURRENT' | 'AGING' | 'STALE' | 'UNKNOWN';
  mortgageDataAgeDays?: number | null;
  marketDataAsOf?: string | null;
  marketDataFreshness?: 'CURRENT' | 'AGING' | 'STALE' | 'UNKNOWN';
  marketDataAgeDays?: number | null;
  marketDataSource?: string | null;
  alertReadiness?: 'READY' | 'REVIEW_MORTGAGE_DATA' | 'WAITING_FOR_MARKET_DATA';
  freshnessWarnings?: string[];
  disclaimer: string;
};

export type RadarStatusUnavailable = {
  available: false;
  reason: 'MISSING_MORTGAGE_DATA' | 'NO_MORTGAGE' | 'NO_RATE_DATA' | 'PROPERTY_NOT_FOUND';
  missingFields?: Array<'currentMortgageBalance' | 'interestRate' | 'remainingTerm'>;
  trendSummary?: RateTrendSummary;
  rateDataFreshnessAt?: string | null;
  shouldPromptForMortgageDetails?: boolean;
};

export type RadarStatusDTO = (RadarStatusAvailable | RadarStatusUnavailable) & {
  propertyContext?: PropertyContextEnvelope;
  propertyContextVersion?: string | null;
};

export type RefinanceOpportunityDTO = {
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
};

export type ScenarioAssumptions = {
  loanBalance: number;
  currentRatePct: number;
  remainingTermMonths: number;
  closingCostSource: 'PROVIDED_AMOUNT' | 'PROVIDED_PCT' | 'DEFAULT_2_5_PCT';
  closingCostPctUsed: number;
};

export type RefinanceScenarioResult = {
  propertyContext?: PropertyContextEnvelope;
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
  assumptions: ScenarioAssumptions;
  disclaimer: string;
};

export type RefinanceScenarioSnapshotDTO = {
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
};

export type MortgageRateSnapshotDTO = {
  id: string;
  date: string;
  rate30yr: number;
  rate15yr: number;
  source: string;
  sourceRef: string | null;
  createdAt: string;
};

export type RefinanceTransitionDTO = {
  id: string;
  transitionType: 'OPEN' | 'UPDATE' | 'CLOSED';
  previousState: RefinanceRadarState | null;
  nextState: RefinanceRadarState;
  snapshotId: string;
  opportunityId: string | null;
  materialChangeReasons: string[];
  occurredAt: string;
};

export type RateHistoryDTO = {
  snapshots: MortgageRateSnapshotDTO[];
  trendSummary: RateTrendSummary;
  transitions?: RefinanceTransitionDTO[];
  initialRadarState?: RefinanceRadarState;
};

export type OpportunityHistoryDTO = {
  opportunities: RefinanceOpportunityDTO[];
  total: number;
  limit: number;
  offset: number;
};

// ─── API Functions ────────────────────────────────────────────────────────────

export async function getRadarStatus(propertyId: string): Promise<RadarStatusDTO | null> {
  const res = await api.get(`/api/properties/${propertyId}/refinance-radar`);
  const status = res.data?.radarStatus as RadarStatusDTO | undefined;
  return status ? { ...status, propertyContext: res.data?.propertyContext } : null;
}

export async function evaluateRadar(propertyId: string): Promise<RadarStatusDTO | null> {
  const res = await api.post(`/api/properties/${propertyId}/refinance-radar/evaluate`, {});
  const status = res.data?.radarStatus as RadarStatusDTO | undefined;
  return status ? { ...status, propertyContext: res.data?.propertyContext } : null;
}

export async function getOpportunityHistory(
  propertyId: string,
  limit = 20,
  offset = 0,
): Promise<OpportunityHistoryDTO> {
  const res = await api.get(
    `/api/properties/${propertyId}/refinance-radar/history?limit=${limit}&offset=${offset}`,
  );
  return res.data as OpportunityHistoryDTO;
}

export async function getMissedOpportunity(
  propertyId: string,
): Promise<MissedOpportunityInsight | null> {
  const res = await api.get(`/api/properties/${propertyId}/refinance-radar/missed-opportunity`);
  return (res.data?.missedOpportunity as MissedOpportunityInsight) ?? null;
}

export async function getRateHistory(
  propertyId: string,
  limit = 12,
): Promise<RateHistoryDTO> {
  const res = await api.get(
    `/api/properties/${propertyId}/refinance-radar/rates?limit=${limit}`,
  );
  return res.data as RateHistoryDTO;
}

export async function runScenario(
  propertyId: string,
  body: {
    targetRate: number;
    targetTerm: RefinanceScenarioTerm;
    closingCostAmount?: number;
    saveScenario?: boolean;
  },
): Promise<RefinanceScenarioResult> {
  const res = await api.post(`/api/properties/${propertyId}/refinance-scenario`, body);
  return {
    ...(res.data?.scenario as RefinanceScenarioResult),
    propertyContext: res.data?.propertyContext,
  };
}

export async function getSavedScenarios(
  propertyId: string,
): Promise<RefinanceScenarioSnapshotDTO[]> {
  const res = await api.get(`/api/properties/${propertyId}/refinance-scenario/saved`);
  return (res.data?.scenarios as RefinanceScenarioSnapshotDTO[]) ?? [];
}

/**
 * Read the canonical mortgage profile owned by Financing Center.
 *
 * The radar deliberately does not maintain a second copy of these inputs.
 * This read lets the unavailable state preserve and display facts the user
 * has already supplied instead of presenting a blank duplicate form.
 */
export async function getFinancingMortgageProfile(
  propertyId: string,
): Promise<PropertyFinancingProfile | null> {
  return api.getFinancingProfile(propertyId);
}

export async function saveFinancingProfile(
  propertyId: string,
  body: {
    mortgageBalance: number;
    interestRate: number; // decimal form, e.g. 0.0625 for 6.25%
    remainingTermMonths: number;
    monthlyPayment?: number;
  },
): Promise<void> {
  await api.put(`/api/properties/${propertyId}/financing/profile`, {
    currentMortgageBalanceCents: Math.round(body.mortgageBalance * 100),
    interestRateBps: Math.round(body.interestRate * 10_000),
    remainingTermMonths: body.remainingTermMonths,
    ...(body.monthlyPayment != null ? { monthlyPaymentCents: Math.round(body.monthlyPayment * 100) } : {}),
    mortgageBalanceAsOfDate: new Date().toISOString(),
  });
}
