import { api } from './client';

export type CoverageVerdict = 'WORTH_IT' | 'SITUATIONAL' | 'NOT_WORTH_IT';
export type CoverageConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type CoverageImpactLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type CoverageAnalysisStatus = 'READY' | 'STALE' | 'ERROR';
export type CoverageRiskTolerance = 'LOW' | 'MEDIUM' | 'HIGH';

export type CoverageAnalysisOverrides = {
  annualPremiumUsd?: number;
  deductibleUsd?: number;
  warrantyAnnualCostUsd?: number;
  warrantyServiceFeeUsd?: number;
  cashBufferUsd?: number;
  riskTolerance?: CoverageRiskTolerance;
};

export type CoverageAnalysisDTO = {
  id: string;
  propertyId: string;
  homeownerProfileId: string;
  status: CoverageAnalysisStatus;
  computedAt: string;

  overallVerdict: CoverageVerdict;
  insuranceVerdict: CoverageVerdict;
  warrantyVerdict: CoverageVerdict;

  confidence: CoverageConfidence;
  impactLevel?: CoverageImpactLevel;

  summary?: string;
  nextSteps?: Array<{
    title: string;
    detail?: string;
    priority?: CoverageImpactLevel;
  }>;

  insurance: {
    inputsUsed: { annualPremiumUsd?: number; deductibleUsd?: number; cashBufferUsd?: number };
    flags: Array<{ code: string; label: string; severity: CoverageImpactLevel }>;
    recommendedAddOns: Array<{ code: string; label: string; why: string }>;
  };

  warranty: {
    inputsUsed: { warrantyAnnualCostUsd?: number; warrantyServiceFeeUsd?: number };
    expectedAnnualRepairRiskUsd?: number;
    expectedNetImpactUsd?: number;
    breakEvenMonths?: number | null;
  };

  decisionTrace: Array<{
    label: string;
    detail?: string;
    impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  }>;

  scenarios?: Array<{
    id: string;
    name?: string;
    createdAt: string;
    inputOverrides: any;
    outputSnapshot: any;
  }>;
};

export type CoverageAnalysisStatusResponse =
  | { exists: false }
  | { exists: true; analysis: CoverageAnalysisDTO };

export async function getCoverageAnalysis(
  propertyId: string
): Promise<CoverageAnalysisStatusResponse> {
  const res = await api.get<CoverageAnalysisStatusResponse>(
    `/api/properties/${propertyId}/coverage-analysis`
  );
  return res.data;
}

export async function runCoverageAnalysis(
  propertyId: string,
  overrides?: CoverageAnalysisOverrides
): Promise<CoverageAnalysisDTO> {
  const res = await api.post<{ analysis: CoverageAnalysisDTO }>(
    `/api/properties/${propertyId}/coverage-analysis/run`,
    { overrides: overrides ?? {} }
  );
  return res.data.analysis;
}

export async function simulateCoverageAnalysis(
  propertyId: string,
  overrides?: CoverageAnalysisOverrides,
  saveScenario = false,
  name?: string
): Promise<CoverageAnalysisDTO> {
  const res = await api.post<{ analysis: CoverageAnalysisDTO }>(
    `/api/properties/${propertyId}/coverage-analysis/simulate`,
    {
      overrides: overrides ?? {},
      saveScenario,
      name,
    }
  );
  return res.data.analysis;
}
