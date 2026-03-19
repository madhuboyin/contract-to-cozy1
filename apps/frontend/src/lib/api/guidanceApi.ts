import { api } from './client';

export type GuidanceIssueDomain =
  | 'SAFETY'
  | 'MAINTENANCE'
  | 'INSURANCE'
  | 'FINANCIAL'
  | 'COMPLIANCE'
  | 'MARKET_VALUE'
  | 'ASSET_LIFECYCLE'
  | 'CLAIMS'
  | 'PRICING'
  | 'NEGOTIATION'
  | 'BOOKING'
  | 'DOCUMENTATION'
  | 'NEIGHBORHOOD'
  | 'ONBOARDING'
  | 'WEATHER'
  | 'ENERGY'
  | 'OTHER';

export type GuidanceDecisionStage =
  | 'AWARENESS'
  | 'DIAGNOSIS'
  | 'DECISION'
  | 'EXECUTION'
  | 'VALIDATION'
  | 'TRACKING';

export type GuidanceExecutionReadiness =
  | 'NOT_READY'
  | 'NEEDS_CONTEXT'
  | 'READY'
  | 'TRACKING_ONLY'
  | 'UNKNOWN';

export type GuidanceJourneyStatus = 'ACTIVE' | 'COMPLETED' | 'ABORTED' | 'ARCHIVED';
export type GuidanceStepStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'BLOCKED';
export type GuidanceSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';

export type GuidanceSignalDTO = {
  id: string;
  propertyId: string;
  homeAssetId: string | null;
  inventoryItemId: string | null;
  signalIntentFamily: string;
  issueDomain: GuidanceIssueDomain;
  decisionStage: GuidanceDecisionStage;
  executionReadiness: GuidanceExecutionReadiness;
  severity: GuidanceSeverity | null;
  severityScore: number | null;
  confidenceScore: number | null;
  sourceToolKey: string | null;
  sourceFeatureKey: string | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  status: string;
  canonicalFirstStepKey: string | null;
  recommendedToolKey: string | null;
  recommendedFlowKey: string | null;
  missingContextKeys: string[];
  contextPrerequisites: string[];
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  resolvedAt: string | null;
  updatedAt: string | null;
};

export type GuidanceStepDTO = {
  id: string;
  journeyId: string;
  stepOrder: number;
  stepKey: string;
  stepType: string | null;
  label: string;
  description: string | null;
  decisionStage: GuidanceDecisionStage | null;
  executionReadiness: GuidanceExecutionReadiness;
  status: GuidanceStepStatus;
  isRequired: boolean;
  toolKey: string | null;
  flowKey: string | null;
  routePath: string | null;
  displayLabel?: string | null;
  requiredContextKeys: string[];
  missingContextKeys: string[];
  blockedReasonCode: string | null;
  blockedReason: string | null;
  skippedReasonCode: string | null;
  skippedReason: string | null;
  producedData: Record<string, unknown> | null;
  startedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  blockedAt: string | null;
  updatedAt: string | null;
};

export type GuidanceJourneyDTO = {
  id: string;
  propertyId: string;
  homeAssetId: string | null;
  inventoryItemId: string | null;
  journeyKey: string | null;
  journeyTypeKey: string | null;
  issueDomain: GuidanceIssueDomain;
  decisionStage: GuidanceDecisionStage;
  executionReadiness: GuidanceExecutionReadiness;
  status: GuidanceJourneyStatus;
  currentStepOrder: number | null;
  currentStepKey: string | null;
  isLowContext: boolean;
  missingContextKeys: string[];
  contextSnapshot: Record<string, unknown> | null;
  derivedSnapshot: Record<string, unknown> | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  progress: {
    completedCount: number;
    totalCount: number;
    percent: number;
  };
  priorityScore?: number | null;
  priorityBucket?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  priorityGroup?: 'IMMEDIATE' | 'UPCOMING' | 'OPTIMIZATION' | null;
  confidenceScore?: number | null;
  confidenceLabel?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  financialImpactScore?: number | null;
  fundingGapFlag?: boolean;
  costOfDelay?: number | null;
  coverageImpact?: 'COVERED' | 'PARTIAL' | 'NOT_COVERED' | 'UNKNOWN' | null;
  explanation?: {
    what: string;
    why: string;
    risk: string;
    nextStep: string;
  } | null;
  nextStepLabel?: string | null;
  primarySignal: GuidanceSignalDTO | null;
  steps: GuidanceStepDTO[];
};

export type GuidanceMissingPrerequisite = {
  stepKey: string;
  label: string;
};

export type GuidanceNextStepResult = {
  journeyId: string;
  currentStep: GuidanceStepDTO | null;
  nextStep: GuidanceStepDTO | null;
  executionReadiness: GuidanceExecutionReadiness;
  missingPrerequisites: GuidanceMissingPrerequisite[];
  warnings: string[];
  blockedReason: string | null;
  recommendedToolKey: string | null;
  recommendedFlowKey: string | null;
  priorityScore?: number | null;
  priorityBucket?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  priorityGroup?: 'IMMEDIATE' | 'UPCOMING' | 'OPTIMIZATION' | null;
  confidenceScore?: number | null;
  confidenceLabel?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  financialImpactScore?: number | null;
  fundingGapFlag?: boolean;
  costOfDelay?: number | null;
  coverageImpact?: 'COVERED' | 'PARTIAL' | 'NOT_COVERED' | 'UNKNOWN' | null;
  explanation?: {
    what: string;
    why: string;
    risk: string;
    nextStep: string;
  } | null;
  nextStepLabel?: string | null;
};

export type GuidancePropertyResponse = {
  propertyId: string;
  counts: {
    activeSignals: number;
    activeJourneys: number;
    surfacedSignals?: number;
    surfacedJourneys?: number;
    suppressedSignals?: number;
  };
  signals: GuidanceSignalDTO[];
  journeys: GuidanceJourneyDTO[];
  next: GuidanceNextStepResult[];
  suppressedSignals?: Array<{
    signalId: string | null;
    journeyId: string;
    reason: string;
  }>;
};

export type GuidanceJourneyDetailResponse = {
  journey: GuidanceJourneyDTO;
  events: Array<{
    id: string;
    journeyId: string;
    stepId: string | null;
    signalId: string | null;
    eventType: string;
    fromJourneyStatus: string | null;
    toJourneyStatus: string | null;
    fromStepStatus: string | null;
    toStepStatus: string | null;
    actorUserId: string | null;
    reasonCode: string | null;
    reasonMessage: string | null;
    payload: Record<string, unknown> | null;
    createdAt: string;
  }>;
};

export type GuidanceExecutionTargetAction =
  | 'BOOKING'
  | 'CLAIM_ESCALATION'
  | 'INSPECTION_SCHEDULING'
  | 'PROVIDER_HANDOFF'
  | 'EXECUTION';

export type GuidanceExecutionGuardResult = {
  blocked: boolean;
  targetAction: GuidanceExecutionTargetAction;
  reasons: string[];
  missingPrerequisites: Array<{
    journeyId: string;
    journeyTypeKey: string | null;
    stepKey: string;
    stepLabel: string;
  }>;
  evaluatedJourneyIds: string[];
};

export async function getPropertyGuidance(propertyId: string): Promise<GuidancePropertyResponse> {
  const res = await api.get<GuidancePropertyResponse>(`/api/properties/${propertyId}/guidance`);
  return res.data;
}

export async function listActiveGuidanceJourneys(
  propertyId: string
): Promise<{ journeys: GuidanceJourneyDTO[] }> {
  const res = await api.get<{ journeys: GuidanceJourneyDTO[] }>(`/api/properties/${propertyId}/guidance/journeys`);
  return res.data;
}

export async function getGuidanceJourneyDetail(
  propertyId: string,
  journeyId: string
): Promise<GuidanceJourneyDetailResponse> {
  const res = await api.get<GuidanceJourneyDetailResponse>(
    `/api/properties/${propertyId}/guidance/journeys/${journeyId}`
  );
  return res.data;
}

export async function getGuidanceNextStep(
  propertyId: string,
  journeyId: string
): Promise<GuidanceNextStepResult> {
  const res = await api.get<GuidanceNextStepResult>(`/api/properties/${propertyId}/guidance/next-step`, {
    params: { journeyId },
  });
  return res.data;
}

export async function getGuidanceExecutionGuard(
  propertyId: string,
  targetAction: GuidanceExecutionTargetAction,
  options?: {
    journeyId?: string;
    inventoryItemId?: string;
    homeAssetId?: string;
  }
): Promise<GuidanceExecutionGuardResult> {
  const res = await api.get<GuidanceExecutionGuardResult>(
    `/api/properties/${propertyId}/guidance/execution-guard`,
    {
      params: {
        targetAction,
        journeyId: options?.journeyId,
        inventoryItemId: options?.inventoryItemId,
        homeAssetId: options?.homeAssetId,
      },
    }
  );
  return res.data;
}

export async function completeGuidanceStep(
  propertyId: string,
  stepId: string,
  producedData?: Record<string, unknown>
): Promise<{ step: GuidanceStepDTO; journey: GuidanceJourneyDTO }> {
  const res = await api.post<{ step: GuidanceStepDTO; journey: GuidanceJourneyDTO }>(
    `/api/properties/${propertyId}/guidance/steps/${stepId}/complete`,
    {
      producedData,
    }
  );
  return res.data;
}

export async function skipGuidanceStep(
  propertyId: string,
  stepId: string,
  payload?: {
    reasonCode?: string;
    reasonMessage?: string;
    producedData?: Record<string, unknown>;
  }
): Promise<{ step: GuidanceStepDTO; journey: GuidanceJourneyDTO }> {
  const res = await api.post<{ step: GuidanceStepDTO; journey: GuidanceJourneyDTO }>(
    `/api/properties/${propertyId}/guidance/steps/${stepId}/skip`,
    payload ?? {}
  );
  return res.data;
}

export async function blockGuidanceStep(
  propertyId: string,
  stepId: string,
  payload?: {
    reasonCode?: string;
    reasonMessage?: string;
    missingContextKeys?: string[];
  }
): Promise<{ step: GuidanceStepDTO; journey: GuidanceJourneyDTO }> {
  const res = await api.post<{ step: GuidanceStepDTO; journey: GuidanceJourneyDTO }>(
    `/api/properties/${propertyId}/guidance/steps/${stepId}/block`,
    payload ?? {}
  );
  return res.data;
}
