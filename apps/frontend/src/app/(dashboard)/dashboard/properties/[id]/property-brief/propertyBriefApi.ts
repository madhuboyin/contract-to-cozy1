import { api } from '@/lib/api/client';

export type PropertyBriefPurpose =
  | 'HOMEOWNER_REFERENCE'
  | 'CONTRACTOR_SERVICE_PROFESSIONAL'
  | 'HOUSEHOLD_TRUSTED_CONTACT'
  | 'INSURER_CLAIM_SUPPORT'
  | 'PROSPECTIVE_BUYER';

export type PropertyBriefSectionType =
  | 'PROPERTY_FACTS'
  | 'VERIFIED_HISTORY'
  | 'DOCUMENTS'
  | 'OPEN_UNKNOWNS'
  | 'CLAIMS'
  | 'INSURANCE';

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

export async function createPropertyBriefShare(
  propertyId: string,
  briefId: string,
  input: {
    expiresInDays: number;
    downloadPolicy: 'VIEW_ONLY' | 'ALLOW_DOWNLOAD';
    previewAcknowledged: true;
    limitationAcknowledged: true;
    sensitiveDataAcknowledged: true;
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
