// apps/frontend/src/lib/api/adminAnalytics.ts
//
// API client functions for the admin analytics dashboard.

import { api } from '@/lib/api/client';

// ============================================================================
// TYPES — mirroring backend Step 4 response shapes
// ============================================================================

export interface AdminAnalyticsFilters {
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
  moduleKey?: string;
}

export interface AdminAskTrustLearningResponse {
  generatedAt: string;
  period: { from: string; to: string };
  privacy: { rawMessagesRead: false; rawMessagesReturned: false; boundedMetadataOnly: true };
  metrics: {
    routedExecutions: number; validatedResponses: number;
    incorrectHighConfidenceResponses: number; incorrectHighConfidenceRate: number | null;
    directAnswerRelevanceRate: number | null; unsupportedAbsenceClaims: number;
    irrelevantBoundaries: number; clarificationRate: number | null;
    clarificationResolutionRate: number | null; correctionRate: number | null;
    repairRate: number | null; semanticFailureCount: number;
    modelDisabledSuccessfulResolutionRate: number | null;
  };
  operations: Array<{
    operationId: string; routed: number; highConfidence: number; clarified: number;
    validations: number; relevancePass: number; repairs: number; corrections: number;
    semanticFailures: number; clarificationRate: number | null;
    directAnswerRelevanceRate: number | null; correctionRate: number | null;
    repairRate: number | null;
    thresholdRecommendation: 'INSUFFICIENT_EVIDENCE' | 'RAISE_OR_CLARIFY_MORE' | 'REVIEW_FOR_LOWER_READ_THRESHOLD' | 'KEEP_CURRENT';
  }>;
  correctionClusters: Array<{ operationId: string; kind: string; count: number }>;
  reviewedFixtureCandidates: Array<{
    fixtureKey: string; operationId: string; category: string; reasonCode: string;
    occurrences: number; reviewStatus: 'NEEDS_REVIEW';
  }>;
  versionLineage: Array<{ semanticIndexVersion: string; semanticContractVersion: string; classifierMode: string; count: number }>;
  alerts: Array<{ severity: 'CRITICAL' | 'HIGH' | 'MEDIUM'; code: string; count: number; action: string }>;
  controls: { recommendationsAreAdvisory: true; automaticThresholdMutation: false; rawTextFixturePromotion: false };
}

export interface AdminRenovationOperationalHealthResponse {
  generatedAt: string;
  funnel: {
    totalCases: number;
    activeCases: number;
    byLifecycle: Record<string, number>;
    verifiedComplete: number;
    completedWithOpenItems: number;
    verifiedCloseoutRate: number | null;
    approvalCycleTime: {
      completedCycles: number;
      averageHours: number | null;
    };
    scopeChangeRechecks: {
      changedScopes: number;
      completedRechecks: number;
      completionRate: number | null;
    };
    installedMaterialCompleteness: {
      installedMaterials: number;
      completeMaterials: number;
      completenessRate: number | null;
    };
    downstreamWriteBack: {
      completedProjects: number;
      successfulProjects: number;
      successRate: number | null;
    };
  };
  trust: {
    readinessNotEvaluated: number;
    readinessBlocked: number;
    unresolvedRequirements: number;
    staleRequirements: number;
    openBlockingConditions: number;
    overdueBlockingConditions: number;
    activeProjectsWithUnknownApplicability: number;
    activeCasesWithoutScope: number;
  };
  operations: {
    activeExecutionProjects: number;
    projectionErrorProjects: number;
    alertCount: number;
    alerts: Array<{
      key: string;
      severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
      count: number;
      label: string;
      exactNextAction: string;
    }>;
    authoritySources: Array<{
      family: 'PERMIT' | 'TAX' | 'LICENSING' | 'ZONING';
      sourceId: string;
      name: string;
      adapterType: string;
      status: string;
      coverageType: string;
      coverageKey: string;
      lastSuccessAt: string | null;
      lastError: string | null;
      latencyMs: number | null;
      freshness: 'FRESH' | 'STALE' | 'NEVER';
      freshnessAgeHours: number | null;
      health: 'HEALTHY' | 'DEGRADED' | 'STALE' | 'DISABLED';
    }>;
    authoritySourceFamilies: Array<{
      family: 'PERMIT' | 'TAX' | 'LICENSING' | 'ZONING';
      configuredSources: number;
      activeSources: number;
      healthySources: number;
      degradedSources: number;
      lastSuccessAt: string | null;
    }>;
  };
  guardrails: {
    officialStatusInferredFromMissingData: false;
    readinessWithoutEvaluationCount: number;
    completionWithOpenItemsCount: number;
  };
}

// Item #23 (§14 "Measurement"). Metrics that aren't yet computable come
// back `null` with a matching one-line reason in `gaps` — never fabricated.
export interface AdminHomeOperationsMeasurementResponse {
  generatedAt: string;
  northStar: {
    verifiedImportantOutcomes: number;
    activeProperties: number;
    perPropertyRate: number | null;
  };
  funnel: {
    actionableCandidatesDetected: number;
    uniqueWorkItemsAfterReconciliation: number;
    reconciliationRatio: number | null;
    acceptanceRate: number | null;
    acceptedToScheduledHours: { count: number; averageHours: number | null };
    scheduledToStartedHours: { count: number; averageHours: number | null };
    startedToReportedCompleteHours: { count: number; averageHours: number | null };
    reportedToVerifiedHours: { count: number; averageHours: number | null };
    sourceReconciliationSuccessRate: number | null;
    overdueRate: number | null;
    reopenRate: number | null;
    recommendationUnderstoodRate: number | null;
    duplicatePreventionRate: number | null;
    completedWithoutDuplicateClosure: number | null;
    stages: {
      candidateDetected: number;
      homeownerUnderstood: number;
      workAccepted: number;
      scheduledOrAssigned: number;
      executionStarted: number;
      reportedComplete: number;
      evidenceReceived: number;
      outcomeVerified: number;
      sourceConditionReconciled: number;
      recurrenceOrFollowUpCreated: number;
    };
  };
  trust: {
    falseCompletionIncidents: number;
    notificationsWithoutActionableChange: { count: number; rate: number | null };
    projectWriteBackFailures: { completedProjects: number; successfulWriteBacks: number; failureRate: number | null };
    unresolvedSourceAfterVerifiedOutcome: number;
    workHiddenWhileSourceOpen: null;
    incorrectMergesAndDuplicateSplits: null;
    staleSourcePromotions: number;
    safetyGovernanceViolations: number;
    factCorrectionCompletion: null;
    accessibilityDefects: null;
  };
  guardrailContext: {
    workItemsCreated: number;
    dismissalsRecorded: number;
    projectsCreatedWithoutVerifiedOutcome: number;
  };
  gaps: string[];
}

// Overview
export interface AdminOverviewResponse {
  period: { from: string; to: string };
  activation: {
    totalProperties: number;
    activatedProperties: number;
    activationRate: number;
    newActivationsInPeriod: number;
  };
  activeHomes: {
    weeklyActiveHomes: number;
    monthlyActiveHomes: number;
    wahOverMah: number | null;
    wahNote?: string;
  };
  interactions: {
    totalInteractions: number;
    avgInteractionsPerActiveHome: number;
    medianInteractionsPerHome: number | null;
  };
  decisionsGuided: {
    totalDecisionsGuided: number;
    byModule: Array<{ moduleKey: string; count: number }>;
  };
}

// Trends
export interface DailyTrendPoint {
  date: string;
  wah: number;
  eventCount: number;
  activeProperties: number;
}

export interface AdminTrendsResponse {
  period: { from: string; to: string };
  granularity: 'day';
  series: DailyTrendPoint[];
}

// Feature adoption
export interface FeatureAdoptionRow {
  moduleKey: string;
  featureKey: string;
  uniqueHomes: number;
  totalEvents: number;
  adoptionRate: number;
}

export interface AdminFeatureAdoptionResponse {
  period: { from: string; to: string };
  totalActivatedHomes: number;
  features: FeatureAdoptionRow[];
}

// Funnel
export interface FunnelStage {
  stage: string;
  label: string;
  count: number;
  dropoffFromPrevious: number | null;
  conversionFromPrevious: number | null;
}

export interface AdminFunnelResponse {
  period: { from: string; to: string };
  stages: FunnelStage[];
}

// Cohorts
export interface CohortRetentionRow {
  cohortKey: string;
  cohortSize: number;
  retentionByWeek: Array<{
    weekOffset: number;
    activeCount: number;
    retentionRate: number;
  }>;
}

export interface AdminCohortResponse {
  cohortType: 'weekly' | 'monthly';
  cohorts: CohortRetentionRow[];
}

// Top tools
export interface TopToolRow {
  moduleKey: string;
  featureKey: string;
  label: string;
  uniqueHomes: number;
  totalEvents: number;
  rank: number;
}

export interface AdminTopToolsResponse {
  period: { from: string; to: string };
  topN: number;
  tools: TopToolRow[];
}

export type ToolLifecycleStageKey =
  | 'ELIGIBLE'
  | 'DISCOVERED'
  | 'CLICKED'
  | 'STARTED'
  | 'OUTPUT_GENERATED'
  | 'COMPLETED'
  | 'ABANDONED'
  | 'NOT_RELEVANT'
  | 'DISMISSED';

export interface AdminToolLifecycleFunnelResponse {
  period: { from: string; to: string };
  metricVersion: 'capability-funnel-v3';
  population: {
    audience: 'REAL_USER';
    denominatorUnit: 'UNIQUE_PROPERTY_BY_STAGE';
    includedEvents: number;
    includedHomes: number;
    excludedSyntheticQaEvents: number;
    excludedSyntheticQaHomes: number;
  };
  summary: {
    eligibleHomes: number;
    actualViewHomes: number;
    actualViewCoverage: number | null;
    clickedHomes: number;
    clickThroughRate: number | null;
    startedHomes: number;
    outputHomes: number;
    completedHomes: number;
    abandonedHomes: number;
    notRelevantHomes: number;
    dismissedHomes: number;
    repetitionRate: number | null;
    observedRecommendationScopes: number;
    repeatedRecommendationScopes: number;
  };
  stages: Array<{
    stage: ToolLifecycleStageKey;
    uniqueHomes: number;
    totalEvents: number;
  }>;
  tools: Array<{
    toolId: string;
    label: string;
    eligibleHomes: number;
    discoveredHomes: number;
    clickedHomes: number;
    startedHomes: number;
    outputHomes: number;
    completedHomes: number;
    abandonedHomes: number;
    notRelevantHomes: number;
    dismissedHomes: number;
    actualViewCoverage: number | null;
    clickThroughRate: number | null;
    startRate: number | null;
    completionRate: number | null;
  }>;
  readinessDistribution: Array<{
    readiness: string;
    uniqueHomes: number;
    totalEvents: number;
    share: number;
  }>;
  topReasonCodes: Array<{
    reasonCode: string;
    uniqueHomes: number;
    totalEvents: number;
  }>;
  sourceDistribution: Array<{
    source: 'CONTEXTUAL' | 'CATALOG_ONLY' | 'UNATTRIBUTED';
    uniqueHomes: number;
    totalEvents: number;
    share: number;
  }>;
}

export interface AdminPhase1PilotMetric {
  numerator: number;
  denominator: number;
  rate: number;
  target: number | null;
  definition: string;
}

export interface AdminPhase1PilotResponse {
  metricVersion: string;
  period: { from: string; to: string };
  eligibility: {
    definition: string;
    eligibleHomes: number;
  };
  metrics: {
    minimumSetupCompletion: AdminPhase1PilotMetric;
    usefulNewRecommendationIdentification: AdminPhase1PilotMetric;
    usefulRecommendationAny: AdminPhase1PilotMetric;
    actionResolutionWithin30Days: AdminPhase1PilotMetric;
  };
}

export interface AdminPhase6PilotResponse {
  metricVersion: string;
  humanPolicyApprovalEnforced: boolean;
  period: { from: string; to: string };
  cohort: { assessed: number; eligible: number; admitted: number; activatedPlans: number; qualificationRate: number; admissionRate: number; activationRate: number; averageAcquisitionCents: number };
  admissionQueue: Array<{
    propertyId: string;
    qualificationDecision: 'PENDING' | 'ELIGIBLE' | 'HOLD';
    qualificationReasons: string[];
    admissionDecision: 'PENDING' | 'ADMITTED' | 'REJECTED';
    admissionReasons: string[];
    cohortKey: string | null;
    assessedAt: string;
    reviewedAt: string | null;
    channelSource: string | null;
    estimatedAcquisitionCents: number | null;
  }>;
  expansionGate: {
    status: 'READY' | 'BLOCKED' | 'INSUFFICIENT_EVIDENCE';
    expansionReady: boolean;
    milestoneCompletion: { value: number; threshold: number; denominator: number };
    unresolvedBlockerHoursPerJourney: { value: number; thresholdMaximum: number; denominator: number };
    recommendationComprehension: { value: number; threshold: number; denominator: number };
    verifiedOutcomeWriteBack: { value: number; threshold: number; denominator: number };
    providerQualityVisibility: { value: number; threshold: number; denominator: number };
    recurringCareConversion: { value: number; threshold: number; denominator: number };
    sampleSize: { completedJourneys: number; minimumCompletedJourneys: number; providerJourneys: number; minimumProviderJourneys: number };
  };
}

export interface AdminServiceQuoteDecisionResponse {
  metricVersion: 'service-quote-decision-v1';
  period: { from: string; to: string };
  funnel: {
    activeDecisions: number;
    quoteIntakes: number;
    confirmedQuotes: number;
    comparisonReadyQuotes: number;
    comparisonReached: number;
    explicitDecisions: number;
    accepted: number;
    booked: number;
    completedWork: number;
    decisionRate: number | null;
    completionRate: number | null;
  };
  decisionQuality: {
    clarificationRequests: number;
    clarificationResolutions: number;
    scopeChangesAfterWarnings: number;
    comparisonEligibilityRate: number | null;
    recommendationOverrides: number;
    disputeSignals: number;
  };
  evidence: {
    totalChecks: number;
    qualifiedChecks: number;
    qualifiedCoverageRate: number | null;
    byCategory: Array<{
      serviceCategory: string;
      total: number;
      qualified: number;
      coverageRate: number | null;
    }>;
    sources: { total: number; activeQualified: number; degraded: number };
  };
  consent: {
    completedWork: number;
    consentedCompletedWork: number;
    consentRate: number | null;
    verifiedFinalPriceCaptures: number;
    consentedChangeOrderCaptures: number;
  };
  governedLearning: {
    eligibleForInternalBenchmarkDerivation: boolean;
    verifiedObservationCount: number;
    distinctPropertyCount: number;
    minimumObservationCount: number;
    minimumDistinctProperties: number;
    rules: string[];
  };
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

function buildParams(filters: AdminAnalyticsFilters): Record<string, string> {
  const p: Record<string, string> = {};
  if (filters.from) p.from = filters.from;
  if (filters.to) p.to = filters.to;
  if (filters.moduleKey) p.moduleKey = filters.moduleKey;
  return p;
}

export async function fetchAdminAnalyticsOverview(
  filters: AdminAnalyticsFilters,
): Promise<AdminOverviewResponse> {
  // api.get() already unwraps the backend's { success, data } envelope one
  // level (see APIClient.get's "robust unwrap"), so `response.data` here IS
  // the AdminOverviewResponse — do not access `.data.data`, it resolves to
  // undefined and React Query treats an undefined queryFn result as an error.
  const response = await api.get<AdminOverviewResponse>(
    '/api/admin/analytics/overview',
    { params: buildParams(filters) },
  );
  return response.data;
}

export async function fetchAdminRenovationOperationalHealth(
  filters: AdminAnalyticsFilters,
): Promise<AdminRenovationOperationalHealthResponse> {
  const response = await api.get<AdminRenovationOperationalHealthResponse>(
    '/api/admin/analytics/renovation-operations',
    { params: buildParams(filters) },
  );
  return response.data;
}

export async function fetchAdminHomeOperationsMeasurement(
  filters: AdminAnalyticsFilters,
): Promise<AdminHomeOperationsMeasurementResponse> {
  const response = await api.get<AdminHomeOperationsMeasurementResponse>(
    '/api/admin/analytics/home-operations',
    { params: buildParams(filters) },
  );
  return response.data;
}

export async function fetchAdminAskTrustLearning(
  filters: AdminAnalyticsFilters,
): Promise<AdminAskTrustLearningResponse> {
  const response = await api.get<AdminAskTrustLearningResponse>(
    '/api/admin/analytics/ask-trust',
    { params: buildParams(filters) },
  );
  return response.data;
}

export async function fetchAdminAnalyticsTrends(
  filters: AdminAnalyticsFilters,
): Promise<AdminTrendsResponse> {
  const response = await api.get<AdminTrendsResponse>(
    '/api/admin/analytics/trends',
    { params: buildParams(filters) },
  );
  return response.data;
}

export async function fetchAdminAnalyticsFeatureAdoption(
  filters: AdminAnalyticsFilters,
): Promise<AdminFeatureAdoptionResponse> {
  const response = await api.get<AdminFeatureAdoptionResponse>(
    '/api/admin/analytics/feature-adoption',
    { params: buildParams(filters) },
  );
  return response.data;
}

export async function fetchAdminAnalyticsFunnel(
  filters: AdminAnalyticsFilters,
): Promise<AdminFunnelResponse> {
  const response = await api.get<AdminFunnelResponse>(
    '/api/admin/analytics/funnel',
    { params: buildParams(filters) },
  );
  return response.data;
}

export async function fetchAdminAnalyticsCohorts(opts: {
  cohortType?: 'weekly' | 'monthly';
  limit?: number;
}): Promise<AdminCohortResponse> {
  const params: Record<string, string> = {};
  if (opts.cohortType) params.cohortType = opts.cohortType;
  if (opts.limit) params.limit = String(opts.limit);
  const response = await api.get<AdminCohortResponse>(
    '/api/admin/analytics/cohorts',
    { params },
  );
  return response.data;
}

export async function fetchAdminAnalyticsTopTools(
  filters: AdminAnalyticsFilters & { topN?: number },
): Promise<AdminTopToolsResponse> {
  const params = buildParams(filters);
  if (filters.topN) params.topN = String(filters.topN);
  const response = await api.get<AdminTopToolsResponse>(
    '/api/admin/analytics/top-tools',
    { params },
  );
  return response.data;
}

export async function fetchAdminToolLifecycleFunnel(
  filters: AdminAnalyticsFilters,
): Promise<AdminToolLifecycleFunnelResponse> {
  const response = await api.get<AdminToolLifecycleFunnelResponse>(
    '/api/admin/analytics/tool-lifecycle',
    { params: buildParams(filters) },
  );
  return response.data;
}

export async function fetchAdminAnalyticsPhase1Pilot(
  filters: AdminAnalyticsFilters,
): Promise<AdminPhase1PilotResponse> {
  const response = await api.get<AdminPhase1PilotResponse>(
    '/api/admin/analytics/phase1-pilot',
    { params: buildParams(filters) },
  );
  return response.data;
}

export async function fetchAdminAnalyticsPhase6Pilot(filters: AdminAnalyticsFilters): Promise<AdminPhase6PilotResponse> {
  const response = await api.get<AdminPhase6PilotResponse>('/api/admin/analytics/phase6-pilot', { params: buildParams(filters) });
  return response.data;
}

export async function fetchAdminServiceQuoteDecisionMetrics(
  filters: AdminAnalyticsFilters,
): Promise<AdminServiceQuoteDecisionResponse> {
  const response = await api.get<AdminServiceQuoteDecisionResponse>(
    '/api/admin/analytics/service-quote-decisions',
    { params: buildParams(filters) },
  );
  return response.data;
}

export async function decideAdminPhase6PilotAdmission(propertyId: string, input: { decision: 'ADMITTED' | 'REJECTED'; cohortKey?: string | null; reasons?: string[] }) {
  const response = await api.post(`/api/admin/analytics/phase6-pilot/properties/${propertyId}/admission`, input);
  return response.data;
}
