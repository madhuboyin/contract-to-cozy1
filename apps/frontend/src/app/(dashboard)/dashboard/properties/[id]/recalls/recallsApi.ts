// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/recalls/recallsApi.ts
import { api } from '@/lib/api/client';
import type {
  ListPropertyRecallsResponse,
  RecallResolutionType,
  RecallMatchDTO,
} from '@/types/recalls.types';

export type ListInventoryItemRecallsResponse = {
  matches: RecallMatchDTO[];
};

export type RecallActionResult = RecallMatchDTO & {
  guidanceReport?: { supplied: boolean; reported: boolean | null; refusal: string | null };
};

export async function listPropertyRecalls(
  propertyId: string
): Promise<ListPropertyRecallsResponse> {
  // Use getRaw because the API returns the object directly, not wrapped in { data: ... }
  const res = await api.getRaw<ListPropertyRecallsResponse>(`/api/properties/${propertyId}/recalls`);
  return res.data;
}

export async function listInventoryItemRecalls(
  propertyId: string,
  inventoryItemId: string
): Promise<ListInventoryItemRecallsResponse> {
  // ✅ This endpoint returns direct DTO: { matches: [...] }
  const res = await api.getRaw<ListInventoryItemRecallsResponse>(
    `/api/properties/${propertyId}/inventory/${inventoryItemId}/recalls`
  );
  return res.data;
}

// `guidanceStepId` is the journey step the action is started from: the result is reported to that exact step only.
const stepQuery = (guidanceStepId?: string | null) => (guidanceStepId ? `?guidanceStepId=${encodeURIComponent(guidanceStepId)}` : '');

export async function confirmRecallMatch(
  propertyId: string,
  matchId: string,
  guidanceStepId?: string | null
): Promise<RecallActionResult> {
  const res = await api.post<RecallActionResult>(
    `/api/properties/${propertyId}/recalls/matches/${matchId}/confirm${stepQuery(guidanceStepId)}`,
    {}
  );
  return res.data;
}

export async function dismissRecallMatch(
  propertyId: string,
  matchId: string,
  guidanceStepId?: string | null
): Promise<RecallActionResult> {
  const res = await api.post<RecallActionResult>(
    `/api/properties/${propertyId}/recalls/matches/${matchId}/dismiss${stepQuery(guidanceStepId)}`,
    {}
  );
  return res.data;
}

export async function resolveRecallMatch(params: {
  propertyId: string;
  matchId: string;
  resolutionType: RecallResolutionType;
  resolutionNotes?: string;
  guidanceStepId?: string | null;
}): Promise<RecallActionResult> {
  const res = await api.post<RecallActionResult>(
    `/api/properties/${params.propertyId}/recalls/matches/${params.matchId}/resolve${stepQuery(params.guidanceStepId)}`,
    {
      resolutionType: params.resolutionType,
      resolutionNotes: params.resolutionNotes,
    }
  );
  return res.data;
}
