import { api } from './client';

export type CoverageVerdict = 'WORTH_IT' | 'SITUATIONAL' | 'NOT_WORTH_IT';
export type CoverageConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type CoverageImpactLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type CoverageAnalysisStatus = 'READY' | 'STALE' | 'ERROR';
export type CoverageRiskTolerance = 'LOW' | 'MEDIUM' | 'HIGH';

export type CoverageReviewQuestionDTO = {
  id: string;
  questionKey: string;
  questionType: 'EVIDENCE_BASED' | 'GENERAL';
  category: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  isPrimary: boolean;
  status: 'OPEN' | 'RESOLVED' | 'DISMISSED';
  plainLanguageQuestion: string;
  whyItMatters: string;
  evidenceJson: Array<{
    factId?: string;
    factKey?: string;
    confirmationStatus?: string;
    sourceDocumentId?: string | null;
    sourcePage?: number | null;
    policyTermId?: string;
    verificationStatus?: string;
    termEnd?: string;
  }>;
  missingEvidenceJson: Array<{ factKey: string; reason: string }>;
  professionalBoundary: string;
};

export type CoverageReviewDTO = {
  id: string;
  propertyId: string;
  policyTermId: string | null;
  status: 'READY' | 'STALE';
  scopeStatus: 'SUPPORTED' | 'PARTIAL' | 'UNSUPPORTED';
  overallState: 'HEALTHY_SCOPED' | 'QUESTIONS' | 'NEEDS_EVIDENCE' | 'UNSUPPORTED';
  reviewVersion: number;
  generatedAt: string;
  expiresAt: string | null;
  policyTerm: {
    id: string;
    termStart: string | null;
    termEnd: string | null;
    verificationStatus: 'VERIFIED' | 'UNVERIFIED';
    insurancePolicy: { id: string; carrierName: string; policyNumber: string };
    sourceDocument: { id: string; name: string } | null;
  } | null;
  questions: CoverageReviewQuestionDTO[];
};

export type CoverageAnalysisOverrides = {
  annualPremiumUsd?: number;
  deductibleUsd?: number;
  warrantyAnnualCostUsd?: number;
  warrantyServiceFeeUsd?: number;
  cashBufferUsd?: number;
  riskTolerance?: CoverageRiskTolerance;
};

export type GuidanceToolContext = {
  guidanceJourneyId?: string | null;
  guidanceStepKey?: string | null;
  guidanceSignalIntentFamily?: string | null;
  inventoryItemId?: string | null;
  assumptionSetId?: string | null;
};

export type ItemCoverageType = 'WARRANTY' | 'SERVICE_PLAN';

export type ItemCoverageAnalysisOverrides = {
  coverageType?: ItemCoverageType;
  annualCostUsd?: number;
  serviceFeeUsd?: number;
  cashBufferUsd?: number;
  riskTolerance?: CoverageRiskTolerance;
  replacementCostUsd?: number;
  expectedRemainingYears?: number;
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
  assumptionSetId?: string | null;
  preferenceProfileId?: string | null;

  summary?: string;
  strategicAdvice?: string | null;
  addOnRecommendations?: Array<{ code: string; label: string; why: string }>;
  nextSteps?: Array<{
    title: string;
    detail?: string;
    priority?: CoverageImpactLevel;
    action?: {
      label: string;
      href: string;
      targetTool: 'providers' | 'insurance' | 'coverage-intelligence';
    };
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

export type ItemCoverageAnalysisDTO = {
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
  strategicAdvice?: string | null;
  addOnRecommendations?: Array<{ code: string; label: string; why: string }>;
  nextSteps?: Array<{
    title: string;
    detail?: string;
    priority?: CoverageImpactLevel;
    action?: {
      label: string;
      href: string;
      targetTool: 'providers' | 'insurance' | 'coverage-intelligence';
    };
  }>;

  item: {
    itemId: string;
    name: string;
    category?: string | null;
    roomId?: string | null;
  };

  warranty: {
    inputsUsed: {
      annualCostUsd?: number;
      serviceFeeUsd?: number;
      replacementCostUsd?: number;
      expectedRemainingYears?: number;
    };
    expectedAnnualRepairRiskUsd?: number;
    expectedCoverageCostUsd?: number;
    expectedNetImpactUsd?: number;
    breakEvenMonths?: number | null;
    recommendation?: 'BUY_NOW' | 'WAIT' | 'REPLACE_SOON';
  };

  decisionTrace: Array<{
    label: string;
    detail?: string;
    impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  }>;
};

export type CoverageAnalysisStatusResponse =
  | { exists: false }
  | { exists: true; analysis: CoverageAnalysisDTO };

export type ItemCoverageAnalysisStatusResponse =
  | { exists: false }
  | { exists: true; analysis: ItemCoverageAnalysisDTO };

export async function getCoverageAnalysis(
  propertyId: string
): Promise<CoverageAnalysisStatusResponse> {
  const res = await api.get<CoverageAnalysisStatusResponse>(
    `/api/properties/${propertyId}/coverage-analysis`
  );
  return res.data;
}

export async function getCoverageReview(
  propertyId: string,
  context?: { triggerEntityType?: string | null; triggerEntityId?: string | null }
): Promise<CoverageReviewDTO> {
  const params = new URLSearchParams();
  if (context?.triggerEntityType) params.set('triggerEntityType', context.triggerEntityType);
  if (context?.triggerEntityId) params.set('triggerEntityId', context.triggerEntityId);
  const query = params.toString();
  const res = await api.get<{ review: CoverageReviewDTO }>(
    `/api/properties/${propertyId}/coverage-review${query ? `?${query}` : ''}`
  );
  return res.data.review;
}

export async function runCoverageAnalysis(
  propertyId: string,
  overrides?: CoverageAnalysisOverrides,
  guidanceContext?: GuidanceToolContext
): Promise<CoverageAnalysisDTO> {
  const res = await api.post<{ analysis: CoverageAnalysisDTO }>(
    `/api/properties/${propertyId}/coverage-analysis/run`,
    {
      overrides: overrides ?? {},
      ...(guidanceContext?.guidanceJourneyId
        ? { guidanceJourneyId: guidanceContext.guidanceJourneyId }
        : {}),
      ...(guidanceContext?.guidanceStepKey
        ? { guidanceStepKey: guidanceContext.guidanceStepKey }
        : {}),
      ...(guidanceContext?.guidanceSignalIntentFamily
        ? { guidanceSignalIntentFamily: guidanceContext.guidanceSignalIntentFamily }
        : {}),
      ...(guidanceContext?.inventoryItemId
        ? { inventoryItemId: guidanceContext.inventoryItemId }
        : {}),
      ...(guidanceContext?.assumptionSetId
        ? { assumptionSetId: guidanceContext.assumptionSetId }
        : {}),
    }
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

export async function getItemCoverageAnalysis(
  propertyId: string,
  itemId: string
): Promise<ItemCoverageAnalysisStatusResponse> {
  const res = await api.get<ItemCoverageAnalysisStatusResponse>(
    `/api/properties/${propertyId}/inventory/items/${itemId}/coverage-analysis`
  );
  return res.data;
}

export async function runItemCoverageAnalysis(
  propertyId: string,
  itemId: string,
  overrides?: ItemCoverageAnalysisOverrides,
  guidanceContext?: GuidanceToolContext
): Promise<ItemCoverageAnalysisDTO> {
  const res = await api.post<{ analysis: ItemCoverageAnalysisDTO }>(
    `/api/properties/${propertyId}/inventory/items/${itemId}/coverage-analysis/run`,
    {
      overrides: overrides ?? {},
      ...(guidanceContext?.guidanceJourneyId
        ? { guidanceJourneyId: guidanceContext.guidanceJourneyId }
        : {}),
      ...(guidanceContext?.guidanceStepKey
        ? { guidanceStepKey: guidanceContext.guidanceStepKey }
        : {}),
      ...(guidanceContext?.guidanceSignalIntentFamily
        ? { guidanceSignalIntentFamily: guidanceContext.guidanceSignalIntentFamily }
        : {}),
    }
  );
  return res.data.analysis;
}
