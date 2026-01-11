// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/recalls/recallsApi.ts
import { api } from '@/lib/api/client';
import type { ListPropertyRecallsResponse, RecallResolutionType, RecallMatchDTO } from '@/types/recalls.types';


export type ListInventoryItemRecallsResponse = {
  matches: RecallMatchDTO[];
};

export async function listPropertyRecalls(propertyId: string): Promise<ListPropertyRecallsResponse> {
  const res = await api.get<ListPropertyRecallsResponse>(`/api/properties/${propertyId}/recalls`);
  return res.data;
}

export async function confirmRecallMatch(propertyId: string, matchId: string): Promise<RecallMatchDTO> {
  const res = await api.post<RecallMatchDTO>(`/api/properties/${propertyId}/recalls/matches/${matchId}/confirm`, {});
  return res.data;
}

export async function dismissRecallMatch(propertyId: string, matchId: string): Promise<RecallMatchDTO> {
  const res = await api.post<RecallMatchDTO>(`/api/properties/${propertyId}/recalls/matches/${matchId}/dismiss`, {});
  return res.data;
}

export async function resolveRecallMatch(params: {
  propertyId: string;
  matchId: string;
  resolutionType: RecallResolutionType;
  resolutionNotes?: string;
}): Promise<RecallMatchDTO> {
  const res = await api.post<RecallMatchDTO>(
    `/api/properties/${params.propertyId}/recalls/matches/${params.matchId}/resolve`,
    {
      resolutionType: params.resolutionType,
      resolutionNotes: params.resolutionNotes,
    }
  );
  return res.data;
}
export async function listInventoryItemRecalls(
  propertyId: string,
  inventoryItemId: string
): Promise<ListInventoryItemRecallsResponse> {
  // IMPORTANT: backend returns { matches: [...] }
  const res = await api.get<ListInventoryItemRecallsResponse>(`/api/properties/${propertyId}/inventory/${inventoryItemId}/recalls`);
  return res.data;
}