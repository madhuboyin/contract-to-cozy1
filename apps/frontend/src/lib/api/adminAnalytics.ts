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
  const response = await api.get<{ success: boolean; data: AdminOverviewResponse }>(
    '/api/admin/analytics/overview',
    { params: buildParams(filters) },
  );
  return response.data.data;
}

export async function fetchAdminAnalyticsTrends(
  filters: AdminAnalyticsFilters,
): Promise<AdminTrendsResponse> {
  const response = await api.get<{ success: boolean; data: AdminTrendsResponse }>(
    '/api/admin/analytics/trends',
    { params: buildParams(filters) },
  );
  return response.data.data;
}

export async function fetchAdminAnalyticsFeatureAdoption(
  filters: AdminAnalyticsFilters,
): Promise<AdminFeatureAdoptionResponse> {
  const response = await api.get<{ success: boolean; data: AdminFeatureAdoptionResponse }>(
    '/api/admin/analytics/feature-adoption',
    { params: buildParams(filters) },
  );
  return response.data.data;
}

export async function fetchAdminAnalyticsFunnel(
  filters: AdminAnalyticsFilters,
): Promise<AdminFunnelResponse> {
  const response = await api.get<{ success: boolean; data: AdminFunnelResponse }>(
    '/api/admin/analytics/funnel',
    { params: buildParams(filters) },
  );
  return response.data.data;
}

export async function fetchAdminAnalyticsCohorts(opts: {
  cohortType?: 'weekly' | 'monthly';
  limit?: number;
}): Promise<AdminCohortResponse> {
  const params: Record<string, string> = {};
  if (opts.cohortType) params.cohortType = opts.cohortType;
  if (opts.limit) params.limit = String(opts.limit);
  const response = await api.get<{ success: boolean; data: AdminCohortResponse }>(
    '/api/admin/analytics/cohorts',
    { params },
  );
  return response.data.data;
}

export async function fetchAdminAnalyticsTopTools(
  filters: AdminAnalyticsFilters & { topN?: number },
): Promise<AdminTopToolsResponse> {
  const params = buildParams(filters);
  if (filters.topN) params.topN = String(filters.topN);
  const response = await api.get<{ success: boolean; data: AdminTopToolsResponse }>(
    '/api/admin/analytics/top-tools',
    { params },
  );
  return response.data.data;
}
