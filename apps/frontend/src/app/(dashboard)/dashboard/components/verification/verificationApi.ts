// apps/frontend/src/app/(dashboard)/dashboard/components/verification/verificationApi.ts

import { api } from '@/lib/api/client';

export interface VerificationNudgeDTO {
  item: {
    id: string;
    name: string;
    category: string;
    condition: string;
    manufacturer?: string | null;
    modelNumber?: string | null;
    isVerified: boolean;
    room?: { id: string; name: string } | null;
    homeAsset?: { id: string } | null;
  };
  totalUnverified: number;
  totalItems: number;
}

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

export async function getVerificationNudge(
  propertyId: string
): Promise<VerificationNudgeDTO | null> {
  const res = await api.get<VerificationNudgeDTO | null>(
    `/api/properties/${propertyId}/inventory/verification/nudge`
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
