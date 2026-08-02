import { api } from '@/lib/api/client';

export type LocalLifecycle =
  | 'PROPOSED'
  | 'APPROVED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'STALE'
  | 'UNKNOWN';

export type LocalObservationDisposition =
  | 'DEFAULT'
  | 'FOLLOWING'
  | 'DISMISSED'
  | 'NOT_RELEVANT';

export interface AroundYourHomeItem {
  propertyMatchId: string;
  observation: {
    externalId: string;
    observationType: string;
    lifecycleStatus: LocalLifecycle;
    observedAt: string | null;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    revision: number;
    facts: {
      title?: string;
      summary?: string;
      description?: string;
      officialStatus?: string;
      projectType?: string;
    };
  };
  geography: {
    type: string;
    key: string | null;
    precision: string;
    matchedGeography: string;
    point: { latitude: number; longitude: number } | null;
    distanceMiles: number | null;
  };
  source: {
    key: string;
    family: string;
    provider: string;
    url: string | null;
    publishedAt: string | null;
    lastCheckedAt: string;
    termsVersion: string | null;
  };
  possibleRelevance: {
    safetyTier: 'LOW_CONSEQUENCE' | 'MATERIAL_FINANCIAL' | 'SAFETY_EMERGENCY';
    relevance: string;
    materiality: string;
    confidence: number;
    explanation: string;
    missingFacts: string[];
    boundary: string;
  };
  interaction: {
    disposition: LocalObservationDisposition;
    seenAt: string | null;
    lastSeenRevision: number | null;
    hasMaterialUpdate: boolean;
  };
  hierarchyRank: number;
}

export interface AroundYourHomeView {
  property: {
    id: string;
    name: string | null;
    city: string;
    state: string;
    zipCode: string;
    latitude: number | null;
    longitude: number | null;
  };
  coverage: {
    state: 'CURRENT' | 'DEGRADED' | 'STALE' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
    comprehensive: false;
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
  items: AroundYourHomeItem[];
  map: {
    points: AroundYourHomeItem[];
    unplottedCount: number;
    precisionNote: string;
  };
  interpretationBoundary: string;
}

export async function getAroundYourHome(propertyId: string) {
  const response = await api.get(`/api/properties/${propertyId}/around-your-home`);
  return response.data as AroundYourHomeView;
}

export async function updateAroundYourHomeInteraction(
  propertyId: string,
  propertyMatchId: string,
  input: {
    action: 'FOLLOW' | 'DISMISS' | 'NOT_RELEVANT' | 'MARK_SEEN';
    reason?: string;
  },
) {
  return api.post(
    `/api/properties/${propertyId}/around-your-home/${propertyMatchId}/interaction`,
    input,
  );
}
