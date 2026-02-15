import { api } from './client';

export type ReplaceRepairRiskTolerance = 'LOW' | 'MEDIUM' | 'HIGH';
export type ReplaceRepairUsageIntensity = 'LOW' | 'MEDIUM' | 'HIGH';

export type ReplaceRepairOverrides = {
  estimatedNextRepairCostCents?: number;
  estimatedReplacementCostCents?: number;
  expectedRemainingYears?: number;
  cashBufferCents?: number;
  riskTolerance?: ReplaceRepairRiskTolerance;
  usageIntensity?: ReplaceRepairUsageIntensity;
};

export type ReplaceRepairAnalysisDTO = {
  id: string;
  propertyId: string;
  homeownerProfileId: string;
  inventoryItemId: string;

  status: 'READY' | 'STALE' | 'ERROR';
  verdict: 'REPLACE_NOW' | 'REPLACE_SOON' | 'REPAIR_AND_MONITOR' | 'REPAIR_ONLY';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  impactLevel?: 'LOW' | 'MEDIUM' | 'HIGH';

  summary?: string;

  nextSteps?: Array<{
    title: string;
    detail?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;

  decisionTrace: Array<{
    label: string;
    detail?: string;
    impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  }>;

  ageYears?: number;
  remainingYears?: number;
  estimatedNextRepairCostCents?: number;
  estimatedReplacementCostCents?: number;
  expectedAnnualRepairRiskCents?: number;
  breakEvenMonths?: number | null;

  computedAt: string;
};

export type ReplaceRepairAnalysisStatusResponse =
  | { exists: false }
  | { exists: true; analysis: ReplaceRepairAnalysisDTO };

export async function getReplaceRepairAnalysis(
  propertyId: string,
  itemId: string
): Promise<ReplaceRepairAnalysisStatusResponse> {
  const res = await api.get<ReplaceRepairAnalysisStatusResponse>(
    `/api/properties/${propertyId}/inventory/items/${itemId}/replace-repair`
  );
  return res.data;
}

export async function runReplaceRepairAnalysis(
  propertyId: string,
  itemId: string,
  overrides?: ReplaceRepairOverrides
): Promise<ReplaceRepairAnalysisDTO> {
  const res = await api.post<{ analysis: ReplaceRepairAnalysisDTO }>(
    `/api/properties/${propertyId}/inventory/items/${itemId}/replace-repair/run`,
    { overrides: overrides ?? {} }
  );
  return res.data.analysis;
}
