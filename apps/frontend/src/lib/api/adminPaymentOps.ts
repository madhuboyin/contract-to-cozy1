// apps/frontend/src/lib/api/adminPaymentOps.ts
//
// API client for the Admin Payment Operations workspace
// (ADMIN_MODULE_FRD.md §10.4, Phase 3 slice). Record-and-govern refunds —
// no money movement.

import { api } from '@/lib/api/client';

export type PaymentStatus = 'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'REFUNDED' | 'FAILED' | 'CANCELLED';
export type RefundRequestStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface PaymentRow {
  id: string;
  amount: string;
  currency: string;
  status: PaymentStatus;
  isDeposit: boolean;
  stripePaymentIntentId: string | null;
  description: string | null;
  failureReason: string | null;
  refundedAmount: string | null;
  refundedAt: string | null;
  createdAt: string;
  booking: {
    id: string;
    bookingNumber: string;
    status: string;
    homeowner: { id: string; firstName: string; lastName: string };
    providerProfile: { id: string; businessName: string };
  };
}

export interface LedgerSummaryRow {
  status: PaymentStatus;
  count: number;
  totalAmount: string | null;
}

export interface PaymentListResult {
  payments: PaymentRow[];
  total: number;
  page: number;
  limit: number;
  ledgerSummary: LedgerSummaryRow[];
}

export interface RefundRequestRow {
  id: string;
  amount: string;
  reason: string;
  policyBasis: string | null;
  status: RefundRequestStatus;
  requestedById: string;
  decidedById: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  createdAt: string;
}

export interface PaymentDetail extends PaymentRow {
  stripeChargeId: string | null;
  updatedAt: string;
  refundRequests: RefundRequestRow[];
}

export interface RefundQueueRow extends RefundRequestRow {
  payment: {
    id: string;
    amount: string;
    currency: string;
    status: PaymentStatus;
    booking: { id: string; bookingNumber: string };
  };
}

export async function fetchAdminPayments(
  q: string,
  status?: PaymentStatus,
  page = 1,
): Promise<PaymentListResult> {
  const params = new URLSearchParams({ page: String(page) });
  if (q.trim()) params.set('q', q.trim());
  if (status) params.set('status', status);
  const res = await api.get<PaymentListResult>(`/api/admin/payments?${params.toString()}`);
  return res.data;
}

export async function fetchAdminPaymentDetail(paymentId: string): Promise<PaymentDetail> {
  const res = await api.get<PaymentDetail>(`/api/admin/payments/${paymentId}`);
  return res.data;
}

export async function createAdminRefundRequest(
  paymentId: string,
  amount: number,
  reason: string,
  policyBasis?: string,
): Promise<RefundRequestRow> {
  const res = await api.post<RefundRequestRow>(`/api/admin/payments/${paymentId}/refund-requests`, {
    amount,
    reason,
    policyBasis,
  });
  return res.data;
}

export async function fetchAdminRefundRequests(
  status?: RefundRequestStatus,
  page = 1,
): Promise<{ requests: RefundQueueRow[]; total: number; page: number; limit: number }> {
  const params = new URLSearchParams({ page: String(page) });
  if (status) params.set('status', status);
  const res = await api.get<{ requests: RefundQueueRow[]; total: number; page: number; limit: number }>(
    `/api/admin/refund-requests?${params.toString()}`,
  );
  return res.data;
}

export async function withdrawAdminRefundRequest(
  requestId: string,
  reason: string,
): Promise<{ previousStatus: RefundRequestStatus; status: RefundRequestStatus }> {
  const res = await api.post<{ previousStatus: RefundRequestStatus; status: RefundRequestStatus }>(
    `/api/admin/refund-requests/${requestId}/withdraw`,
    { reason },
  );
  return res.data;
}

export async function decideAdminRefundRequest(
  requestId: string,
  decision: 'APPROVE' | 'REJECT',
  reason: string,
): Promise<{ previousStatus: RefundRequestStatus; status: RefundRequestStatus; decision: string }> {
  const res = await api.post<{ previousStatus: RefundRequestStatus; status: RefundRequestStatus; decision: string }>(
    `/api/admin/refund-requests/${requestId}/decide`,
    { decision, reason },
  );
  return res.data;
}
