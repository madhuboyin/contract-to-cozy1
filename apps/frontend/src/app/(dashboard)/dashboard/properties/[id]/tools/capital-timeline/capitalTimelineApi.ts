// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/capital-timeline/capitalTimelineApi.ts
import { api } from '@/lib/api/client';
import type { PropertyContextEnvelope } from '@/components/property-context/PropertyContextNotice';

export type ConfidenceFactor = 'INSTALL_DATE' | 'CONDITION' | 'REPLACEMENT_COST';

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
  missingFactors: ConfidenceFactor[];
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

export type TimelineNextAction = {
  href: string;
  label: string;
  reason: string;
};

export type TimelineAnalysisResult = {
  analysis: TimelineAnalysisDTO | null;
  assumptionSetId: string | null;
  nextAction: TimelineNextAction | null;
  propertyContext?: PropertyContextEnvelope;
};

export type OverrideType =
  | 'PLANNED_DATE'
  | 'PLANNED_WINDOW'
  | 'COST_OVERRIDE'
  | 'DISABLE_ITEM'
  | 'ADJUST_REMAINING_LIFE'
  | 'NOTE';

export type OverrideDTO = {
  id: string;
  inventoryItemId: string | null;
  type: OverrideType;
  payload: Record<string, unknown>;
  note: string | null;
};

export async function getLatestTimeline(propertyId: string): Promise<TimelineAnalysisResult> {
  const res = await api.get(`/api/properties/${propertyId}/capital-timeline`);
  return {
    analysis: (res.data?.analysis as TimelineAnalysisDTO | null) ?? null,
    assumptionSetId: (res.data?.assumptionSetId as string | null) ?? null,
    nextAction: (res.data?.nextAction as TimelineNextAction | null) ?? null,
    propertyContext: res.data?.propertyContext as PropertyContextEnvelope | undefined,
  };
}

export async function runTimeline(
  propertyId: string,
  horizonYears: number = 10,
  options?: { assumptionSetId?: string | null }
): Promise<TimelineAnalysisResult> {
  const res = await api.post(`/api/properties/${propertyId}/capital-timeline/run`, {
    horizonYears,
    ...(options?.assumptionSetId ? { assumptionSetId: options.assumptionSetId } : {}),
  });
  return {
    analysis: (res.data?.analysis as TimelineAnalysisDTO | null) ?? null,
    assumptionSetId: (res.data?.assumptionSetId as string | null) ?? null,
    nextAction: (res.data?.nextAction as TimelineNextAction | null) ?? null,
    propertyContext: res.data?.propertyContext as PropertyContextEnvelope | undefined,
  };
}

export async function listOverrides(propertyId: string): Promise<OverrideDTO[]> {
  const res = await api.get(`/api/properties/${propertyId}/capital-timeline/overrides`);
  return (res.data?.overrides as OverrideDTO[]) ?? [];
}

export async function createOverride(
  propertyId: string,
  body: Omit<OverrideDTO, 'id'>
): Promise<OverrideDTO> {
  const res = await api.post(`/api/properties/${propertyId}/capital-timeline/overrides`, body);
  return res.data?.override as OverrideDTO;
}

export async function updateOverride(
  propertyId: string,
  overrideId: string,
  body: Partial<Pick<OverrideDTO, 'payload' | 'note'>>
): Promise<OverrideDTO> {
  const res = await api.patch(
    `/api/properties/${propertyId}/capital-timeline/overrides/${overrideId}`,
    body
  );
  return res.data?.override as OverrideDTO;
}

export async function deleteOverride(propertyId: string, overrideId: string): Promise<void> {
  await api.delete(`/api/properties/${propertyId}/capital-timeline/overrides/${overrideId}`);
}
