// apps/backend/src/types/claims.types.ts

export type ClaimStatus =
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'DENIED'
  | 'CLOSED';

export type ClaimType =
  | 'WATER_DAMAGE'
  | 'FIRE_SMOKE'
  | 'STORM_WIND_HAIL'
  | 'THEFT_VANDALISM'
  | 'LIABILITY'
  | 'HVAC'
  | 'PLUMBING'
  | 'ELECTRICAL'
  | 'APPLIANCE'
  | 'OTHER';

export type ClaimSourceType =
  | 'INSURANCE'
  | 'HOME_WARRANTY'
  | 'MANUFACTURER_WARRANTY'
  | 'OUT_OF_POCKET'
  | 'UNKNOWN';

export type ClaimChecklistStatus = 'OPEN' | 'DONE' | 'NOT_APPLICABLE';

export type ClaimDocumentType =
  | 'PHOTO'
  | 'VIDEO'
  | 'INVOICE'
  | 'ESTIMATE'
  | 'REPORT'
  | 'POLICY'
  | 'COMMUNICATION'
  | 'RECEIPT'
  | 'OTHER';

export type ClaimTimelineEventType =
  | 'CREATED'
  | 'CHECKLIST_GENERATED'
  | 'DOCUMENT_ADDED'
  | 'SUBMITTED'
  | 'INSPECTION_SCHEDULED'
  | 'INSPECTION_COMPLETED'
  | 'ESTIMATE_RECEIVED'
  | 'FOLLOW_UP'
  | 'APPROVED'
  | 'DENIED'
  | 'SETTLEMENT_ISSUED'
  | 'CLOSED'
  | 'NOTE'
  | 'OTHER';

export type CreateClaimInput = {
  title: string;
  description?: string | null;
  type: ClaimType;

  sourceType?: ClaimSourceType;
  providerName?: string | null;
  claimNumber?: string | null;
  externalUrl?: string | null;

  insurancePolicyId?: string | null;
  warrantyId?: string | null;

  incidentAt?: string | null; // ISO
  generateChecklist?: boolean; // default true
};

export type UpdateClaimInput = Partial<{
  title: string;
  description: string | null;
  status: ClaimStatus;

  sourceType: ClaimSourceType;
  providerName: string | null;
  claimNumber: string | null;
  externalUrl: string | null;

  insurancePolicyId: string | null;
  warrantyId: string | null;

  incidentAt: string | null;
  openedAt: string | null;
  submittedAt: string | null;
  closedAt: string | null;

  deductibleAmount: string | null; // Decimal as string
  estimatedLossAmount: string | null;
  settlementAmount: string | null;

  nextFollowUpAt: string | null;
}>;

export type AddClaimDocumentInput = {
  // Document model fields
  type: string; // DocumentType enum string in your schema
  name: string;
  description?: string | null;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  metadata?: any;

  // claim-specific metadata
  claimDocumentType?: ClaimDocumentType;
  title?: string | null;
  notes?: string | null;

  // optional: attach to policy/warranty in Document
  attachToPolicy?: boolean;
  attachToWarranty?: boolean;
};

export type AddTimelineEventInput = {
  type: ClaimTimelineEventType;
  title?: string | null;
  description?: string | null;
  occurredAt?: string | null; // ISO
  meta?: any;
  claimDocumentId?: string | null;
};

export type UpdateChecklistItemInput = {
  status: ClaimChecklistStatus;
  primaryClaimDocumentId?: string | null;
};
