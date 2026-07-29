// apps/frontend/src/hooks/useSavingsBenefitsAdmin.ts
//
// React Query hooks for the Admin Savings and Benefits reviewed-source
// registry workspace, mirroring hooks/useAdminContentGovernance.ts.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdminProgramInput,
  AdminSourceInput,
  createProgram,
  createSource,
  fetchEditorialQueues,
  fetchOutcomeVerificationQueue,
  fetchSavingsBenefitPartnerComplaints,
  fetchSavingsBenefitPartnerHandoffs,
  fetchSavingsBenefitPartners,
  fetchPrograms,
  fetchSources,
  LifecycleAction,
  reviewSource,
  resolveSavingsBenefitPartnerComplaint,
  SavingsBenefitPartnerInput,
  transitionProgram,
  transitionSavingsBenefitPartnerHandoff,
  updateProgram,
  updateSource,
  upsertSavingsBenefitPartner,
  verifyOutcome,
} from '@/lib/api/savingsBenefitsAdmin';

const SOURCES_KEY = ['admin-savings-benefits-sources'];
const PROGRAMS_KEY = ['admin-savings-benefits-programs'];
const QUEUES_KEY = ['admin-savings-benefits-queues'];
const OUTCOME_VERIFICATION_KEY = ['admin-savings-benefits-outcome-verification'];
const PARTNERS_KEY = ['admin-savings-benefits-partners'];
const PARTNER_COMPLAINTS_KEY = ['admin-savings-benefits-partner-complaints'];
const PARTNER_HANDOFFS_KEY = ['admin-savings-benefits-partner-handoffs'];

export function useSavingsBenefitsSources() {
  return useQuery({ queryKey: SOURCES_KEY, queryFn: fetchSources, staleTime: 15_000 });
}

export function useSavingsBenefitsPrograms() {
  return useQuery({ queryKey: PROGRAMS_KEY, queryFn: fetchPrograms, staleTime: 15_000 });
}

export function useSavingsBenefitsQueues() {
  return useQuery({ queryKey: QUEUES_KEY, queryFn: fetchEditorialQueues, staleTime: 15_000 });
}

export function useSavingsBenefitsOutcomeVerificationQueue(offset = 0, limit = 50) {
  return useQuery({
    queryKey: [...OUTCOME_VERIFICATION_KEY, offset, limit],
    queryFn: () => fetchOutcomeVerificationQueue(offset, limit),
    staleTime: 15_000,
  });
}

export function useVerifySavingsBenefitsOutcome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      outcomeId,
      family,
      reason,
    }: {
      outcomeId: string;
      family: 'BENEFIT' | 'RECURRING_COST';
      reason: string;
    }) => verifyOutcome(outcomeId, family, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: OUTCOME_VERIFICATION_KEY }),
  });
}

export function useSavingsBenefitPartners() {
  return useQuery({ queryKey: PARTNERS_KEY, queryFn: fetchSavingsBenefitPartners, staleTime: 15_000 });
}

export function useUpsertSavingsBenefitPartner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ partnerId, input }: { partnerId: string; input: SavingsBenefitPartnerInput }) =>
      upsertSavingsBenefitPartner(partnerId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PARTNERS_KEY }),
  });
}

export function useSavingsBenefitPartnerComplaints(offset = 0, limit = 50) {
  return useQuery({
    queryKey: [...PARTNER_COMPLAINTS_KEY, offset, limit],
    queryFn: () => fetchSavingsBenefitPartnerComplaints(offset, limit),
    staleTime: 15_000,
  });
}

export function useSavingsBenefitPartnerHandoffs(offset = 0, limit = 50) {
  return useQuery({
    queryKey: [...PARTNER_HANDOFFS_KEY, offset, limit],
    queryFn: () => fetchSavingsBenefitPartnerHandoffs(offset, limit),
    staleTime: 15_000,
  });
}

export function useTransitionSavingsBenefitPartnerHandoff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      actionId,
      status,
      reason,
      deliveryReference,
    }: {
      actionId: string;
      status: 'SUBMITTED' | 'ACKNOWLEDGED' | 'FULFILLED' | 'FAILED' | 'REVOKED';
      reason: string;
      deliveryReference?: string;
    }) => transitionSavingsBenefitPartnerHandoff(actionId, status, reason, deliveryReference),
    onSuccess: () => qc.invalidateQueries({ queryKey: PARTNER_HANDOFFS_KEY }),
  });
}

export function useResolveSavingsBenefitPartnerComplaint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      complaintId,
      status,
      resolution,
    }: {
      complaintId: string;
      status: 'RESOLVED' | 'DISMISSED';
      resolution: string;
    }) => resolveSavingsBenefitPartnerComplaint(complaintId, status, resolution),
    onSuccess: () => qc.invalidateQueries({ queryKey: PARTNER_COMPLAINTS_KEY }),
  });
}

export function useCreateSavingsBenefitsSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminSourceInput) => createSource(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: SOURCES_KEY }),
  });
}

export function useUpdateSavingsBenefitsSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceId, input }: { sourceId: string; input: AdminSourceInput }) =>
      updateSource(sourceId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: SOURCES_KEY }),
  });
}

export function useReviewSavingsBenefitsSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceId, reason }: { sourceId: string; reason: string }) =>
      reviewSource(sourceId, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: SOURCES_KEY }),
  });
}

export function useCreateSavingsBenefitsProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminProgramInput) => createProgram(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROGRAMS_KEY }),
  });
}

export function useUpdateSavingsBenefitsProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, input }: { programId: string; input: AdminProgramInput }) =>
      updateProgram(programId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROGRAMS_KEY }),
  });
}

export function useTransitionSavingsBenefitsProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, action, reason }: { programId: string; action: LifecycleAction; reason: string }) =>
      transitionProgram(programId, action, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROGRAMS_KEY });
      qc.invalidateQueries({ queryKey: QUEUES_KEY });
    },
  });
}
