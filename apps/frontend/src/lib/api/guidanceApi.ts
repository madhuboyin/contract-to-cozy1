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

export type GuidanceJourneyStatus = 'NOT_STARTED' | 'ACTIVE' | 'COMPLETED' | 'ABORTED' | 'ARCHIVED' | 'DISMISSED';
export type GuidanceScopeCategory = 'ITEM' | 'SERVICE';
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
  templateVersion: string | null;
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
  // IMP-GE-1: user-first scope fields
  scopeCategory: GuidanceScopeCategory | null;
  scopeId: string | null;
  issueType: string | null;
  serviceKey: string | null;
  isUserInitiated: boolean;
  dismissedReason: string | null;
  dismissedAt: string | null;
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
  inventoryItem?: {
    name: string | null;
    category: string | null;
  } | null;
  homeAsset?: {
    assetType: string | null;
  } | null;
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
  next: GuidanceNextStepResult | null;
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
  evidences?: Array<{
    id: string;
    propertyId: string;
    journeyId: string;
    stepId: string;
    signalId: string | null;
    homeAssetId: string | null;
    inventoryItemId: string | null;
    evidenceType: string;
    sourceType: string;
    status: string;
    sourceToolKey: string | null;
    sourceFeatureKey: string | null;
    evidenceRefType: string | null;
    evidenceRefId: string | null;
    proofType: string | null;
    proofId: string | null;
    confidenceScore: number | null;
    observedAt: string | null;
    verifiedAt: string | null;
    invalidatedAt: string | null;
    createdByUserId: string | null;
    payload: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
    createdAt: string | null;
    updatedAt: string | null;
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
  blockedReason: string | null;
  reasons: string[];
  missingPrerequisites: Array<{
    journeyId: string;
    journeyTypeKey: string | null;
    stepKey: string;
    stepLabel: string;
  }>;
  safeNextStep: {
    journeyId: string;
    journeyTypeKey: string | null;
    stepKey: string;
    stepLabel: string;
  } | null;
  evaluatedJourneyIds: string[];
};

export async function getPropertyGuidance(
  propertyId: string,
  options?: { userSelectedScopeId?: string }
): Promise<GuidancePropertyResponse> {
  const res = await api.get<GuidancePropertyResponse>(`/api/properties/${propertyId}/guidance`, {
    params: options?.userSelectedScopeId
      ? { userSelectedScopeId: options.userSelectedScopeId }
      : undefined,
  });
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

export async function recordGuidanceToolCompletion(
  propertyId: string,
  payload: {
    stepKey: string;
    journeyId?: string;
    signalIntentFamily?: string;
    issueDomain?: GuidanceIssueDomain;
    homeAssetId?: string;
    inventoryItemId?: string;
    sourceEntityType?: string;
    sourceEntityId?: string;
    sourceToolKey?: string;
    producedData?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }
): Promise<{ step: GuidanceStepDTO | null; journey: GuidanceJourneyDTO | null }> {
  return recordGuidanceToolStatus(propertyId, {
    ...payload,
    sourceToolKey: payload.sourceToolKey ?? 'frontend',
    status: 'COMPLETED',
  });
}

export async function recordGuidanceToolStatus(
  propertyId: string,
  payload: {
    stepKey?: string;
    journeyId?: string;
    signalIntentFamily?: string;
    issueDomain?: GuidanceIssueDomain;
    homeAssetId?: string;
    inventoryItemId?: string;
    sourceEntityType?: string;
    sourceEntityId?: string;
    sourceToolKey?: string;
    status: 'COMPLETED' | 'SKIPPED' | 'BLOCKED' | 'IN_PROGRESS';
    producedData?: Record<string, unknown>;
    reasonCode?: string;
    reasonMessage?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<{ step: GuidanceStepDTO | null; journey: GuidanceJourneyDTO | null }> {
  const res = await api.post<{ step: GuidanceStepDTO | null; journey: GuidanceJourneyDTO | null }>(
    `/api/properties/${propertyId}/guidance/tool-completions`,
    { sourceToolKey: payload.sourceToolKey ?? 'frontend', ...payload }
  );
  return res.data;
}

// IMP-GE-1: User-initiated journey mutations

export type StartGuidanceJourneyInput = {
  scopeCategory: GuidanceScopeCategory;
  scopeId: string;
  issueType: string;
  inventoryItemId?: string;
  homeAssetId?: string;
  serviceKey?: string;
};

export type GuidanceIssueTypeOption = {
  key: string;
  label: string;
};

export type GuidanceServiceCategoryOption = {
  key: string;
  label: string;
};

export async function startGuidanceJourney(
  propertyId: string,
  input: StartGuidanceJourneyInput
): Promise<{ journey: GuidanceJourneyDTO }> {
  const res = await api.post<{ journey: GuidanceJourneyDTO }>(
    `/api/properties/${propertyId}/guidance/journeys/start`,
    input
  );
  return res.data;
}

export async function dismissGuidanceJourney(
  propertyId: string,
  journeyId: string,
  reason?: string
): Promise<{ journey: GuidanceJourneyDTO }> {
  const res = await api.post<{ journey: GuidanceJourneyDTO }>(
    `/api/properties/${propertyId}/guidance/journeys/${journeyId}/dismiss`,
    { reason }
  );
  return res.data;
}

export async function changeGuidanceJourneyIssue(
  propertyId: string,
  journeyId: string,
  issueType: string
): Promise<{ journey: GuidanceJourneyDTO }> {
  const res = await api.post<{ journey: GuidanceJourneyDTO }>(
    `/api/properties/${propertyId}/guidance/journeys/${journeyId}/change-issue`,
    { issueType }
  );
  return res.data;
}

export async function getGuidanceIssueTypes(
  propertyId: string,
  scopeCategory: GuidanceScopeCategory
): Promise<{ scopeCategory: GuidanceScopeCategory; issueTypes: GuidanceIssueTypeOption[] }> {
  const res = await api.get<{ scopeCategory: GuidanceScopeCategory; issueTypes: GuidanceIssueTypeOption[] }>(
    `/api/properties/${propertyId}/guidance/issue-types`,
    { params: { scopeCategory } }
  );
  return res.data;
}

export async function getGuidanceServiceCategories(
  propertyId: string
): Promise<{ serviceCategories: GuidanceServiceCategoryOption[] }> {
  const res = await api.get<{ serviceCategories: GuidanceServiceCategoryOption[] }>(
    `/api/properties/${propertyId}/guidance/service-categories`
  );
  return res.data;
}

// ---------------------------------------------------------------------------
// FRD-FR-04: Symptom types scoped to an InventoryItemCategory
// ---------------------------------------------------------------------------

export type SymptomTypeOption = {
  key: string;
  label: string;
};

export async function getGuidanceSymptomTypes(
  propertyId: string,
  category?: string
): Promise<{ category: string; symptomTypes: SymptomTypeOption[] }> {
  const res = await api.get<{ category: string; symptomTypes: SymptomTypeOption[] }>(
    `/api/properties/${propertyId}/guidance/symptom-types`,
    { params: category ? { category } : undefined }
  );
  return res.data;
}

// ---------------------------------------------------------------------------
// FRD-FR-03: 2-Year Lookback context for the verify_history step
// ---------------------------------------------------------------------------

export type AssetResolutionContext = {
  hasHistory: boolean;
  lookbackRequired: boolean;
  recentEvents: Array<{
    id: string;
    type: string;
    title: string;
    occurredAt: string;
    amount: number | null;
    isRetrospective: boolean;
  }>;
};

export async function getAssetResolutionContext(
  propertyId: string,
  inventoryItemId: string
): Promise<AssetResolutionContext> {
  const res = await api.get<AssetResolutionContext>(
    `/api/properties/${propertyId}/guidance/asset-resolution-context`,
    { params: { inventoryItemId } }
  );
  return res.data;
}
