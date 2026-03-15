// apps/frontend/src/hooks/useAdminAnalytics.ts
//
// React Query hooks for the admin analytics dashboard.

import { useQuery } from '@tanstack/react-query';
import {
  fetchAdminAnalyticsOverview,
  fetchAdminAnalyticsTrends,
  fetchAdminAnalyticsFeatureAdoption,
  fetchAdminAnalyticsFunnel,
  fetchAdminAnalyticsCohorts,
  fetchAdminAnalyticsTopTools,
} from '@/lib/api/adminAnalytics';
import type { AdminAnalyticsFilters } from '@/lib/api/adminAnalytics';

const STALE = 5 * 60_000; // 5 minutes

export function useAdminAnalyticsOverview(filters: AdminAnalyticsFilters, enabled = true) {
  return useQuery({
    queryKey: ['admin-analytics-overview', filters.from, filters.to],
    queryFn: () => fetchAdminAnalyticsOverview(filters),
    staleTime: STALE,
    enabled,
  });
}

export function useAdminAnalyticsTrends(filters: AdminAnalyticsFilters, enabled = true) {
  return useQuery({
    queryKey: ['admin-analytics-trends', filters.from, filters.to],
    queryFn: () => fetchAdminAnalyticsTrends(filters),
    staleTime: STALE,
    enabled,
  });
}

export function useAdminAnalyticsFeatureAdoption(filters: AdminAnalyticsFilters, enabled = true) {
  return useQuery({
    queryKey: ['admin-analytics-feature-adoption', filters.from, filters.to, filters.moduleKey],
    queryFn: () => fetchAdminAnalyticsFeatureAdoption(filters),
    staleTime: STALE,
    enabled,
  });
}

export function useAdminAnalyticsFunnel(filters: AdminAnalyticsFilters, enabled = true) {
  return useQuery({
    queryKey: ['admin-analytics-funnel', filters.from, filters.to],
    queryFn: () => fetchAdminAnalyticsFunnel(filters),
    staleTime: STALE,
    enabled,
  });
}

export function useAdminAnalyticsCohorts(
  opts: { cohortType?: 'weekly' | 'monthly'; limit?: number },
  enabled = true,
) {
  return useQuery({
    queryKey: ['admin-analytics-cohorts', opts.cohortType ?? 'monthly', opts.limit ?? 6],
    queryFn: () => fetchAdminAnalyticsCohorts(opts),
    staleTime: STALE,
    enabled,
  });
}

export function useAdminAnalyticsTopTools(
  filters: AdminAnalyticsFilters & { topN?: number },
  enabled = true,
) {
  return useQuery({
    queryKey: ['admin-analytics-top-tools', filters.from, filters.to, filters.topN ?? 10],
    queryFn: () => fetchAdminAnalyticsTopTools(filters),
    staleTime: STALE,
    enabled,
  });
}
