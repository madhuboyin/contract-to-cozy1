// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/timeline/homeEventsApi.ts
import { api } from '@/lib/api/client';
import type { PropertyContextEnvelope } from '@/components/property-context/propertyContextTypes';

export type HomeEventType =
  | 'PURCHASE' | 'DOCUMENT' | 'REPAIR' | 'MAINTENANCE'
  | 'CLAIM' | 'IMPROVEMENT' | 'VALUE_UPDATE' | 'INSPECTION'
  | 'NOTE' | 'MILESTONE' | 'OTHER';

export type HomeEventImportance = 'LOW' | 'NORMAL' | 'HIGH' | 'HIGHLIGHT';
export type HomeEventDatePrecision = 'EXACT_DATE' | 'MONTH' | 'YEAR' | 'RANGE' | 'UNKNOWN';
export type HomeEventObservationKind =
  | 'OBSERVED' | 'USER_REPORTED' | 'EVIDENCE_DERIVED' | 'INFERRED' | 'SYSTEM_GENERATED';
export type HomeEventVerificationStatus =
  | 'UNVERIFIED' | 'PENDING_CONFIRMATION' | 'HOMEOWNER_CONFIRMED' | 'EVIDENCE_VERIFIED' | 'DISPUTED';

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
  datePrecision: HomeEventDatePrecision;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  observationKind: HomeEventObservationKind;
  verificationStatus: HomeEventVerificationStatus;
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
  parentEventId?: string | null;
  groupType?: string | null;
  revision?: number;
  correctionReason?: string | null;
  evidence?: Array<{ id: string; evidenceType: string; note: string | null; documentId: string | null }>;
  childEvents?: Array<{ id: string; title: string; occurredAt: string; datePrecision: HomeEventDatePrecision }>;
}

export interface TimelineProjectionEntry {
  id: string;
  kind: 'EVENT' | 'SIGNAL';
  occurredAt: string;
  title: string;
  summary: string | null;
  eventType: string | null;
  signalKey: string | null;
  sourceModel: string;
  sourceId: string;
  roomId: string | null;
  homeItemId: string | null;
  payloadJson: Record<string, unknown> | null;
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

export type CreateHomeEventPayload = {
  type: HomeEventType;
  title: string;
  occurredAt: string; // ISO datetime
  summary?: string | null;
  amount?: number | null;
  datePrecision?: HomeEventDatePrecision;
  dateRangeStart?: string | null;
  dateRangeEnd?: string | null;
  parentEventId?: string | null;
  groupType?: string | null;
  inventoryItemId?: string | null;
  guidanceJourneyId?: string | null;
  isRetrospective?: boolean;
  meta?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
};

type HomeEventsResponse = {
  events: HomeEvent[];
  signalEvents?: TimelineProjectionEntry[];
  timelineEntries?: TimelineProjectionEntry[];
  context?: PropertyContextEnvelope;
};
export async function createHomeEvent(propertyId: string, payload: CreateHomeEventPayload) {
  return api.post<{ event: HomeEvent }>(
    `/api/properties/${propertyId}/home-events`,
    payload
  );
}

export async function getHomeEvent(propertyId: string, eventId: string) {
  const response = await api.get<{ event: HomeEvent }>(
    `/api/properties/${propertyId}/home-events/${eventId}`,
  );
  return response.data.event;
}

export async function correctHomeEvent(
  propertyId: string,
  eventId: string,
  payload: Partial<CreateHomeEventPayload> & { correctionReason: string },
) {
  const response = await api.patch<{ event: HomeEvent }>(
    `/api/properties/${propertyId}/home-events/${eventId}`,
    payload,
  );
  return response.data.event;
}

export async function confirmHomeEvent(
  propertyId: string,
  eventId: string,
  status: 'HOMEOWNER_CONFIRMED' | 'DISPUTED',
  reason: string,
) {
  return api.post(`/api/properties/${propertyId}/home-events/${eventId}/confirmation`, { status, reason });
}

export async function addHomeEventEvidence(
  propertyId: string,
  eventId: string,
  payload: {
    evidenceType: 'DOCUMENT' | 'PHOTO' | 'RECEIPT' | 'INVOICE' | 'INSPECTION' | 'CLAIM' | 'REPAIR_RECORD' | 'USER_ATTESTATION' | 'DOMAIN_RECORD';
    documentId?: string | null;
    sourceEntityType?: string | null;
    sourceEntityId?: string | null;
    observedAt?: string | null;
    note?: string | null;
  },
) {
  return api.post(`/api/properties/${propertyId}/home-events/${eventId}/evidence`, payload);
}

export async function exportHomeEvents(propertyId: string, eventIds: string[]) {
  const response = await api.post(`/api/properties/${propertyId}/home-events/export`, { eventIds });
  return response.data;
}

export async function getHomeEventAnnualRecap(propertyId: string, year: number) {
  const response = await api.get(`/api/properties/${propertyId}/home-events/annual-recap?year=${year}`);
  return response.data;
}

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
