// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/capital-timeline/capitalTimelineApi.ts
import { api } from '@/lib/api/client';

export type TimelineItemDTO = {
  id: string;
  inventoryItemId: string | null;
  category: string;
  eventType: string;
  windowStart: string;
  windowEnd: string;
  estimatedCostMinCents: number | null;
  estimatedCostMaxCents: number | null;
  currency: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  why: string;
  inventoryItem?: { name: string; brand?: string | null; model?: string | null } | null;
};

export type TimelineAnalysisDTO = {
  id: string;
  status: 'READY' | 'STALE' | 'ERROR';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  horizonYears: number;
  summary: string | null;
  computedAt: string;
  items: TimelineItemDTO[];
};

export type OverrideDTO = {
  id: string;
  inventoryItemId: string | null;
  type: string;
  payload: Record<string, unknown>;
  note: string | null;
};

export async function getLatestTimeline(propertyId: string) {
  const res = await api.get(`/api/properties/${propertyId}/capital-timeline`);
  return res.data?.analysis as TimelineAnalysisDTO | null;
}

export async function runTimeline(propertyId: string, horizonYears: number = 10) {
  const res = await api.post(`/api/properties/${propertyId}/capital-timeline/run`, {
    horizonYears,
  });
  return res.data?.analysis as TimelineAnalysisDTO;
}

export async function listOverrides(propertyId: string) {
  const res = await api.get(`/api/properties/${propertyId}/capital-timeline/overrides`);
  return res.data?.overrides as OverrideDTO[];
}

export async function createOverride(propertyId: string, body: Omit<OverrideDTO, 'id'>) {
  const res = await api.post(`/api/properties/${propertyId}/capital-timeline/overrides`, body);
  return res.data?.override as OverrideDTO;
}

export async function updateOverride(propertyId: string, overrideId: string, body: Partial<OverrideDTO>) {
  const res = await api.patch(`/api/properties/${propertyId}/capital-timeline/overrides/${overrideId}`, body);
  return res.data?.override as OverrideDTO;
}

export async function deleteOverride(propertyId: string, overrideId: string) {
  await api.delete(`/api/properties/${propertyId}/capital-timeline/overrides/${overrideId}`);
}
