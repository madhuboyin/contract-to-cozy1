import { api } from './client';
import type { ServiceCategory } from '@/types';

export type PriceFinalizationStatus = 'DRAFT' | 'FINALIZED' | 'ARCHIVED';
export type PriceFinalizationSourceType =
  | 'MANUAL'
  | 'NEGOTIATION_SHIELD'
  | 'QUOTE_COMPARISON'
  | 'SERVICE_PRICE_RADAR';
export type PriceFinalizationTermType =
  | 'SCOPE'
  | 'PAYMENT'
  | 'WARRANTY'
  | 'TIMELINE'
  | 'CANCELLATION'
  | 'MATERIALS'
  | 'OTHER';

export type PriceFinalizationTerm = {
  id: string;
  termType: PriceFinalizationTermType;
  label: string;
  value: string;
  sortOrder: number;
  isAccepted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PriceFinalizationDetail = {
  id: string;
  propertyId: string;
  createdByUserId: string | null;
  inventoryItemId: string | null;
  homeAssetId: string | null;
  guidanceJourneyId: string | null;
  guidanceStepKey: string | null;
  guidanceSignalIntentFamily: string | null;
  sourceType: PriceFinalizationSourceType;
  status: PriceFinalizationStatus;
  serviceCategory: ServiceCategory | null;
  vendorName: string | null;
  acceptedPrice: number | null;
  quotePrice: number | null;
  currency: string;
  scopeSummary: string | null;
  paymentTerms: string | null;
  warrantyTerms: string | null;
  timelineTerms: string | null;
  notes: string | null;
  acceptedTermsJson: Record<string, unknown> | null;
  metadataJson: Record<string, unknown> | null;
  negotiationShieldCaseId: string | null;
  serviceRadarCheckId: string | null;
  quoteComparisonWorkspaceId: string | null;
  finalizedAt: string | null;
  bookingId: string | null;
  createdAt: string;
  updatedAt: string;
  terms: PriceFinalizationTerm[];
};

export type PriceFinalizationTermInput = {
  termType: PriceFinalizationTermType;
  label: string;
  value: string;
  sortOrder?: number;
  isAccepted?: boolean;
};

export type PriceFinalizationDraftInput = {
  inventoryItemId?: string | null;
  homeAssetId?: string | null;
  guidanceJourneyId?: string | null;
  guidanceStepKey?: string | null;
  guidanceSignalIntentFamily?: string | null;
  sourceType?: PriceFinalizationSourceType;
  serviceCategory?: ServiceCategory | null;
  vendorName?: string | null;
  acceptedPrice?: number | null;
  quotePrice?: number | null;
  currency?: string | null;
  scopeSummary?: string | null;
  paymentTerms?: string | null;
  warrantyTerms?: string | null;
  timelineTerms?: string | null;
  notes?: string | null;
  acceptedTermsJson?: Record<string, unknown> | null;
  metadataJson?: Record<string, unknown> | null;
  negotiationShieldCaseId?: string | null;
  serviceRadarCheckId?: string | null;
  quoteComparisonWorkspaceId?: string | null;
  terms?: PriceFinalizationTermInput[];
};

export type PriceFinalizationUpdateInput = PriceFinalizationDraftInput & {
  allowPostFinalizeEdits?: boolean;
};

export async function listPriceFinalizations(
  propertyId: string,
  limit = 20
): Promise<PriceFinalizationDetail[]> {
  const res = await api.get<{ items: PriceFinalizationDetail[] }>(
    `/api/properties/${propertyId}/price-finalizations`,
    { params: { limit } }
  );
  return res.data.items;
}

export async function getPriceFinalization(
  propertyId: string,
  finalizationId: string
): Promise<PriceFinalizationDetail> {
  const res = await api.get<{ finalization: PriceFinalizationDetail }>(
    `/api/properties/${propertyId}/price-finalizations/${finalizationId}`
  );
  return res.data.finalization;
}

export async function createPriceFinalizationDraft(
  propertyId: string,
  payload: PriceFinalizationDraftInput
): Promise<PriceFinalizationDetail> {
  const res = await api.post<{ finalization: PriceFinalizationDetail }>(
    `/api/properties/${propertyId}/price-finalizations`,
    payload
  );
  return res.data.finalization;
}

export async function updatePriceFinalizationDraft(
  propertyId: string,
  finalizationId: string,
  payload: PriceFinalizationUpdateInput
): Promise<PriceFinalizationDetail> {
  const res = await api.put<{ finalization: PriceFinalizationDetail }>(
    `/api/properties/${propertyId}/price-finalizations/${finalizationId}`,
    payload
  );
  return res.data.finalization;
}

export async function finalizePriceFinalization(
  propertyId: string,
  finalizationId: string,
  payload: PriceFinalizationUpdateInput
): Promise<PriceFinalizationDetail> {
  const res = await api.post<{ finalization: PriceFinalizationDetail }>(
    `/api/properties/${propertyId}/price-finalizations/${finalizationId}/finalize`,
    payload
  );
  return res.data.finalization;
}
