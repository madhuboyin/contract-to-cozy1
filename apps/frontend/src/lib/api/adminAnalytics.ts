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

export type ToolLifecycleStageKey = 'DISCOVERED' | 'CLICKED' | 'STARTED' | 'OUTPUT_GENERATED' | 'COMPLETED' | 'ABANDONED';

export interface AdminToolLifecycleFunnelResponse {
  period: { from: string; to: string };
  stages: Array<{
    stage: ToolLifecycleStageKey;
    uniqueHomes: number;
    totalEvents: number;
  }>;
  tools: Array<{
    toolId: string;
    label: string;
    discoveredHomes: number;
    clickedHomes: number;
    startedHomes: number;
    outputHomes: number;
    completedHomes: number;
    abandonedHomes: number;
    clickThroughRate: number | null;
    startRate: number | null;
    completionRate: number | null;
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

export async function decideAdminPhase6PilotAdmission(propertyId: string, input: { decision: 'ADMITTED' | 'REJECTED'; cohortKey?: string | null; reasons?: string[] }) {
  const response = await api.post(`/api/admin/analytics/phase6-pilot/properties/${propertyId}/admission`, input);
  return response.data;
}
