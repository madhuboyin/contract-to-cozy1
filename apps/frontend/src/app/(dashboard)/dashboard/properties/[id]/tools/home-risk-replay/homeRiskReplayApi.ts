import { api } from '@/lib/api/client';

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
