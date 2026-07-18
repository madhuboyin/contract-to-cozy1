// apps/frontend/src/hooks/useAdminAccessCertification.ts
//
// React Query hooks for the Admin access certification workspace.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  attestCertificationDecision,
  cancelCertificationCampaign,
  completeCertificationCampaign,
  fetchCertificationCampaignDetail,
  fetchCertificationCampaigns,
  openCertificationCampaign,
} from '@/lib/api/adminAccessCertification';

export function useCertificationCampaigns() {
  return useQuery({
    queryKey: ['admin-cert-campaigns'],
    queryFn: fetchCertificationCampaigns,
    staleTime: 15_000,
  });
}

export function useCertificationCampaignDetail(campaignId: string | null) {
  return useQuery({
    queryKey: ['admin-cert-campaign', campaignId],
    queryFn: () => fetchCertificationCampaignDetail(campaignId as string),
    enabled: !!campaignId,
    staleTime: 5_000,
  });
}

function useInvalidateCertification(campaignId?: string | null) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['admin-cert-campaigns'] });
    if (campaignId) qc.invalidateQueries({ queryKey: ['admin-cert-campaign', campaignId] });
    qc.invalidateQueries({ queryKey: ['admin-work-queues'] });
  };
}

export function useOpenCertificationCampaign() {
  const invalidate = useInvalidateCertification();
  return useMutation({
    mutationFn: (name: string) => openCertificationCampaign(name),
    onSuccess: invalidate,
  });
}

export function useAttestCertificationDecision(campaignId: string | null) {
  const invalidate = useInvalidateCertification(campaignId);
  return useMutation({
    mutationFn: ({ decisionId, decision, reason }: { decisionId: string; decision: 'KEEP' | 'REVOKE'; reason: string }) =>
      attestCertificationDecision(decisionId, decision, reason),
    onSuccess: invalidate,
  });
}

export function useCompleteCertificationCampaign(campaignId: string | null) {
  const invalidate = useInvalidateCertification(campaignId);
  return useMutation({
    mutationFn: (reason: string) => completeCertificationCampaign(campaignId as string, reason),
    onSuccess: invalidate,
  });
}

export function useCancelCertificationCampaign(campaignId: string | null) {
  const invalidate = useInvalidateCertification(campaignId);
  return useMutation({
    mutationFn: (reason: string) => cancelCertificationCampaign(campaignId as string, reason),
    onSuccess: invalidate,
  });
}
