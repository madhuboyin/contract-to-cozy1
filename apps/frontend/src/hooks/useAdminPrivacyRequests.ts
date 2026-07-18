// apps/frontend/src/hooks/useAdminPrivacyRequests.ts
//
// React Query hooks for the Admin Privacy Requests workspace.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  changeAdminPrivacyRequestStatus,
  createAdminPrivacyRequest,
  fetchAdminPrivacyRequestDetail,
  fetchAdminPrivacyRequests,
  PrivacyRequestStatus,
  PrivacyRequestType,
  setAdminPrivacyLegalHold,
} from '@/lib/api/adminPrivacyRequests';

export function useAdminPrivacyRequestList(status?: PrivacyRequestStatus, type?: PrivacyRequestType) {
  return useQuery({
    queryKey: ['admin-privacy-list', status ?? 'WORKING', type ?? 'ALL'],
    queryFn: () => fetchAdminPrivacyRequests(status, type),
    staleTime: 15_000,
  });
}

export function useAdminPrivacyRequestDetail(requestId: string | null) {
  return useQuery({
    queryKey: ['admin-privacy-detail', requestId],
    queryFn: () => fetchAdminPrivacyRequestDetail(requestId as string),
    enabled: !!requestId,
    staleTime: 5_000,
  });
}

export function useCreateAdminPrivacyRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { userEmail: string; type: PrivacyRequestType; jurisdiction?: string }) =>
      createAdminPrivacyRequest(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-privacy-list'] });
    },
  });
}

export function useChangeAdminPrivacyRequestStatus(requestId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      status,
      reason,
      resolutionSummary,
    }: {
      status: PrivacyRequestStatus;
      reason: string;
      resolutionSummary?: string;
    }) => changeAdminPrivacyRequestStatus(requestId as string, status, reason, resolutionSummary),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-privacy-detail', requestId] });
      qc.invalidateQueries({ queryKey: ['admin-privacy-list'] });
    },
  });
}

export function useSetAdminPrivacyLegalHold(requestId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ legalHold, reason }: { legalHold: boolean; reason: string }) =>
      setAdminPrivacyLegalHold(requestId as string, legalHold, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-privacy-detail', requestId] });
      qc.invalidateQueries({ queryKey: ['admin-privacy-list'] });
    },
  });
}
