import { api } from '@/lib/api/client';

export type HomeBriefingCadence =
  | 'IMMEDIATE'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'IMPORTANT_ONLY';
export type HomeBriefingChannel = 'IN_APP' | 'EMAIL' | 'PUSH';
export type HomeBriefingTopic =
  | 'HOME_ACTION'
  | 'HOME_HISTORY'
  | 'LOCAL_CHANGE'
  | 'HAZARD'
  | 'PROPERTY_FACT'
  | 'SOURCE_HEALTH'
  | 'OTHER';

export interface HomeBriefingItem {
  id: string;
  propertyChangeId: string;
  canonicalActionId: string | null;
  canonicalEventId: string | null;
  topic: HomeBriefingTopic;
  title: string;
  summary: string;
  materiality: 'INFORMATIONAL' | 'MEANINGFUL' | 'IMPORTANT' | 'URGENT';
  primaryDeepLink: string;
  sourceLineage: {
    sourceType: string;
    sourceEntityId: string;
    sourceRevision: string;
    changeType: string;
    detectedAt: string;
    occurredAt: string | null;
    confidence: number | null;
    safetyTier: 'LOW_CONSEQUENCE' | 'MATERIAL_FINANCIAL' | 'SAFETY_EMERGENCY';
    source?: {
      provider: string;
      url: string | null;
      lastVerifiedAt: string;
      lifecycleStatus: string;
    } | null;
  };
  shareEligible: boolean;
  openedAt: string | null;
  seenAt: string | null;
  actedAt: string | null;
  dismissedAt: string | null;
  notUsefulAt: string | null;
}

export interface HomeBriefingDelivery {
  id: string;
  cadence: HomeBriefingCadence;
  channels: HomeBriefingChannel[];
  windowStart: string;
  windowEnd: string;
  status: 'GENERATED' | 'DELIVERED' | 'OPENED' | 'ARCHIVED';
  itemCount: number;
  sourceHealthSnapshot: {
    comprehensive: false;
    capturedAt: string;
    sources: Array<{
      source: { key: string; family: string; provider: string };
      state: string;
      checkedThrough: string | null;
      limitations: string[];
    }>;
    scopeLimitations: string[];
  };
  quietReasonCodes: string[];
  baselineVersion: string;
  generatedAt: string;
  deliveredAt: string | null;
  openedAt: string | null;
  items: HomeBriefingItem[];
}

export interface HomeBriefingView {
  preference: {
    enabled: boolean;
    cadence: HomeBriefingCadence;
    topics: HomeBriefingTopic[];
    channels: HomeBriefingChannel[];
  };
  current: HomeBriefingDelivery | null;
  archive: HomeBriefingDelivery[];
  unreadMaterialCount: number;
  archiveBoundary: string;
  editorialBoundary: string;
}

export async function getHomeBriefing(propertyId: string) {
  const response = await api.get(`/api/properties/${propertyId}/home-briefing`);
  return response.data as HomeBriefingView;
}

export async function generateHomeBriefing(propertyId: string) {
  const response = await api.post(`/api/properties/${propertyId}/home-briefing/generate`, {});
  return response.data as HomeBriefingDelivery;
}

export async function updateHomeBriefingPreferences(
  propertyId: string,
  input: {
    enabled: boolean;
    cadence: HomeBriefingCadence;
    topics: HomeBriefingTopic[];
    channels: HomeBriefingChannel[];
  },
) {
  return api.put(`/api/properties/${propertyId}/home-briefing/preferences`, input);
}

export async function openHomeBriefing(propertyId: string, deliveryId: string) {
  return api.post(
    `/api/properties/${propertyId}/home-briefing/deliveries/${deliveryId}/open`,
    {},
  );
}

export async function recordHomeBriefingOutcome(
  propertyId: string,
  itemId: string,
  outcome: 'OPENED' | 'SEEN' | 'ACTED' | 'DISMISSED' | 'NOT_USEFUL',
  note?: string,
) {
  return api.post(
    `/api/properties/${propertyId}/home-briefing/items/${itemId}/outcome`,
    { outcome, ...(note ? { note } : {}) },
  );
}

export async function createHomeBriefingShare(
  propertyId: string,
  deliveryId: string,
  itemIds: string[],
) {
  const response = await api.post(
    `/api/properties/${propertyId}/home-briefing/deliveries/${deliveryId}/share`,
    { itemIds, expiresInDays: 7 },
  );
  return response.data as {
    share: { id: string; expiresAt: string };
    shareUrl: string;
    selectedItemCount: number;
  };
}
