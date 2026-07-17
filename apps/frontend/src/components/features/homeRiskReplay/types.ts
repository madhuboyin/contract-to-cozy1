import type { PropertyContextEnvelope } from '@/components/property-context/PropertyContextNotice';

export type HomeRiskReplayWindowType = 'since_built' | 'last_5_years' | 'custom_range';

export type HomeRiskReplaySeverity = 'info' | 'low' | 'moderate' | 'high' | 'severe';

export type HomeRiskReplayStatus = 'pending' | 'completed' | 'failed';

export interface HomeRiskReplayImpactDriver {
  code: string;
  effect?: 'increase' | 'decrease' | 'neutral';
  description?: string;
}

export interface HomeRiskReplayAction {
  code: string;
  label: string;
  priority?: 'high' | 'medium' | 'low';
}

export interface HomeRiskReplaySystem {
  type: string;
  id: string | null;
  label: string;
  relevance?: 'high' | 'medium' | 'low';
}

export interface HomeRiskReplaySummaryJson {
  timelineSummary?: string | null;
  topDrivers?: string[];
  notes?: string[];
}

export interface HomeRiskReplayPropertySnapshotJson {
  propertyContextVersion?: string | null;
  yearBuilt?: number | null;
  propertySize?: number | null;
  dwellingType?: string | null;
  location?: {
    state?: string | null;
    county?: string | null;
    city?: string | null;
    zip?: string | null;
  } | null;
  systems?: Record<string, unknown> | null;
}

export interface HomeRiskReplayTimelineEvent {
  id: string;
  homeRiskEventId: string;
  eventType: string;
  eventSubType: string | null;
  title: string;
  summary: string | null;
  severity: HomeRiskReplaySeverity;
  startAt: string;
  endAt: string | null;
  matchScore: number | null;
  impactLevel: HomeRiskReplaySeverity;
  impactSummary: string | null;
  impactFactorsJson?: {
    event?: {
      type?: string;
      subType?: string | null;
      severity?: HomeRiskReplaySeverity;
      startAt?: string;
      endAt?: string | null;
      durationDays?: number;
    };
    property?: {
      yearBuilt?: number | null;
      propertySize?: number | null;
      dwellingType?: string | null;
    };
    locationMatch?: {
      basis?: string;
      score?: number;
    };
    drivers?: HomeRiskReplayImpactDriver[];
  } | null;
  recommendedActionsJson?: {
    actions?: HomeRiskReplayAction[];
  } | null;
  matchedSystemsJson?: {
    systems?: HomeRiskReplaySystem[];
  } | null;
}

export interface HomeRiskReplayImpactSummary {
  id: string;
  eventType: string;
  title: string;
  impactLevel: HomeRiskReplaySeverity;
  impactSummary: string | null;
  startAt: string;
}

export interface HomeRiskReplayDetail {
  id: string;
  propertyId: string;
  createdAt?: string | null;
  completedAt?: string | null;
  windowType: HomeRiskReplayWindowType;
  windowStart: string | null;
  windowEnd: string | null;
  status: HomeRiskReplayStatus;
  totalEvents: number;
  highImpactEvents: number;
  moderateImpactEvents: number;
  summaryText: string | null;
  summaryJson?: HomeRiskReplaySummaryJson | null;
  propertySnapshotJson?: HomeRiskReplayPropertySnapshotJson | null;
  engineVersion?: string | null;
  totals?: {
    totalEvents: number;
    highImpactEvents: number;
    moderateImpactEvents: number;
  };
  impactSummaries?: HomeRiskReplayImpactSummary[];
  matchedSystems?: HomeRiskReplaySystem[];
  recommendedActions?: HomeRiskReplayAction[];
  timelineEvents: HomeRiskReplayTimelineEvent[];
  propertyContext?: PropertyContextEnvelope;
}

export interface HomeRiskReplayRunSummary {
  id: string;
  createdAt: string;
  windowType: HomeRiskReplayWindowType;
  windowStart: string | null;
  windowEnd: string | null;
  status: HomeRiskReplayStatus;
  totalEvents: number;
  highImpactEvents: number;
  moderateImpactEvents: number;
  summaryText: string | null;
  generatedContextVersion?: string | null;
  isStale?: boolean;
}
