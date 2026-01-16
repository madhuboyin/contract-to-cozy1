// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/timeline/homeEventsApi.ts
import { api } from '@/lib/api/client';

export type HomeEventListParams = {
  type?: string;
  importance?: string;
  roomId?: string;
  inventoryItemId?: string;
  claimId?: string;
  from?: string; // ISO datetime string
  to?: string;   // ISO datetime string
  limit?: number;
};

type HomeEventsResponse = {
  events: any[];
};
export async function listHomeEvents(propertyId: string, params: HomeEventListParams = {}) {
  const qs = new URLSearchParams();

  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    qs.set(k, String(v));
  });

  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return api.get<{ data: HomeEventsResponse }>(
    `/properties/${propertyId}/home-events${suffix}`
  );
}
