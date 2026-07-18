// apps/frontend/src/hooks/useAdminPaymentOps.ts
//
// React Query hooks for the Admin Payment Operations workspace.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAdminRefundRequest,
  decideAdminRefundRequest,
  fetchAdminPaymentDetail,
  fetchAdminPayments,
  fetchAdminRefundRequests,
  PaymentStatus,
  RefundRequestStatus,
  withdrawAdminRefundRequest,
} from '@/lib/api/adminPaymentOps';

export function useAdminPaymentSearch(q: string, status: PaymentStatus | undefined, page = 1) {
  return useQuery({
    queryKey: ['admin-payment-search', q, status ?? 'ALL', page],
    queryFn: () => fetchAdminPayments(q, status, page),
    staleTime: 15_000,
  });
}

export function useAdminPaymentDetail(paymentId: string | null) {
  return useQuery({
    queryKey: ['admin-payment-detail', paymentId],
    queryFn: () => fetchAdminPaymentDetail(paymentId as string),
    enabled: !!paymentId,
    staleTime: 5_000,
  });
}

export function useAdminRefundQueue(status?: RefundRequestStatus) {
  return useQuery({
    queryKey: ['admin-refund-queue', status ?? 'PENDING_APPROVAL'],
    queryFn: () => fetchAdminRefundRequests(status),
    staleTime: 15_000,
  });
}

export function useCreateAdminRefundRequest(paymentId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ amount, reason, policyBasis }: { amount: number; reason: string; policyBasis?: string }) =>
      createAdminRefundRequest(paymentId as string, amount, reason, policyBasis),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-payment-detail', paymentId] });
      qc.invalidateQueries({ queryKey: ['admin-refund-queue'] });
    },
  });
}

export function useWithdrawAdminRefundRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason: string }) =>
      withdrawAdminRefundRequest(requestId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-refund-queue'] });
      qc.invalidateQueries({ queryKey: ['admin-payment-detail'] });
    },
  });
}

export function useDecideAdminRefundRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, decision, reason }: { requestId: string; decision: 'APPROVE' | 'REJECT'; reason: string }) =>
      decideAdminRefundRequest(requestId, decision, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-refund-queue'] });
      qc.invalidateQueries({ queryKey: ['admin-payment-detail'] });
    },
  });
}
