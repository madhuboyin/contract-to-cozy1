// apps/backend/src/controllers/adminPrivacyRequests.controller.ts

import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { logger } from '../lib/logger';
import {
  AdminPrivacyRequestError,
  changePrivacyRequestStatus,
  createPrivacyRequest,
  getPrivacyRequestDetail,
  listPrivacyRequests,
  setLegalHold,
} from '../services/adminPrivacyRequests.service';

function isPrivacyError(err: unknown): err is AdminPrivacyRequestError {
  return err instanceof AdminPrivacyRequestError;
}

const CLIENT_ERROR_CODES = new Set([
  'REQUEST_NOT_FOUND',
  'INVALID_TRANSITION',
  'RESOLUTION_REQUIRED',
  'LEGAL_HOLD_ACTIVE',
  'REQUEST_TERMINAL',
]);

function statusForCode(code: string): number {
  return code === 'REQUEST_NOT_FOUND' ? 404 : 409;
}

function handleClientError(err: unknown, res: Response): boolean {
  if (isPrivacyError(err) && CLIENT_ERROR_CODES.has(err.code)) {
    res.status(statusForCode(err.code)).json({ success: false, error: { message: err.message, code: err.code } });
    return true;
  }
  return false;
}

export async function listPrivacyRequestsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { status, type, page, limit } = req.query as Record<string, string | undefined>;
    const result = await listPrivacyRequests({
      status: status as any,
      type: type as any,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    logger.error({ err }, '[ADMIN-PRIVACY] Failed to list privacy requests');
    res.status(500).json({ success: false, error: { message: 'Failed to list privacy requests' } });
  }
}

export async function getPrivacyRequestDetailHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const detail = await getPrivacyRequestDetail(req.params.requestId);
    res.json({ success: true, data: detail });
  } catch (err: any) {
    if (handleClientError(err, res)) return;
    logger.error({ err }, '[ADMIN-PRIVACY] Failed to load privacy request');
    res.status(500).json({ success: false, error: { message: 'Failed to load privacy request' } });
  }
}

export async function createPrivacyRequestHandler(req: AuthRequest, res: Response): Promise<void> {
  const { userEmail, type, jurisdiction, dueAt } = req.body;
  try {
    const created = await createPrivacyRequest(
      {
        actorId: req.user!.userId,
        userEmail,
        type,
        jurisdiction,
        dueAt: dueAt ? new Date(dueAt) : undefined,
      },
      { req }
    );
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    logger.error({ err }, '[ADMIN-PRIVACY] Failed to create privacy request');
    res.status(500).json({ success: false, error: { message: 'Failed to create privacy request' } });
  }
}

export async function changePrivacyRequestStatusHandler(req: AuthRequest, res: Response): Promise<void> {
  const { status, reason, resolutionSummary } = req.body;
  try {
    const result = await changePrivacyRequestStatus(
      { requestId: req.params.requestId, actorId: req.user!.userId, status, reason, resolutionSummary },
      { req }
    );
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (handleClientError(err, res)) return;
    logger.error({ err }, '[ADMIN-PRIVACY] Failed to change privacy request status');
    res.status(500).json({ success: false, error: { message: 'Failed to change privacy request status' } });
  }
}

export async function setLegalHoldHandler(req: AuthRequest, res: Response): Promise<void> {
  const { legalHold, reason } = req.body;
  try {
    const result = await setLegalHold(
      { requestId: req.params.requestId, actorId: req.user!.userId, legalHold, reason },
      { req }
    );
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (handleClientError(err, res)) return;
    logger.error({ err }, '[ADMIN-PRIVACY] Failed to set legal hold');
    res.status(500).json({ success: false, error: { message: 'Failed to set legal hold' } });
  }
}
