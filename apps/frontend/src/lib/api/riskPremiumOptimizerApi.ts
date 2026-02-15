import { api } from './client';

export type RiskPremiumRiskTolerance = 'LOW' | 'MEDIUM' | 'HIGH';
export type RiskPremiumSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export type RiskPremiumOptimizerOverrides = {
  annualPremium?: number;
  deductibleAmount?: number;
  cashBuffer?: number;
  riskTolerance?: RiskPremiumRiskTolerance;
  assumeBundled?: boolean;
  assumeNewMitigations?: string[];
};

export type RiskMitigationPlanItemStatus = 'RECOMMENDED' | 'PLANNED' | 'DONE' | 'SKIPPED';

export type RiskPremiumOptimizationDTO = {
  id: string;
  propertyId: string;
  homeownerProfileId: string;
  status: 'READY' | 'STALE' | 'ERROR';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  summary?: string;

  estimatedSavingsMin?: number | null;
  estimatedSavingsMax?: number | null;

  inputs: {
    annualPremium?: number | null;
    deductibleAmount?: number | null;
    cashBuffer?: number | null;
    riskTolerance?: RiskPremiumRiskTolerance | null;
    policyId?: string | null;
  };

  premiumDrivers: Array<{
    code: string;
    title: string;
    detail: string;
    severity: RiskPremiumSeverity;
    relatedPerils?: Array<'WATER' | 'FIRE' | 'WIND_HAIL' | 'THEFT' | 'LIABILITY' | 'ELECTRICAL' | 'OTHER'>;
  }>;

  recommendations: Array<{
    code: string;
    title: string;
    detail: string;
    type: 'MITIGATE' | 'POLICY_LEVER' | 'DOCUMENTATION';
    priority: RiskPremiumSeverity;
    targetPeril?: 'WATER' | 'FIRE' | 'WIND_HAIL' | 'THEFT' | 'LIABILITY' | 'ELECTRICAL' | 'OTHER';
    estimatedCost?: number | null;
    estimatedSavingsMin?: number | null;
    estimatedSavingsMax?: number | null;
    whyThisMatters: string;
  }>;

  planItems: Array<{
    id: string;
    actionType: string;
    status: RiskMitigationPlanItemStatus;
    priority: RiskPremiumSeverity;
    targetPeril?: string | null;
    title?: string | null;
    why: string;
    estimatedCost?: number | null;
    estimatedSavingsMin?: number | null;
    estimatedSavingsMax?: number | null;
    evidenceDocumentId?: string | null;
    linkedHomeEventId?: string | null;
    completedAt?: string | null;
  }>;

  computedAt: string;
};

export type RiskPremiumOptimizerStatusResponse =
  | { exists: false }
  | { exists: true; analysis: RiskPremiumOptimizationDTO };

export type UpdateRiskMitigationPlanItemPayload = {
  status?: RiskMitigationPlanItemStatus;
  completedAt?: string | null;
  evidenceDocumentId?: string | null;
  linkedHomeEventId?: string | null;
};

export async function getRiskPremiumOptimizer(
  propertyId: string
): Promise<RiskPremiumOptimizerStatusResponse> {
  const res = await api.get<RiskPremiumOptimizerStatusResponse>(
    `/api/properties/${propertyId}/risk-premium-optimizer`
  );
  return res.data;
}

export async function runRiskPremiumOptimizer(
  propertyId: string,
  overrides?: RiskPremiumOptimizerOverrides
): Promise<RiskPremiumOptimizationDTO> {
  const res = await api.post<{ analysis: RiskPremiumOptimizationDTO }>(
    `/api/properties/${propertyId}/risk-premium-optimizer/run`,
    { overrides: overrides ?? {} }
  );
  return res.data.analysis;
}

export async function updateRiskMitigationPlanItem(
  propertyId: string,
  planItemId: string,
  payload: UpdateRiskMitigationPlanItemPayload
): Promise<{ planItem: RiskPremiumOptimizationDTO['planItems'][number] }> {
  const res = await api.patch<{ planItem: RiskPremiumOptimizationDTO['planItems'][number] }>(
    `/api/properties/${propertyId}/risk-premium-optimizer/plan-items/${planItemId}`,
    payload
  );
  return res.data;
}
