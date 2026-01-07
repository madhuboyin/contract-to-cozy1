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

// -----------------------
// Claims
// -----------------------

export async function listClaims(propertyId: string): Promise<ClaimDTO[]> {
  const res = await api.get<ClaimDTO[]>(
    `/api/properties/${propertyId}/claims`
  );
  return res.data;
}

export async function getClaim(
  propertyId: string,
  claimId: string
): Promise<ClaimDTO> {
  const res = await api.get<ClaimDTO>(
    `/api/properties/${propertyId}/claims/${claimId}`
  );
  return res.data;
}

export async function createClaim(
  propertyId: string,
  input: CreateClaimInput
): Promise<ClaimDTO> {
  const res = await api.post<ClaimDTO>(
    `/api/properties/${propertyId}/claims`,
    input
  );
  return res.data;
}

export async function updateClaim(
  propertyId: string,
  claimId: string,
  input: UpdateClaimInput
): Promise<ClaimDTO> {
  const res = await api.patch<ClaimDTO>(
    `/api/properties/${propertyId}/claims/${claimId}`,
    input
  );
  return res.data;
}

// -----------------------
// Documents
// -----------------------

export async function addClaimDocument(
  propertyId: string,
  claimId: string,
  input: AddClaimDocumentInput
): Promise<ClaimDocumentDTO> {
  const res = await api.post<ClaimDocumentDTO>(
    `/api/properties/${propertyId}/claims/${claimId}/documents`,
    input
  );
  return res.data;
}

// -----------------------
// Timeline
// -----------------------

export async function addClaimTimelineEvent(
  propertyId: string,
  claimId: string,
  input: AddTimelineEventInput
): Promise<ClaimTimelineEventDTO> {
  const res = await api.post<ClaimTimelineEventDTO>(
    `/api/properties/${propertyId}/claims/${claimId}/timeline`,
    input
  );
  return res.data;
}

// -----------------------
// Checklist
// -----------------------

export async function updateClaimChecklistItem(
  propertyId: string,
  claimId: string,
  itemId: string,
  input: UpdateClaimChecklistItemInput
): Promise<ClaimChecklistItemDTO> {
  const res = await api.patch<ClaimChecklistItemDTO>(
    `/api/properties/${propertyId}/claims/${claimId}/checklist/${itemId}`,
    input
  );
  return res.data;
}

export async function regenerateChecklist(
  propertyId: string,
  claimId: string,
  input: RegenerateChecklistInput
): Promise<ClaimDTO> {
  const res = await api.post<ClaimDTO>(
    `/api/properties/${propertyId}/claims/${claimId}/regenerate-checklist`,
    input
  );
  return res.data;
}
