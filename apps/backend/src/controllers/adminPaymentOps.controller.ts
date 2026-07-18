// apps/backend/src/controllers/adminPaymentOps.controller.ts

import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { logger } from '../lib/logger';
import {
  AdminPaymentOpsError,
  createRefundRequest,
  decideRefundRequest,
  getPaymentDetail,
  listPayments,
  listRefundRequests,
} from '../services/adminPaymentOps.service';

function isPaymentOpsError(err: unknown): err is AdminPaymentOpsError {
  return err instanceof AdminPaymentOpsError;
}

const CLIENT_ERROR_CODES = new Set([
  'PAYMENT_NOT_FOUND',
  'PAYMENT_NOT_REFUNDABLE',
  'AMOUNT_EXCEEDS_REFUNDABLE',
  'REQUEST_ALREADY_PENDING',
  'REQUEST_NOT_FOUND',
  'REQUEST_NOT_PENDING',
  'SELF_APPROVAL_FORBIDDEN',
]);

function statusForCode(code: string): number {
  return code === 'PAYMENT_NOT_FOUND' || code === 'REQUEST_NOT_FOUND' ? 404 : 409;
}

function handleClientError(err: unknown, res: Response): boolean {
  if (isPaymentOpsError(err) && CLIENT_ERROR_CODES.has(err.code)) {
    res.status(statusForCode(err.code)).json({ success: false, error: { message: err.message, code: err.code } });
    return true;
  }
  return false;
}

export async function listPaymentsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { q, status, page, limit } = req.query as Record<string, string | undefined>;
    const result = await listPayments({
      q,
      status: status as any,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    logger.error({ err }, '[ADMIN-PAYMENT-OPS] Failed to list payments');
    res.status(500).json({ success: false, error: { message: 'Failed to list payments' } });
  }
}

export async function getPaymentDetailHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const detail = await getPaymentDetail(req.params.paymentId);
    res.json({ success: true, data: detail });
  } catch (err: any) {
    if (handleClientError(err, res)) return;
    logger.error({ err }, '[ADMIN-PAYMENT-OPS] Failed to load payment detail');
    res.status(500).json({ success: false, error: { message: 'Failed to load payment detail' } });
  }
}

export async function createRefundRequestHandler(req: AuthRequest, res: Response): Promise<void> {
  const { amount, reason, policyBasis } = req.body;
  try {
    const created = await createRefundRequest(
      { paymentId: req.params.paymentId, actorId: req.user!.userId, amount, reason, policyBasis },
      { req }
    );
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    if (handleClientError(err, res)) return;
    logger.error({ err }, '[ADMIN-PAYMENT-OPS] Failed to create refund request');
    res.status(500).json({ success: false, error: { message: 'Failed to create refund request' } });
  }
}

export async function listRefundRequestsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { status, page, limit } = req.query as Record<string, string | undefined>;
    const result = await listRefundRequests({
      status: status as any,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    logger.error({ err }, '[ADMIN-PAYMENT-OPS] Failed to list refund requests');
    res.status(500).json({ success: false, error: { message: 'Failed to list refund requests' } });
  }
}

export async function decideRefundRequestHandler(req: AuthRequest, res: Response): Promise<void> {
  const { decision, reason } = req.body;
  try {
    const result = await decideRefundRequest(
      { requestId: req.params.requestId, actorId: req.user!.userId, decision, reason },
      { req }
    );
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (handleClientError(err, res)) return;
    logger.error({ err }, '[ADMIN-PAYMENT-OPS] Failed to decide refund request');
    res.status(500).json({ success: false, error: { message: 'Failed to decide refund request' } });
  }
}
