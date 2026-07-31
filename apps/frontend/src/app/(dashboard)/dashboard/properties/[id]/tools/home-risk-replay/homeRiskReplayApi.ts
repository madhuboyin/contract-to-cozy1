import { api } from '@/lib/api/client';
import type {
  HomeRiskReplayDetail,
  HomeRiskReplayRunSummary,
  HomeRiskReplayWindowType,
} from '@/components/features/homeRiskReplay/types';

export type PropertyHazardEffectStatus =
  | 'UNKNOWN'
  | 'NO_OBSERVED_EFFECT'
  | 'OBSERVED_EFFECT_CONFIRMED';

export type PropertyHazardEvidenceKind =
  | 'CLAIM'
  | 'INSPECTION'
  | 'REPAIR'
  | 'PHOTO'
  | 'DOCUMENT'
  | 'USER_ATTESTATION';

export interface PastHazardExposureItem {
  propertyMatchId: string;
  hazardType: string;
  hazardLabel: string;
  category: 'PAST_EVENT' | 'LONG_TERM_CONTEXT';
  title: string;
  factualSummary: string | null;
  lifecycleStatus: string;
  observedAt: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  geography: {
    sourceType: string;
    sourceKey: string | null;
    matchedGeography: string;
    precision: string;
    distanceMiles: number | null;
    matchMethod: string;
  };
  source: {
    key: string;
    provider: string;
    url: string | null;
    publishedAt: string | null;
    lastVerifiedAt: string;
    revision: number;
  };
  interpretation: {
    relevance: string;
    confidence: number;
    missingFacts: string[];
    boundedExplanation: string;
  };
  propertyEffect: {
    outcomeId: string | null;
    status: PropertyHazardEffectStatus;
    effectObservedAt: string | null;
    note: string | null;
    explanation: string;
    evidence: Array<{
      id: string;
      kind: PropertyHazardEvidenceKind;
      note: string | null;
      claim?: { id: string; title: string; status: string } | null;
      homeEvent?: { id: string; title: string; type: string; occurredAt: string } | null;
      document?: { id: string; name: string; type: string } | null;
    }>;
    canonicalActionId: string | null;
    canonicalTimelineEventId: string | null;
  };
}

export interface PastHazardExposureView {
  propertyId: string;
  generatedAt: string;
  coverage: {
    state: 'CURRENT' | 'DEGRADED' | 'STALE' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
    comprehensive: false;
    checkedThrough: string | null;
    sources: Array<{
      source: { key: string; family: string; provider: string; termsVersion: string | null };
      geography: { type: string; key: string | null } | null;
      state: string;
      checkedThrough: string | null;
      limitations: string[];
      reasonCodes: string[];
    }>;
    limitations: string[];
  };
  longTermContext: PastHazardExposureItem[];
  pastEvents: PastHazardExposureItem[];
  emptyState: string | null;
}

export interface GenerateHomeRiskReplayInput {
  windowType: HomeRiskReplayWindowType;
  windowStart?: string | null;
  windowEnd?: string | null;
  forceRegenerate?: boolean;
}

export type HomeRiskReplayLaunchSurface =
  | 'home_tools'
  | 'property_hub'
  | 'property_summary'
  | 'roof_page'
  | 'plumbing_page'
  | 'electrical_page'
  | 'insights_strip'
  | 'system_detail'
  | 'unknown';

export async function listHomeRiskReplayRuns(propertyId: string, limit = 12) {
  const res = await api.get(`/api/properties/${propertyId}/risk-replay/runs?limit=${limit}`);
  return (res.data?.runs ?? []) as HomeRiskReplayRunSummary[];
}

export async function getHomeRiskReplayDetail(propertyId: string, replayRunId: string) {
  const res = await api.get(`/api/properties/${propertyId}/risk-replay/runs/${replayRunId}`);
  const replay = res.data?.replay as HomeRiskReplayDetail | undefined;

  if (!replay) {
    throw new Error('Replay detail was missing from the response.');
  }

  return replay;
}

export async function generateHomeRiskReplay(propertyId: string, input: GenerateHomeRiskReplayInput) {
  const res = await api.post(`/api/properties/${propertyId}/risk-replay/runs`, input);
  const replay = res.data?.replay as HomeRiskReplayDetail | undefined;

  if (!replay) {
    throw new Error('Replay result was missing from the response.');
  }

  return {
    replay,
    reused: Boolean(res.data?.reused),
  };
}

export async function trackHomeRiskReplayEvent(
  propertyId: string,
  payload: {
    event: string;
    section?: string;
    metadata?: Record<string, unknown>;
  }
) {
  await api.trackHomeRiskReplayEvent(propertyId, payload);
}

export async function getPastHazardExposure(
  propertyId: string,
  filters: { from?: string; to?: string; hazardType?: string } = {},
) {
  const query = new URLSearchParams();
  if (filters.from) query.set('from', new Date(`${filters.from}T00:00:00Z`).toISOString());
  if (filters.to) query.set('to', new Date(`${filters.to}T23:59:59Z`).toISOString());
  if (filters.hazardType) query.set('hazardType', filters.hazardType);
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  const response = await api.get(`/api/properties/${propertyId}/past-hazard-exposure${suffix}`);
  return response.data as PastHazardExposureView;
}

export async function recordPastHazardOutcome(
  propertyId: string,
  propertyMatchId: string,
  input: {
    status: PropertyHazardEffectStatus;
    effectObservedAt?: string | null;
    note: string;
  },
) {
  return api.post(
    `/api/properties/${propertyId}/past-hazard-exposure/${propertyMatchId}/outcome`,
    input,
  );
}

export async function linkPastHazardEvidence(
  propertyId: string,
  outcomeId: string,
  input: {
    kind: PropertyHazardEvidenceKind;
    claimId?: string | null;
    homeEventId?: string | null;
    documentId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    note?: string | null;
  },
) {
  return api.post(
    `/api/properties/${propertyId}/past-hazard-exposure/outcomes/${outcomeId}/evidence`,
    input,
  );
}
