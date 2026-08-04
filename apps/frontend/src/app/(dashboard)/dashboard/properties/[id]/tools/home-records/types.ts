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
  createdAt: string;
  updatedAt: string;
  currentVersion: RecordVersionSummary | null;
  _count: { versions: number; links: number };
  allowedActions: RecordAllowedActions;
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
}

export interface CreateRecordResult {
  record: PropertyRecordSummary;
  possibleVersionOf: { id: string; title: string; currentVersionId: string | null } | null;
}
