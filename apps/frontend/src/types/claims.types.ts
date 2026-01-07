// apps/frontend/src/types/claims.types.ts

// ==============================
// ENUMS (shared with backend)
// ==============================

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

// ==============================
// CORE MODELS (DTOs)
// ==============================

export interface ClaimChecklistItemDTO {
  id: string;
  title: string;
  description?: string | null;
  required: boolean;
  status: ClaimChecklistStatus;
  orderIndex: number;
  completedAt?: string | null;
  primaryClaimDocumentId?: string | null;
}

export interface ClaimTimelineEventDTO {
  id: string;
  type: ClaimTimelineEventType;
  title?: string | null;
  description?: string | null;
  occurredAt: string;
  createdAt: string;
  createdBy?: string;
  claimDocumentId?: string | null;
  meta?: any;
}

export interface ClaimDocumentDTO {
    id: string;
    documentId: string;
    claimDocumentType?: ClaimDocumentType | null;
    title?: string | null;
    notes?: string | null;
  
    createdAt: string;
  }
  

// ==============================
// CLAIM ROOT DTO
// ==============================

export interface ClaimDTO {
  id: string;
  propertyId: string;

  title: string;
  description?: string | null;

  type: ClaimType;
  status: ClaimStatus;
  sourceType?: ClaimSourceType | null;

  providerName?: string | null;
  claimNumber?: string | null;
  externalUrl?: string | null;

  insurancePolicyId?: string | null;
  warrantyId?: string | null;

  incidentAt?: string | null;
  openedAt?: string | null;
  submittedAt?: string | null;
  closedAt?: string | null;

  deductibleAmount?: string | null;
  estimatedLossAmount?: string | null;
  settlementAmount?: string | null;

  nextFollowUpAt?: string | null;

  createdAt: string;
  updatedAt: string;

  checklistItems?: ClaimChecklistItemDTO[];
  timelineEvents?: ClaimTimelineEventDTO[];
  documents?: ClaimDocumentDTO[];

  // Computed fields
  checklistCompletionPct?: number | null;
  lastActivityAt?: string | null;
}

// ==============================
// INPUT TYPES (Frontend → Backend)
// ==============================

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
  
    incidentAt?: string | null;
    generateChecklist?: boolean;
  };
  
  export type UpdateClaimInput = {
    title?: string;
    description?: string | null;
    status?: ClaimStatus;
  
    sourceType?: ClaimSourceType;
    providerName?: string | null;
    claimNumber?: string | null;
    externalUrl?: string | null;
  
    insurancePolicyId?: string | null;
    warrantyId?: string | null;
  
    incidentAt?: string | null;
    openedAt?: string | null;
    submittedAt?: string | null;
    closedAt?: string | null;
  
    deductibleAmount?: string | null;
    estimatedLossAmount?: string | null;
    settlementAmount?: string | null;
  
    nextFollowUpAt?: string | null;
  };
  
  export type AddClaimDocumentInput = {
    // Document model fields
    type: string; // keep loose (matches backend validator)
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
  
    attachToPolicy?: boolean;
    attachToWarranty?: boolean;
  };
  
  export type AddTimelineEventInput = {
    type: ClaimTimelineEventType;
    title?: string | null;
    description?: string | null;
    occurredAt?: string | null;
    meta?: any;
    claimDocumentId?: string | null;
  };
  
  export type UpdateClaimChecklistItemInput = {
    status: ClaimChecklistStatus;
    primaryClaimDocumentId?: string | null;
  };
  
  export type RegenerateChecklistInput = {
    type?: ClaimType;
    replaceExisting?: boolean;
  };
  
  export interface ClaimNestedDocumentDTO {
    id: string;
    type: string; // backend Document.type (string enum or loose)
    name: string;
    description?: string | null;
    fileUrl: string;
    fileSize: number;
    mimeType: string;
    metadata?: any;
    createdAt: string;
  }
  
  export interface ClaimDocumentDTO {
    id: string;
    documentId: string;
  
    claimDocumentType?: ClaimDocumentType | null; // ✅ backend naming
    title?: string | null;
    notes?: string | null;
  
    createdAt: string;
  
    // ✅ because backend includes { document: true }
    document?: ClaimNestedDocumentDTO | null;
  }
