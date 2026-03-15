// apps/backend/src/services/adminAnalytics/types.ts
//
// Shared TypeScript types for admin analytics metric responses.

// ============================================================================
// DATE RANGE
// ============================================================================

export interface DateRange {
  from: Date;
  to: Date;
}

// ============================================================================
// OVERVIEW
// ============================================================================

export interface ActivationMetrics {
  totalProperties: number;
  activatedProperties: number;
  activationRate: number; // 0–1
  newActivationsInPeriod: number;
}

export interface ActiveHomesMetrics {
  weeklyActiveHomes: number;   // WAH: distinct propertyIds with events in last 7d
  monthlyActiveHomes: number;  // MAH: distinct propertyIds with events in last 30d
  wahOverMah: number | null;   // stickiness ratio
  /** Explanation of any approximation in the WAH/trend figures. Present when applicable. */
  wahNote?: string;
}

export interface InteractionsMetrics {
  totalInteractions: number;
  avgInteractionsPerActiveHome: number;
  medianInteractionsPerHome: number | null;
}

export interface DecisionsGuidedMetrics {
  totalDecisionsGuided: number;
  byModule: Array<{ moduleKey: string; count: number }>;
}

export interface AdminOverviewResponse {
  period: { from: string; to: string };
  activation: ActivationMetrics;
  activeHomes: ActiveHomesMetrics;
  interactions: InteractionsMetrics;
  decisionsGuided: DecisionsGuidedMetrics;
}

// ============================================================================
// TRENDS
// ============================================================================

export interface DailyTrendPoint {
  date: string; // ISO date "YYYY-MM-DD"
  wah: number;
  eventCount: number;
  activeProperties: number;
}

export interface AdminTrendsResponse {
  period: { from: string; to: string };
  granularity: 'day';
  series: DailyTrendPoint[];
}

// ============================================================================
// FEATURE ADOPTION
// ============================================================================

export interface FeatureAdoptionRow {
  moduleKey: string;
  featureKey: string;
  uniqueHomes: number;
  totalEvents: number;
  adoptionRate: number; // unique homes / total activated homes (0–1)
}

export interface AdminFeatureAdoptionResponse {
  period: { from: string; to: string };
  totalActivatedHomes: number;
  features: FeatureAdoptionRow[];
}

// ============================================================================
// FUNNEL
// ============================================================================

export interface FunnelStage {
  stage: string;
  label: string;
  count: number;
  dropoffFromPrevious: number | null; // absolute count dropped
  conversionFromPrevious: number | null; // 0–1
}

export interface AdminFunnelResponse {
  period: { from: string; to: string };
  stages: FunnelStage[];
}

// ============================================================================
// COHORTS
// ============================================================================

export interface CohortRetentionRow {
  cohortKey: string; // e.g., "2026-01" for monthly cohort
  cohortSize: number;
  retentionByWeek: Array<{
    weekOffset: number;
    activeCount: number;
    retentionRate: number; // 0–1
  }>;
}

export interface AdminCohortResponse {
  cohortType: 'weekly' | 'monthly';
  cohorts: CohortRetentionRow[];
}

// ============================================================================
// TOP TOOLS
// ============================================================================

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
