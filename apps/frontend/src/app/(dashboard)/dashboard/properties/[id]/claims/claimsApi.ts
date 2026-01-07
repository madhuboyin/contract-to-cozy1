// apps/frontend/src/app/(dashboard)/properties/[id]/claims/claimsApi.ts
import { api } from '@/lib/api/client';
import type {
  ClaimDTO,
  CreateClaimInput,
  UpdateClaimInput,
  AddClaimDocumentInput,
  AddTimelineEventInput,
  UpdateClaimChecklistItemInput,
  RegenerateChecklistInput,
  ClaimDocumentDTO,
  ClaimTimelineEventDTO,
  ClaimChecklistItemDTO,
} from '@/types/claims.types';

export type * from '@/types/claims.types';

export type ClaimInsightsDTO = {
  claimId: string;
  propertyId: string;
  status: string;
  type: string;
  sourceType: string;
  agingDays: number;
  daysSinceLastActivity: number;
  daysSinceSubmitted: number | null;
  financial: {
    deductibleAmount: number | null;
    estimatedLossAmount: number | null;
    settlementAmount: number | null;
    settlementVsEstimate: number | null;
    settlementRatio: number | null;
  };
  coverage: {
    insurancePolicyAttached: boolean;
    warrantyAttached: boolean;
    coverageGap: boolean;
  };
  recommendation: {
    decision: 'FILE_CLAIM' | 'CONSIDER_REPAIR' | 'NEEDS_INFO';
    confidence: number;
    reasons: string[];
  };
};

export type ClaimsSummaryDTO = {
  propertyId: string;
  counts: { total: number; open: number; overdueFollowUps: number };
  money: { totalEstimatedLossOpen: number };
  aging: { avgAgingDaysOpen: number };
};

const base = (propertyId: string) => `/api/properties/${propertyId}/claims`;
const claim = (propertyId: string, claimId: string) => `${base(propertyId)}/${claimId}`;

// Claims
export async function listClaims(propertyId: string): Promise<ClaimDTO[]> {
  const res = await api.get<ClaimDTO[]>(base(propertyId));
  return res.data;
}

export async function getClaim(propertyId: string, claimId: string): Promise<ClaimDTO> {
  const res = await api.get<ClaimDTO>(claim(propertyId, claimId));
  return res.data;
}

export async function createClaim(propertyId: string, input: CreateClaimInput): Promise<ClaimDTO> {
  const res = await api.post<ClaimDTO>(base(propertyId), input);
  return res.data;
}

// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/claims/claimsApi.ts

export async function updateClaim(propertyId: string, claimId: string, patch: any) {
  const res = await fetch(`/api/properties/${propertyId}/claims/${claimId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const err: any = new Error(payload?.message || `Failed to update claim (${res.status})`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  return payload?.data ?? payload; // keep consistent with your API response shape
}


// Documents
export async function addClaimDocument(
  propertyId: string,
  claimId: string,
  input: AddClaimDocumentInput
): Promise<ClaimDocumentDTO> {
  const res = await api.post<ClaimDocumentDTO>(`${claim(propertyId, claimId)}/documents`, input);
  return res.data;
}

// Timeline
export async function addClaimTimelineEvent(
  propertyId: string,
  claimId: string,
  input: AddTimelineEventInput
): Promise<ClaimTimelineEventDTO> {
  const res = await api.post<ClaimTimelineEventDTO>(`${claim(propertyId, claimId)}/timeline`, input);
  return res.data;
}

// Checklist
export async function updateClaimChecklistItem(
  propertyId: string,
  claimId: string,
  itemId: string,
  input: UpdateClaimChecklistItemInput
): Promise<ClaimChecklistItemDTO> {
  const res = await api.patch<ClaimChecklistItemDTO>(
    `${claim(propertyId, claimId)}/checklist/${itemId}`,
    input
  );
  return res.data;
}

export async function regenerateChecklist(
  propertyId: string,
  claimId: string,
  input: RegenerateChecklistInput
): Promise<ClaimDTO> {
  const res = await api.post<ClaimDTO>(`${claim(propertyId, claimId)}/regenerate-checklist`, input);
  return res.data;
}

export async function uploadChecklistItemDocument(
  propertyId: string,
  claimId: string,
  itemId: string,
  input: {
    file: File;
    claimDocumentType?: string; // ClaimDocumentType
    title?: string;
    notes?: string;
  }
) {
  const form = new FormData();
  form.append('file', input.file);
  if (input.claimDocumentType) form.append('claimDocumentType', input.claimDocumentType);
  if (input.title) form.append('title', input.title);
  if (input.notes) form.append('notes', input.notes);

  const res = await fetch(
    `/api/properties/${propertyId}/claims/${claimId}/checklist/${itemId}/documents`,
    {
      method: 'POST',
      body: form,
    }
  );

  if (!res.ok) {
    let payload: any = null;
    try { payload = await res.json(); } catch {}
    const msg = payload?.message || `Upload failed (${res.status})`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  return res.json();
}

export async function getClaimInsights(propertyId: string, claimId: string): Promise<ClaimInsightsDTO> {
  const res = await api.get<ClaimInsightsDTO>(`${claim(propertyId, claimId)}/insights`);
  return res.data;
}

export async function getClaimsSummary(propertyId: string): Promise<ClaimsSummaryDTO> {
  const res = await api.get<ClaimsSummaryDTO>(`${base(propertyId)}/summary`);
  return res.data;
}

export async function bulkUploadClaimDocuments(
  propertyId: string,
  claimId: string,
  input: { files: File[]; claimDocumentType?: string; title?: string; notes?: string }
) {
  const form = new FormData();
  input.files.forEach((f) => form.append('files', f));
  if (input.claimDocumentType) form.append('claimDocumentType', input.claimDocumentType);
  if (input.title) form.append('title', input.title);
  if (input.notes) form.append('notes', input.notes);

  const res = await fetch(`/api/properties/${propertyId}/claims/${claimId}/documents/bulk`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    let payload: any = null;
    try { payload = await res.json(); } catch {}
    const err: any = new Error(payload?.message || `Bulk upload failed (${res.status})`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return res.json();
}

export async function bulkUploadChecklistItemDocuments(
  propertyId: string,
  claimId: string,
  itemId: string,
  input: { files: File[]; claimDocumentType?: string; title?: string; notes?: string }
) {
  const form = new FormData();
  input.files.forEach((f) => form.append('files', f));
  if (input.claimDocumentType) form.append('claimDocumentType', input.claimDocumentType);
  if (input.title) form.append('title', input.title);
  if (input.notes) form.append('notes', input.notes);

  const res = await fetch(`/api/properties/${propertyId}/claims/${claimId}/checklist/${itemId}/documents/bulk`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    let payload: any = null;
    try { payload = await res.json(); } catch {}
    const err: any = new Error(payload?.message || `Bulk upload failed (${res.status})`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return res.json();
}

export async function exportClaimsCsv(propertyId: string): Promise<Blob> {
  const res = await fetch(`/api/properties/${propertyId}/claims/export.csv`, { method: 'GET' });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  return res.blob();
}
