// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/recalls/recallsApi.ts
import { api } from '@/lib/api/client';
import type { ListPropertyRecallsResponse, RecallResolutionType, RecallMatchDTO } from '@/types/recalls.types';

export async function listPropertyRecalls(propertyId: string): Promise<ListPropertyRecallsResponse> {
  const res = await api.get<ListPropertyRecallsResponse>(`/api/properties/${propertyId}/recalls`);
  return res.data;
}

export async function confirmRecallMatch(matchId: string): Promise<RecallMatchDTO> {
  const res = await api.post<RecallMatchDTO>(`/api/recalls/matches/${matchId}/confirm`, {});
  return res.data;
}

export async function dismissRecallMatch(matchId: string): Promise<RecallMatchDTO> {
  const res = await api.post<RecallMatchDTO>(`/api/recalls/matches/${matchId}/dismiss`, {});
  return res.data;
}

export async function resolveRecallMatch(params: {
  matchId: string;
  resolutionType: RecallResolutionType;
  resolutionNotes?: string;
}): Promise<RecallMatchDTO> {
  const res = await api.post<RecallMatchDTO>(`/api/recalls/matches/${params.matchId}/resolve`, {
    resolutionType: params.resolutionType,
    resolutionNotes: params.resolutionNotes,
  });
  return res.data;
}

export async function listInventoryItemRecalls(
  propertyId: string,
  inventoryItemId: string
): Promise<{ recallMatches: RecallMatchDTO[] }> {
  const res = await api.get<{ recallMatches: RecallMatchDTO[] }>(
    `/api/properties/${propertyId}/inventory/${inventoryItemId}/recalls`
  );
  return res.data;
}