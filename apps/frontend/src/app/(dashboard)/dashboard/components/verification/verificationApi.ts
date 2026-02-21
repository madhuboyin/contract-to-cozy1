// apps/frontend/src/app/(dashboard)/dashboard/components/verification/verificationApi.ts

import { api } from '@/lib/api/client';

export interface VerificationNudgeItem {
  id: string;
  name: string;
  category: string;
  condition: string;
  manufacturer?: string | null;
  modelNumber?: string | null;
  serialNumber?: string | null;
  purchasedOn?: string | null;
  installedOn?: string | null;
  isVerified: boolean;
  room?: { id: string; name: string } | null;
  homeAsset?: { id: string } | null;
}

export interface VerificationNudgeDTO {
  item: VerificationNudgeItem;
  totalUnverified: number;
  totalItems: number;
}

export interface DiscoveryNudgeBaseDTO {
  id: string;
  title: string;
  description: string;
  actionType: 'PHOTO' | 'TOGGLE' | 'INPUT';
  currentStreak: number;
  longestStreak: number;
  bonusMultiplier: number;
}

export interface AssetNudgeDTO extends DiscoveryNudgeBaseDTO, VerificationNudgeDTO {
  type: 'ASSET';
}

export interface ResilienceNudgeDTO extends DiscoveryNudgeBaseDTO {
  type: 'RESILIENCE';
  field: 'hasSumpPumpBackup';
  options: Array<{ label: string; value: boolean | null }>;
}

export interface UtilityNudgeDTO extends DiscoveryNudgeBaseDTO {
  type: 'UTILITY';
  field: 'primaryHeatingFuel';
  options: Array<{ label: string; value: string }>;
}

export interface InsuranceNudgeDTO extends DiscoveryNudgeBaseDTO {
  type: 'INSURANCE';
  policyId: string;
  totalInventoryValueCents: number;
  personalPropertyLimitCents: number;
  underInsuredCents: number;
}

export interface EquityNudgeDTO extends DiscoveryNudgeBaseDTO {
  type: 'EQUITY';
  purchasePriceCents: number | null;
  purchaseDate: string | null;
  lastAppraisedValueCents: number;
}

export type HomeHealthNudgeDTO =
  | AssetNudgeDTO
  | ResilienceNudgeDTO
  | UtilityNudgeDTO
  | InsuranceNudgeDTO
  | EquityNudgeDTO;

export interface VerifyItemPayload {
  source: 'OCR_LABEL' | 'MANUAL' | 'AI_ORACLE';
  technicalSpecs?: Record<string, any>;
}

export interface StreakUpdateDTO {
  currentStreak: number;
  longestStreak: number;
  bonusMultiplier: number;
  lastActivityDate: string | null;
  milestoneReached: boolean;
}

export interface VerificationStats {
  total: number;
  verified: number;
  unverified: number;
  percentVerified: number;
}

/** Returns list of human-readable missing field names for the item */
export function getMissingFields(item: VerificationNudgeItem): string[] {
  const missing: string[] = [];
  if (!item.manufacturer) missing.push('Manufacturer');
  if (!item.modelNumber) missing.push('Model number');
  if (!item.serialNumber) missing.push('Serial number');
  if (!item.purchasedOn && !item.installedOn) missing.push('Purchase / install date');
  return missing;
}

export async function getHomeHealthNudge(
  propertyId: string,
  excludedIds: string[] = []
): Promise<HomeHealthNudgeDTO | null> {
  const res = await api.get<HomeHealthNudgeDTO | null>(
    `/api/properties/${propertyId}/nudges/next`,
    {
      params: {
        excludedIds: excludedIds.join(','),
      },
    }
  );
  return res.data ?? null;
}

export async function verifyItem(
  propertyId: string,
  itemId: string,
  payload: VerifyItemPayload
) {
  return api.post<{ item: VerificationNudgeItem; streak: StreakUpdateDTO }>(
    `/api/properties/${propertyId}/inventory/${itemId}/verify`,
    payload
  );
}

export async function getVerificationStats(
  propertyId: string
): Promise<VerificationStats> {
  const res = await api.get<VerificationStats>(
    `/api/properties/${propertyId}/inventory/verification/stats`
  );
  return res.data!;
}
