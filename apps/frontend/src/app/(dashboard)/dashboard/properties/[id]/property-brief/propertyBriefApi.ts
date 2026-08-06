import { api } from '@/lib/api/client';

export type PropertyBriefPurpose =
  | 'HOMEOWNER_REFERENCE'
  | 'CONTRACTOR_SERVICE_PROFESSIONAL'
  | 'HOUSEHOLD_TRUSTED_CONTACT'
  | 'INSURER_CLAIM_SUPPORT'
  | 'PROSPECTIVE_BUYER'
  | 'LISTING_AGENT';

export type PropertyBriefSectionType =
  | 'PROPERTY_FACTS'
  | 'VERIFIED_HISTORY'
  | 'DOCUMENTS'
  | 'OPEN_UNKNOWNS'
  | 'CLAIMS'
  | 'INSURANCE'
  | 'WARRANTIES'
  | 'MATERIAL_SPECS'
  | 'PERMITS'
  | 'EMERGENCY_INFO';

export type PropertyBriefTemplate = {
  purpose: PropertyBriefPurpose;
  label: string;
  defaultSections: PropertyBriefSectionType[];
  allowedSections: PropertyBriefSectionType[];
  sensitiveSections: PropertyBriefSectionType[];
};

export type PropertyBriefEvidence = {
  id: string;
  itemKey: string;
  sourceEntityType: string;
  sourceEntityId: string;
  sourceLabel: string;
  sourceAsOf: string;
  verification: string;
};

export type PropertyBriefSection = {
  id: string;
  sectionType: PropertyBriefSectionType;
  title: string;
  payload: {
    items?: Array<Record<string, unknown> & { key: string }>;
    excludedFields?: string[];
    limitation?: string | null;
    completenessBoundary?: string;
  };
  sensitive: boolean;
  asOf: string;
  evidenceLinks: PropertyBriefEvidence[];
};

export type PropertyBriefShare = {
  id: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  downloadPolicy: 'VIEW_ONLY' | 'ALLOW_DOWNLOAD';
  expiresAt: string;
  revokedAt: string | null;
  accessCount: number;
  lastAccessedAt: string | null;
  createdAt: string;
  recipientName: string | null;
  recipientEmail: string | null;
  invitationStatus: 'NOT_SET' | 'PENDING' | 'ACCEPTED';
  acceptedAt: string | null;
  lastTestedAt: string | null;
};

export type PropertyBrief = {
  id: string;
  title: string;
  purpose: PropertyBriefPurpose;
  status: 'DRAFT' | 'READY' | 'SHARED' | 'REVOKED' | 'ARCHIVED';
  selectedSections: PropertyBriefSectionType[];
  excludedSections: PropertyBriefSectionType[];
  limitationStatement: string;
  templateVersion: string;
  asOf: string;
  createdAt: string;
  sections?: PropertyBriefSection[];
  shares: PropertyBriefShare[];
  property?: { name: string | null; address: string; city: string; state: string; zipCode: string };
  safetyTier?: 'LOW_CONSEQUENCE' | 'MATERIAL_FINANCIAL' | 'SAFETY_EMERGENCY';
  // Slice 7's stale-item review/reminders — a brief is a frozen snapshot
  // (no republish mechanism yet), so an old ACTIVE share may show a
  // recipient facts that have since changed. Only true when a live share
  // actually exists AND the snapshot is 90+ days old (see
  // propertyBrief.service.ts's listPropertyBriefs).
  ageDays?: number;
  isStale?: boolean;
};

export type EligiblePropertyBriefDocument = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  verifiedAt: string | null;
  updatedAt: string;
};

export async function getPropertyBriefTemplates() {
  const response = await api.get('/api/property-briefs/templates');
  return response.data as PropertyBriefTemplate[];
}

export async function listPropertyBriefs(propertyId: string) {
  const response = await api.get(`/api/properties/${propertyId}/property-briefs`);
  return response.data as PropertyBrief[];
}

export async function listEligiblePropertyBriefDocuments(propertyId: string) {
  const response = await api.get(`/api/properties/${propertyId}/property-briefs/eligible-documents`);
  return response.data as EligiblePropertyBriefDocument[];
}

export async function createPropertyBrief(
  propertyId: string,
  input: {
    purpose: PropertyBriefPurpose;
    selectedSections: PropertyBriefSectionType[];
    acknowledgeSensitiveSections: boolean;
    documentIds: string[];
  },
) {
  const response = await api.post(`/api/properties/${propertyId}/property-briefs`, input);
  return response.data as PropertyBrief;
}

export async function getPropertyBriefPreview(propertyId: string, briefId: string) {
  const response = await api.get(
    `/api/properties/${propertyId}/property-briefs/${briefId}/preview`,
  );
  return response.data as PropertyBrief;
}

// Slice 7's republish notifications: re-assembles the brief against live
// data and, only if something actually changed, notifies each ACTIVE
// share's recipient (no fresh link needed — the token doesn't rotate).
export async function republishPropertyBrief(propertyId: string, briefId: string) {
  const response = await api.post(
    `/api/properties/${propertyId}/property-briefs/${briefId}/republish`,
    {},
  );
  return response.data as { changed: boolean; changedSectionTypes: PropertyBriefSectionType[]; notifiedRecipientCount: number };
}

export async function createPropertyBriefShare(
  propertyId: string,
  briefId: string,
  input: {
    expiresInDays: number;
    downloadPolicy: 'VIEW_ONLY' | 'ALLOW_DOWNLOAD';
    previewAcknowledged: true;
    limitationAcknowledged: true;
    sensitiveDataAcknowledged: true;
    householdConsentAcknowledged?: boolean;
    recipientName?: string;
    recipientEmail?: string;
  },
) {
  const response = await api.post(
    `/api/properties/${propertyId}/property-briefs/${briefId}/share`,
    input,
  );
  return response.data as PropertyBriefShare & { shareUrl: string; token: string };
}

export async function revokePropertyBriefShare(
  propertyId: string,
  briefId: string,
  shareId: string,
) {
  return api.post(
    `/api/properties/${propertyId}/property-briefs/${briefId}/shares/${shareId}/revoke`,
    {},
  );
}

export async function testPropertyBriefShareAccess(
  propertyId: string,
  briefId: string,
  shareId: string,
) {
  const response = await api.post(
    `/api/properties/${propertyId}/property-briefs/${briefId}/shares/${shareId}/test`,
    {},
  );
  return response.data as { id: string; lastTestedAt: string; accessible: boolean; failureReason: string | null };
}
