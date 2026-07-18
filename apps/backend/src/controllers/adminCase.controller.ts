// apps/backend/src/controllers/adminCase.controller.ts

import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { logger } from '../lib/logger';
import {
  addCaseNote,
  AdminCaseError,
  assignCase,
  changeCaseStatus,
  createCase,
  getCaseDetail,
  listCases,
} from '../services/adminCase.service';

function isCaseError(err: unknown): err is AdminCaseError {
  return err instanceof AdminCaseError;
}

const CLIENT_ERROR_CODES = new Set([
  'CASE_NOT_FOUND',
  'INVALID_TRANSITION',
  'RESOLUTION_REQUIRED',
  'INVALID_ASSIGNEE',
]);

function statusForCode(code: string): number {
  return code === 'CASE_NOT_FOUND' ? 404 : 409;
}

function handleClientError(err: unknown, res: Response): boolean {
  if (isCaseError(err) && CLIENT_ERROR_CODES.has(err.code)) {
    res.status(statusForCode(err.code)).json({ success: false, error: { message: err.message, code: err.code } });
    return true;
  }
  return false;
}

export async function listCasesHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { type, status, severity, entityType, entityId, page, limit } = req.query as Record<string, string | undefined>;
    const result = await listCases({
      type: type as any,
      status: status as any,
      severity: severity as any,
      entityType,
      entityId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    logger.error({ err }, '[ADMIN-CASE] Failed to list cases');
    res.status(500).json({ success: false, error: { message: 'Failed to list cases' } });
  }
}

export async function getCaseDetailHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const detail = await getCaseDetail(req.params.caseId);
    res.json({ success: true, data: detail });
  } catch (err: any) {
    if (handleClientError(err, res)) return;
    logger.error({ err }, '[ADMIN-CASE] Failed to load case detail');
    res.status(500).json({ success: false, error: { message: 'Failed to load case detail' } });
  }
}

export async function createCaseHandler(req: AuthRequest, res: Response): Promise<void> {
  const { type, severity, title, description, entityType, entityId } = req.body;
  try {
    const created = await createCase(
      { actorId: req.user!.userId, type, severity, title, description, entityType, entityId },
      { req }
    );
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    logger.error({ err }, '[ADMIN-CASE] Failed to create case');
    res.status(500).json({ success: false, error: { message: 'Failed to create case' } });
  }
}

export async function changeCaseStatusHandler(req: AuthRequest, res: Response): Promise<void> {
  const { status, reason, resolution } = req.body;
  try {
    const result = await changeCaseStatus(
      { caseId: req.params.caseId, actorId: req.user!.userId, status, reason, resolution },
      { req }
    );
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (handleClientError(err, res)) return;
    logger.error({ err }, '[ADMIN-CASE] Failed to change case status');
    res.status(500).json({ success: false, error: { message: 'Failed to change case status' } });
  }
}

export async function assignCaseHandler(req: AuthRequest, res: Response): Promise<void> {
  const { assignedToId, reason } = req.body;
  try {
    const result = await assignCase(
      { caseId: req.params.caseId, actorId: req.user!.userId, assignedToId, reason },
      { req }
    );
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (handleClientError(err, res)) return;
    logger.error({ err }, '[ADMIN-CASE] Failed to assign case');
    res.status(500).json({ success: false, error: { message: 'Failed to assign case' } });
  }
}

export async function addCaseNoteHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const note = await addCaseNote({
      caseId: req.params.caseId,
      actorId: req.user!.userId,
      body: req.body.body,
    });
    res.status(201).json({ success: true, data: note });
  } catch (err: any) {
    if (handleClientError(err, res)) return;
    logger.error({ err }, '[ADMIN-CASE] Failed to add case note');
    res.status(500).json({ success: false, error: { message: 'Failed to add case note' } });
  }
}
