export type PropertyRecordType =
  | 'WARRANTY'
  | 'RECEIPT'
  | 'MANUAL'
  | 'INSPECTION_REPORT'
  | 'INVOICE'
  | 'CONTRACT'
  | 'PERMIT'
  | 'INSURANCE_POLICY'
  | 'CLAIM'
  | 'PHOTO'
  | 'DEED'
  | 'TAX_DOCUMENT'
  | 'UTILITY'
  | 'DISCLOSURE'
  | 'SURVEY'
  | 'CLOSING_DOCUMENT'
  | 'OTHER';

export type PropertyRecordSensitivity =
  | 'STANDARD'
  | 'PERSONAL'
  | 'FINANCIAL'
  | 'INSURANCE'
  | 'CLAIM'
  | 'SECURITY'
  | 'LEGAL';

export type PropertyRecordVisibility = 'HOUSEHOLD' | 'OWNER_ONLY' | 'RECIPIENT_SELECTED';

export type PropertyRecordLifecycleStatus = 'ACTIVE' | 'ARCHIVED' | 'TRASHED';

// null: no effectiveTo set (most records — a paint color, a manual — have no
// natural expiry). Computed server-side against a 30-day "expiring soon"
// window; never stored.
export type ExpiryStatus = 'EXPIRED' | 'EXPIRING_SOON' | 'CURRENT' | null;

export type PropertyRecordScanStatus = 'PENDING' | 'CLEAN' | 'QUARANTINED' | 'FAILED';

export type PropertyRecordIntegrityStatus = 'PENDING' | 'VERIFIED' | 'MISMATCH';

export type PropertyRecordLinkEntityType =
  | 'HOME_EVENT'
  | 'INVENTORY_ITEM'
  | 'MATERIAL_SPEC'
  | 'PROJECT'
  | 'WARRANTY'
  | 'INSURANCE_POLICY'
  | 'CLAIM'
  | 'PERMIT'
  | 'PROPERTY_BRIEF'
  | 'EXPENSE'
  | 'OTHER';

export type PropertyRecordLinkPurpose =
  | 'EVIDENCE'
  | 'SOURCE'
  | 'ATTACHMENT'
  | 'APPROVAL'
  | 'RECEIPT'
  | 'WARRANTY'
  | 'MANUAL';

export interface RecordVersionSummary {
  id: string;
  recordId: string;
  versionNumber: number;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  sha256: string;
  scanStatus: PropertyRecordScanStatus;
  integrityStatus: PropertyRecordIntegrityStatus;
  uploadedByUserId: string;
  supersedesVersionId: string | null;
  createdAt: string;
  downloadUrl: string | null;
  availability: 'AVAILABLE' | PropertyRecordScanStatus;
}

export interface RecordAllowedActions {
  read: boolean;
  addVersion: boolean;
  link: boolean;
  archive: boolean;
  trash: boolean;
  restore: boolean;
  manageRetention: boolean;
  manageEffectivePeriod: boolean;
}

export interface PropertyRecordSummary {
  id: string;
  propertyId: string;
  title: string;
  description: string | null;
  recordType: PropertyRecordType;
  sensitivity: PropertyRecordSensitivity;
  visibility: PropertyRecordVisibility;
  lifecycleStatus: PropertyRecordLifecycleStatus;
  currentVersionId: string | null;
  archivedAt: string | null;
  trashedAt: string | null;
  retainUntil: string | null;
  legalHoldReason: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
  currentVersion: RecordVersionSummary | null;
  _count: { versions: number; links: number };
  allowedActions: RecordAllowedActions;
  // True when the current version has AI-extracted fields still PENDING
  // homeowner confirm/correct/reject — see homeRecordsExtraction.service.ts.
  needsReview: boolean;
  expiryStatus: ExpiryStatus;
}

export interface PropertyRecordLink {
  id: string;
  recordId: string;
  versionId: string | null;
  entityType: PropertyRecordLinkEntityType;
  entityId: string;
  purpose: PropertyRecordLinkPurpose;
  label: string | null;
  createdByUserId: string;
  createdAt: string;
  // null means health is undeterminable (OTHER has no canonical table to
  // check against); true/false means the target was confirmed to still
  // resolve as of this read.
  broken: boolean | null;
}

// WARRANTY and EXPENSE have a working promotion path today — see
// homeRecordsExtraction.service.ts. fieldKey '_documentType' is the AI's
// informational overall classification, not a reviewable field.
export type ExtractedFactTargetDomain = 'WARRANTY' | 'EXPENSE' | 'INSURANCE_POLICY' | 'OTHER';
export type ExtractedFactReviewStatus = 'PENDING' | 'CONFIRMED' | 'CORRECTED' | 'REJECTED';

export interface ExtractedFactCandidate {
  id: string;
  propertyRecordVersionId: string;
  targetDomain: ExtractedFactTargetDomain;
  fieldKey: string;
  proposedValue: string | null;
  sourceCitation: string | null;
  confidence: number;
  reviewStatus: ExtractedFactReviewStatus;
  reviewedValue: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  promotedEntityType: string | null;
  promotedEntityId: string | null;
  createdAt: string;
}

export interface PropertyRecordDetail extends PropertyRecordSummary {
  versions: (Omit<RecordVersionSummary, 'downloadUrl' | 'availability'> & {
    extractedFacts: ExtractedFactCandidate[];
  })[];
  links: PropertyRecordLink[];
  deletionImpact: {
    activeLinkCount: number;
    requiresImpactDecision: boolean;
    legalHold: boolean;
    retainUntil: string | null;
    brokenLinkCount: number;
  };
}

export interface CreateRecordInput {
  file: File;
  title: string;
  description?: string;
  recordType: PropertyRecordType;
  sensitivity: PropertyRecordSensitivity;
  visibility: PropertyRecordVisibility;
  effectiveTo?: string;
}

export interface CreateRecordResult {
  record: PropertyRecordSummary;
  possibleVersionOf: { id: string; title: string; currentVersionId: string | null } | null;
}

// Batch mobile scan: several photos captured in one phone-camera session,
// each becoming its own record sharing one title/recordType/sensitivity/
// visibility (per-item title gets a "(1 of 3)" suffix server-side). Not a
// multi-page-PDF assembly — see homeRecords.service.ts's createBatch().
export interface CreateBatchInput {
  files: File[];
  title: string;
  recordType: PropertyRecordType;
  sensitivity: PropertyRecordSensitivity;
  visibility: PropertyRecordVisibility;
}

export interface CreateBatchResult {
  created: {
    fileName: string;
    record: PropertyRecordSummary;
    possibleVersionOf: { id: string; title: string; currentVersionId: string | null } | null;
  }[];
  failed: { fileName: string; message: string; code?: string }[];
}

// Export/download audit trail: a presigned URL is issued straight to S3, so
// this records the click that requested one — an honest proxy signal (the
// same class of signal Property Brief's accessCount already uses), not
// literal proof the file was opened.
export interface PropertyRecordDownloadEvent {
  id: string;
  occurredAt: string;
  fileName: string | null;
  userName: string | null;
  userEmail: string | null;
}

// Storage/recovery SLOs: real, already-enforced numbers (the actual trash
// recovery window, current counts of scan/integrity/purge problems) — not a
// fabricated uptime/durability percentage this app has no telemetry to back.
export interface PropertyRecordStorageHealth {
  recoveryWindowDays: number;
  scanIssueCount: number;
  integrityMismatchCount: number;
  purgeFailureCount: number;
  stalePurgeCount: number;
  healthy: boolean;
}

export type PropertyRecordSavedSearchView = 'ALL' | 'NEEDS_REVIEW' | 'EXPIRING';

// A named bookmark of the list page's own filter bar (search text + type +
// view chip), re-run live against list() — not a stored result set.
export interface PropertyRecordSavedSearch {
  id: string;
  propertyId: string;
  createdByUserId: string;
  name: string;
  search: string | null;
  recordType: PropertyRecordType | null;
  view: PropertyRecordSavedSearchView;
  createdAt: string;
}
