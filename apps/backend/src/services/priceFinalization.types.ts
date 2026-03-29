export const PRICE_FINALIZATION_STATUSES = [
  'DRAFT',
  'FINALIZED',
  'ARCHIVED',
] as const;

export const PRICE_FINALIZATION_SOURCE_TYPES = [
  'MANUAL',
  'NEGOTIATION_SHIELD',
  'QUOTE_COMPARISON',
  'SERVICE_PRICE_RADAR',
] as const;

export const PRICE_FINALIZATION_TERM_TYPES = [
  'SCOPE',
  'PAYMENT',
  'WARRANTY',
  'TIMELINE',
  'CANCELLATION',
  'MATERIALS',
  'OTHER',
] as const;

export type PriceFinalizationStatus = (typeof PRICE_FINALIZATION_STATUSES)[number];
export type PriceFinalizationSourceType = (typeof PRICE_FINALIZATION_SOURCE_TYPES)[number];
export type PriceFinalizationTermType = (typeof PRICE_FINALIZATION_TERM_TYPES)[number];

export type PriceFinalizationTermInput = {
  termType: PriceFinalizationTermType;
  label: string;
  value: string;
  sortOrder?: number;
  isAccepted?: boolean;
};

export type PriceFinalizationCreateInput = {
  inventoryItemId?: string | null;
  homeAssetId?: string | null;
  guidanceJourneyId?: string | null;
  guidanceStepKey?: string | null;
  guidanceSignalIntentFamily?: string | null;

  sourceType?: PriceFinalizationSourceType;

  serviceCategory?: string | null;
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

  // Phase-3: actual spend capture (stored in metadataJson._actualSpendCents)
  actualSpendCents?: number | null;
};

export type PriceFinalizationUpdateInput = Partial<PriceFinalizationCreateInput> & {
  allowPostFinalizeEdits?: boolean;
};

export type PriceFinalizationFinalizeInput = PriceFinalizationUpdateInput;

export type PriceFinalizationTermDTO = {
  id: string;
  termType: PriceFinalizationTermType;
  label: string;
  value: string;
  sortOrder: number;
  isAccepted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PriceFinalizationDetailDTO = {
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
  serviceCategory: string | null;
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
  terms: PriceFinalizationTermDTO[];
  // Phase-3: actual spend feedback surface (sourced from metadataJson._actualSpendCents)
  actualSpendCents: number | null;
};

export type PriceFinalizationListResponse = {
  items: PriceFinalizationDetailDTO[];
};
