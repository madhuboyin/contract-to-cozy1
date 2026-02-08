// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/timeline/homeEventsApi.ts
import { api } from '@/lib/api/client';

export type HomeEventType =
  | 'PURCHASE' | 'DOCUMENT' | 'REPAIR' | 'MAINTENANCE'
  | 'CLAIM' | 'IMPROVEMENT' | 'VALUE_UPDATE' | 'INSPECTION'
  | 'NOTE' | 'MILESTONE' | 'OTHER';

export type HomeEventImportance = 'LOW' | 'NORMAL' | 'HIGH' | 'HIGHLIGHT';

export type HomeEventDocumentKind = 'PHOTO' | 'RECEIPT' | 'INVOICE' | 'PDF' | 'BEFORE' | 'AFTER' | 'OTHER';

export interface HomeEventDocument {
  id: string;
  eventId: string;
  documentId: string;
  kind: HomeEventDocumentKind;
  caption: string | null;
  sortOrder: number;
  createdAt: string;
  document: { id: string; name: string };
}

export interface HomeEvent {
  id: string;
  propertyId: string;
  type: HomeEventType;
  subtype: string | null;
  importance: HomeEventImportance;
  occurredAt: string;
  endAt: string | null;
  title: string;
  summary: string | null;
  amount: string | null;
  currency: string | null;
  valueDelta: string | null;
  meta: Record<string, unknown> | null;
  groupKey: string | null;
  createdAt: string;
  updatedAt: string;
  documents: HomeEventDocument[];
}

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
  events: HomeEvent[];
};
export async function listHomeEvents(propertyId: string, params: HomeEventListParams = {}) {
  const qs = new URLSearchParams();

  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    qs.set(k, String(v));
  });

  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return api.get<{ data: HomeEventsResponse }>(
    `/api/properties/${propertyId}/home-events${suffix}`
  );
}
