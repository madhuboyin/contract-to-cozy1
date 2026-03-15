import { api } from '@/lib/api/client';
import type {
  HiddenAssetMatchDTO,
  HiddenAssetMatchListDTO,
  HiddenAssetRefreshResultDTO,
} from '@/types';

export async function getHiddenAssetMatches(
  propertyId: string,
  params?: { category?: string; confidenceLevel?: string; includeDismissed?: boolean },
): Promise<HiddenAssetMatchListDTO | null> {
  return api.getHiddenAssetMatches(propertyId, params);
}

export async function refreshHiddenAssetMatches(
  propertyId: string,
): Promise<HiddenAssetRefreshResultDTO> {
  const result = await api.refreshHiddenAssetMatches(propertyId);
  if (!result) throw new Error('Refresh scan failed');
  return result;
}

export async function updateHiddenAssetMatchStatus(
  matchId: string,
  status: 'VIEWED' | 'DISMISSED' | 'CLAIMED',
): Promise<HiddenAssetMatchDTO> {
  const result = await api.updateHiddenAssetMatchStatus(matchId, status);
  if (!result) throw new Error('Status update failed');
  return result;
}
