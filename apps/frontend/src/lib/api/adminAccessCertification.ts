// apps/frontend/src/lib/api/adminAccessCertification.ts
//
// API client for the Admin access certification workspace
// (ADMIN_MODULE_FRD.md §17 Phase 6). ADMIN_ROLE_MANAGE only.

import { api } from '@/lib/api/client';

export type CampaignStatus = 'OPEN' | 'COMPLETED' | 'CANCELLED';
export type DecisionState = 'PENDING' | 'KEEP' | 'REVOKE';

export interface CampaignRow {
  id: string;
  name: string;
  status: CampaignStatus;
  openedById: string;
  dueAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  decisionCounts: { PENDING: number; KEEP: number; REVOKE: number };
}

export interface CertificationDecision {
  id: string;
  grantId: string;
  holderId: string;
  holderName: string | null;
  capability: string;
  bundleName: string | null;
  state: DecisionState;
  decidedById: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  reason: string | null;
}

export interface CampaignDetail extends Omit<CampaignRow, 'decisionCounts'> {
  openedByName: string | null;
  decisions: CertificationDecision[];
}

export async function fetchCertificationCampaigns(): Promise<CampaignRow[]> {
  const res = await api.get<CampaignRow[]>('/api/admin/access-certification/campaigns');
  return res.data;
}

export async function fetchCertificationCampaignDetail(campaignId: string): Promise<CampaignDetail> {
  const res = await api.get<CampaignDetail>(`/api/admin/access-certification/campaigns/${campaignId}`);
  return res.data;
}

export async function openCertificationCampaign(name: string): Promise<CampaignRow> {
  const res = await api.post<CampaignRow>('/api/admin/access-certification/campaigns', { name });
  return res.data;
}

export async function attestCertificationDecision(
  decisionId: string,
  decision: 'KEEP' | 'REVOKE',
  reason: string,
): Promise<CertificationDecision & { revokeExecuted: boolean }> {
  const res = await api.post<CertificationDecision & { revokeExecuted: boolean }>(
    `/api/admin/access-certification/decisions/${decisionId}/attest`,
    { decision, reason },
  );
  return res.data;
}

export async function completeCertificationCampaign(campaignId: string, reason: string): Promise<{ status: string }> {
  const res = await api.post<{ status: string }>(
    `/api/admin/access-certification/campaigns/${campaignId}/complete`,
    { reason },
  );
  return res.data;
}

export async function cancelCertificationCampaign(campaignId: string, reason: string): Promise<{ status: string }> {
  const res = await api.post<{ status: string }>(
    `/api/admin/access-certification/campaigns/${campaignId}/cancel`,
    { reason },
  );
  return res.data;
}
