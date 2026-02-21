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

export interface AssetVerificationNudgeDTO extends VerificationNudgeDTO {
  type: 'ASSET_VERIFICATION';
  source: 'INVENTORY';
}

export interface ResilienceCheckNudgeDTO {
  type: 'RESILIENCE_CHECK';
  source: 'PROPERTY';
  title: string;
  description: string;
  question: string;
  field: 'hasSumpPumpBackup';
  options: Array<{ label: string; value: boolean | null }>;
}

export interface UtilitySetupNudgeDTO {
  type: 'UTILITY_SETUP';
  source: 'PROPERTY';
  title: string;
  description: string;
  question: string;
  field: 'primaryHeatingFuel';
  options: Array<{ label: string; value: string }>;
}

export type HomeHealthNudgeDTO =
  | AssetVerificationNudgeDTO
  | ResilienceCheckNudgeDTO
  | UtilitySetupNudgeDTO;

export interface VerifyItemPayload {
  source: 'OCR_LABEL' | 'MANUAL' | 'AI_ORACLE';
  technicalSpecs?: Record<string, any>;
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
  propertyId: string
): Promise<HomeHealthNudgeDTO | null> {
  const res = await api.get<HomeHealthNudgeDTO | null>(
    `/api/properties/${propertyId}/nudges/next`
  );
  return res.data ?? null;
}

export async function verifyItem(
  propertyId: string,
  itemId: string,
  payload: VerifyItemPayload
) {
  return api.post(`/api/properties/${propertyId}/inventory/${itemId}/verify`, payload);
}

export async function getVerificationStats(
  propertyId: string
): Promise<VerificationStats> {
  const res = await api.get<VerificationStats>(
    `/api/properties/${propertyId}/inventory/verification/stats`
  );
  return res.data!;
}
