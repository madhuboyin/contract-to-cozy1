// apps/frontend/src/hooks/useAdminCases.ts
//
// React Query hooks for Admin case management.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addAdminCaseNote,
  AdminCaseSeverity,
  AdminCaseStatus,
  CaseListFilters,
  changeAdminCaseStatus,
  createAdminCase,
  CreateCaseInput,
  fetchAdminCaseDetail,
  fetchAdminCases,
  requestReviewInvestigation,
} from '@/lib/api/adminCases';

export function useAdminCaseList(filters: CaseListFilters) {
  return useQuery({
    queryKey: ['admin-case-list', filters],
    queryFn: () => fetchAdminCases(filters),
    staleTime: 15_000,
  });
}

export function useAdminCaseDetail(caseId: string | null) {
  return useQuery({
    queryKey: ['admin-case-detail', caseId],
    queryFn: () => fetchAdminCaseDetail(caseId as string),
    enabled: !!caseId,
    staleTime: 5_000,
  });
}

export function useCreateAdminCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCaseInput) => createAdminCase(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-case-list'] });
    },
  });
}

export function useChangeAdminCaseStatus(caseId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ status, reason, resolution }: { status: AdminCaseStatus; reason: string; resolution?: string }) =>
      changeAdminCaseStatus(caseId as string, status, reason, resolution),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-case-detail', caseId] });
      qc.invalidateQueries({ queryKey: ['admin-case-list'] });
    },
  });
}

export function useAddAdminCaseNote(caseId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => addAdminCaseNote(caseId as string, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-case-detail', caseId] });
    },
  });
}

export function useRequestReviewInvestigation(reviewId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reason, severity }: { reason: string; severity?: AdminCaseSeverity }) =>
      requestReviewInvestigation(reviewId as string, reason, severity),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-case-list'] });
    },
  });
}
