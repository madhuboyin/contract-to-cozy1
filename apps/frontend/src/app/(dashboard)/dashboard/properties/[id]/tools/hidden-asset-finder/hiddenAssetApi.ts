import { api } from '@/lib/api/client';
import type {
  HiddenAssetCoverageDTO,
  HiddenAssetMatchDTO,
  HiddenAssetMatchListDTO,
  HiddenAssetRefreshResultDTO,
  HiddenAssetSensitiveFactKey,
  SensitiveFactStatusDTO,
} from '@/types';

export async function getHiddenAssetMatches(
  propertyId: string,
  params?: { category?: string; confidenceLevel?: string; includeDismissed?: boolean },
): Promise<HiddenAssetMatchListDTO | null> {
  return api.getHiddenAssetMatches(propertyId, params);
}

export async function getHiddenAssetCoverage(
  propertyId: string,
): Promise<HiddenAssetCoverageDTO | null> {
  return api.getHiddenAssetCoverage(propertyId);
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
  status: 'VIEWED' | 'DISMISSED' | 'PURSUING',
): Promise<HiddenAssetMatchDTO> {
  const result = await api.updateHiddenAssetMatchStatus(matchId, status);
  if (!result) throw new Error('Status update failed');
  return result;
}

export async function getHiddenAssetSensitiveFacts(matchId: string): Promise<SensitiveFactStatusDTO[]> {
  return api.getHiddenAssetSensitiveFacts(matchId);
}

export async function submitHiddenAssetSensitiveFact(
  matchId: string,
  factKey: HiddenAssetSensitiveFactKey,
  value: string | number | boolean,
): Promise<SensitiveFactStatusDTO> {
  const result = await api.submitHiddenAssetSensitiveFact(matchId, { factKey, value, consented: true });
  if (!result) throw new Error('Failed to record sensitive fact');
  return result;
}

export async function declineHiddenAssetSensitiveFact(
  matchId: string,
  factKey: HiddenAssetSensitiveFactKey,
): Promise<SensitiveFactStatusDTO> {
  const result = await api.declineHiddenAssetSensitiveFact(matchId, factKey);
  if (!result) throw new Error('Failed to decline sensitive fact');
  return result;
}

export async function deleteHiddenAssetSensitiveFact(
  matchId: string,
  factKey: HiddenAssetSensitiveFactKey,
): Promise<void> {
  await api.deleteHiddenAssetSensitiveFact(matchId, factKey);
}
