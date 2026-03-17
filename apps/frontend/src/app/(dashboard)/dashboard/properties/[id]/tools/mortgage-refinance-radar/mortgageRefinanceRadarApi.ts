// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/mortgage-refinance-radar/mortgageRefinanceRadarApi.ts
import { api } from '@/lib/api/client';

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
  disclaimer: string;
};

export type RadarStatusUnavailable = {
  available: false;
  reason: 'MISSING_MORTGAGE_DATA' | 'NO_RATE_DATA' | 'PROPERTY_NOT_FOUND';
};

export type RadarStatusDTO = RadarStatusAvailable | RadarStatusUnavailable;

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

export type RateHistoryDTO = {
  snapshots: MortgageRateSnapshotDTO[];
  trendSummary: RateTrendSummary;
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
  return (res.data?.radarStatus as RadarStatusDTO) ?? null;
}

export async function evaluateRadar(propertyId: string): Promise<RadarStatusDTO | null> {
  const res = await api.post(`/api/properties/${propertyId}/refinance-radar/evaluate`, {});
  return (res.data?.radarStatus as RadarStatusDTO) ?? null;
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
  return res.data?.scenario as RefinanceScenarioResult;
}

export async function getSavedScenarios(
  propertyId: string,
): Promise<RefinanceScenarioSnapshotDTO[]> {
  const res = await api.get(`/api/properties/${propertyId}/refinance-scenario/saved`);
  return (res.data?.scenarios as RefinanceScenarioSnapshotDTO[]) ?? [];
}
