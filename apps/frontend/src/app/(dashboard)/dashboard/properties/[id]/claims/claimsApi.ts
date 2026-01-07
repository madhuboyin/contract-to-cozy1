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

export async function updateClaim(propertyId: string, claimId: string, input: UpdateClaimInput): Promise<ClaimDTO> {
  const res = await api.patch<ClaimDTO>(claim(propertyId, claimId), input);
  return res.data;
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
