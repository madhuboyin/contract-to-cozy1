// apps/backend/src/services/adminPaymentOps.service.ts
//
// Payment Operations workspace backend (ADMIN_MODULE_FRD.md §10.4, Phase 3
// slice). Local-ledger reads under PAYMENT_VIEW plus a two-person refund
// workflow: REFUND_REQUEST opens a request, REFUND_APPROVE decides it, and
// the requester can never be the approver. Record-and-govern only — no
// payment-provider integration exists yet, so an APPROVED request is
// terminal (no money moves, no Payment mutation) until refund execution
// ships. Card data is never stored, only Stripe reference IDs.

import { Request } from 'express';
import { PaymentStatus, Prisma, RefundRequestStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { recordAdminAction } from './adminAudit.service';

export class AdminPaymentOpsError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AdminPaymentOpsError';
  }
}

interface ActionContext {
  req?: Pick<Request, 'ip' | 'headers'> | null;
}

const PAYMENT_SELECT = {
  id: true,
  amount: true,
  currency: true,
  status: true,
  isDeposit: true,
  stripePaymentIntentId: true,
  description: true,
  failureReason: true,
  refundedAmount: true,
  refundedAt: true,
  createdAt: true,
  booking: {
    select: {
      id: true,
      bookingNumber: true,
      status: true,
      homeowner: { select: { id: true, firstName: true, lastName: true } },
      providerProfile: { select: { id: true, businessName: true } },
    },
  },
} as const;

export interface ListPaymentsInput {
  q?: string;
  status?: PaymentStatus;
  page?: number;
  limit?: number;
}

/**
 * Payment search plus a local-ledger summary (count + amount by status).
 * "Reconciliation" against the provider ledger is PLANNED — there is no
 * provider integration to reconcile against yet.
 */
export async function listPayments(input: ListPaymentsInput = {}) {
  const page = input.page ?? 1;
  const limit = Math.min(input.limit ?? 25, 100);
  const q = input.q?.trim();

  const where: Prisma.PaymentWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(q
      ? {
          OR: [
            { booking: { bookingNumber: { contains: q, mode: 'insensitive' } } },
            { stripePaymentIntentId: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [payments, total, statusSummary] = await Promise.all([
    prisma.payment.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: PAYMENT_SELECT,
    }),
    prisma.payment.count({ where }),
    prisma.payment.groupBy({
      by: ['status'],
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  return {
    payments,
    total,
    page,
    limit,
    ledgerSummary: statusSummary.map((row) => ({
      status: row.status,
      count: row._count._all,
      totalAmount: row._sum.amount,
    })),
  };
}

export async function getPaymentDetail(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      ...PAYMENT_SELECT,
      stripeChargeId: true,
      updatedAt: true,
      refundRequests: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          reason: true,
          policyBasis: true,
          status: true,
          requestedById: true,
          decidedById: true,
          decidedAt: true,
          decisionReason: true,
          createdAt: true,
        },
      },
    },
  });

  if (!payment) {
    throw new AdminPaymentOpsError('PAYMENT_NOT_FOUND', `No payment with id "${paymentId}".`);
  }

  return payment;
}

export interface CreateRefundRequestInput {
  paymentId: string;
  actorId: string;
  amount: number;
  reason: string;
  policyBasis?: string;
}

/**
 * Opens a refund request (FRD §10.4: "Refund request captures amount,
 * reason ... policy basis"). Amount must not exceed what is still
 * refundable (captured/refunded payments only), and one payment can only
 * have one request pending approval at a time.
 */
export async function createRefundRequest(input: CreateRefundRequestInput, ctx: ActionContext = {}) {
  const payment = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    select: { id: true, amount: true, refundedAmount: true, status: true },
  });
  if (!payment) {
    throw new AdminPaymentOpsError('PAYMENT_NOT_FOUND', `No payment with id "${input.paymentId}".`);
  }

  if (payment.status !== 'CAPTURED' && payment.status !== 'REFUNDED') {
    throw new AdminPaymentOpsError(
      'PAYMENT_NOT_REFUNDABLE',
      `Only CAPTURED or partially REFUNDED payments can be refunded (payment is ${payment.status}).`
    );
  }

  const remaining = Number(payment.amount) - Number(payment.refundedAmount ?? 0);
  if (input.amount > remaining) {
    throw new AdminPaymentOpsError(
      'AMOUNT_EXCEEDS_REFUNDABLE',
      `Requested ${input.amount.toFixed(2)} exceeds the refundable remainder ${remaining.toFixed(2)}.`
    );
  }

  const pendingCount = await prisma.refundRequest.count({
    where: { paymentId: input.paymentId, status: 'PENDING_APPROVAL' },
  });
  if (pendingCount > 0) {
    throw new AdminPaymentOpsError(
      'REQUEST_ALREADY_PENDING',
      'This payment already has a refund request pending approval.'
    );
  }

  const created = await prisma.refundRequest.create({
    data: {
      paymentId: input.paymentId,
      amount: new Prisma.Decimal(input.amount.toFixed(2)),
      reason: input.reason,
      policyBasis: input.policyBasis ?? null,
      requestedById: input.actorId,
    },
  });

  await recordAdminAction({
    actorId: input.actorId,
    action: 'ADMIN_CREATE_REFUND_REQUEST',
    entityType: 'REFUND_REQUEST',
    entityId: created.id,
    capability: 'REFUND_REQUEST',
    reason: input.reason,
    relatedRefs: {
      paymentId: input.paymentId,
      amount: input.amount.toFixed(2),
      policyBasis: input.policyBasis ?? null,
    },
    req: ctx.req,
  });

  return created;
}

export interface ListRefundRequestsInput {
  status?: RefundRequestStatus;
  page?: number;
  limit?: number;
}

/** Refund request queue. Defaults to requests pending approval, oldest first. */
export async function listRefundRequests(input: ListRefundRequestsInput = {}) {
  const page = input.page ?? 1;
  const limit = Math.min(input.limit ?? 25, 100);
  const where: Prisma.RefundRequestWhereInput = { status: input.status ?? 'PENDING_APPROVAL' };

  const [requests, total] = await Promise.all([
    prisma.refundRequest.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        amount: true,
        reason: true,
        policyBasis: true,
        status: true,
        requestedById: true,
        decidedById: true,
        decidedAt: true,
        decisionReason: true,
        createdAt: true,
        payment: {
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            booking: { select: { id: true, bookingNumber: true } },
          },
        },
      },
    }),
    prisma.refundRequest.count({ where }),
  ]);

  return { requests, total, page, limit };
}

export interface WithdrawRefundRequestInput {
  requestId: string;
  actorId: string;
  reason: string;
}

/**
 * Requester-only withdrawal of a pending request (status → CANCELLED).
 * Anyone else who wants a pending request gone must REJECT it under
 * REFUND_APPROVE — withdrawal is deliberately not a second rejection path.
 * Cancelling frees the one-pending-request-per-payment slot.
 */
export async function withdrawRefundRequest(input: WithdrawRefundRequestInput, ctx: ActionContext = {}) {
  const request = await prisma.refundRequest.findUnique({
    where: { id: input.requestId },
    select: { id: true, status: true, requestedById: true, paymentId: true, amount: true },
  });
  if (!request) {
    throw new AdminPaymentOpsError('REQUEST_NOT_FOUND', `No refund request with id "${input.requestId}".`);
  }

  if (request.status !== 'PENDING_APPROVAL') {
    throw new AdminPaymentOpsError('REQUEST_NOT_PENDING', `This refund request is already ${request.status}.`);
  }

  if (request.requestedById !== input.actorId) {
    throw new AdminPaymentOpsError(
      'NOT_REQUESTER',
      'Only the administrator who opened a refund request can withdraw it.'
    );
  }

  await prisma.refundRequest.update({
    where: { id: input.requestId },
    data: {
      status: 'CANCELLED',
      decidedById: input.actorId,
      decidedAt: new Date(),
      decisionReason: input.reason,
    },
  });

  await recordAdminAction({
    actorId: input.actorId,
    action: 'ADMIN_WITHDRAW_REFUND_REQUEST',
    entityType: 'REFUND_REQUEST',
    entityId: input.requestId,
    capability: 'REFUND_REQUEST',
    reason: input.reason,
    oldValues: { status: request.status } as Prisma.InputJsonValue,
    newValues: { status: 'CANCELLED' } as Prisma.InputJsonValue,
    relatedRefs: { paymentId: request.paymentId, amount: request.amount.toString() },
    req: ctx.req,
  });

  return { previousStatus: request.status, status: 'CANCELLED' as const };
}

export interface DecideRefundRequestInput {
  requestId: string;
  actorId: string;
  decision: 'APPROVE' | 'REJECT';
  reason: string;
}

/**
 * Two-person decision (FRD §10.4: "requester and sole approver are
 * separated" — v1 separates them unconditionally, which is stricter than
 * the threshold-based target). APPROVED is terminal for now: refund
 * execution against the payment provider is PLANNED, so deciding a request
 * never mutates the Payment row.
 */
export async function decideRefundRequest(input: DecideRefundRequestInput, ctx: ActionContext = {}) {
  const request = await prisma.refundRequest.findUnique({
    where: { id: input.requestId },
    select: { id: true, status: true, requestedById: true, paymentId: true, amount: true },
  });
  if (!request) {
    throw new AdminPaymentOpsError('REQUEST_NOT_FOUND', `No refund request with id "${input.requestId}".`);
  }

  if (request.status !== 'PENDING_APPROVAL') {
    throw new AdminPaymentOpsError('REQUEST_NOT_PENDING', `This refund request is already ${request.status}.`);
  }

  if (request.requestedById === input.actorId) {
    throw new AdminPaymentOpsError(
      'SELF_APPROVAL_FORBIDDEN',
      'The administrator who requested a refund cannot decide it.'
    );
  }

  const nextStatus: RefundRequestStatus = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';

  await prisma.refundRequest.update({
    where: { id: input.requestId },
    data: {
      status: nextStatus,
      decidedById: input.actorId,
      decidedAt: new Date(),
      decisionReason: input.reason,
    },
  });

  await recordAdminAction({
    actorId: input.actorId,
    action: 'ADMIN_DECIDE_REFUND_REQUEST',
    entityType: 'REFUND_REQUEST',
    entityId: input.requestId,
    capability: 'REFUND_APPROVE',
    reason: input.reason,
    disposition: input.decision,
    oldValues: { status: request.status } as Prisma.InputJsonValue,
    newValues: { status: nextStatus } as Prisma.InputJsonValue,
    relatedRefs: {
      paymentId: request.paymentId,
      amount: request.amount.toString(),
      requestedById: request.requestedById,
    },
    req: ctx.req,
  });

  return { previousStatus: request.status, status: nextStatus, decision: input.decision };
}
