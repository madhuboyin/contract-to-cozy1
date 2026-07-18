// apps/backend/src/controllers/adminUserSupport.controller.ts

import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { logger } from '../lib/logger';
import {
  AdminUserSupportError,
  changeUserStatus,
  getUserSummary,
  revokeUserSessions,
  searchUsers,
} from '../services/adminUserSupport.service';

function isAdminUserSupportError(err: unknown): err is AdminUserSupportError {
  return err instanceof AdminUserSupportError;
}

const CLIENT_ERROR_CODES = new Set(['SELF_ACTION_FORBIDDEN', 'USER_NOT_FOUND', 'INVALID_STATUS']);

function statusForCode(code: string): number {
  return code === 'USER_NOT_FOUND' ? 404 : 409;
}

export async function searchUsersHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { q, limit } = req.query as { q: string; limit?: string };
    const results = await searchUsers(q, limit ? Number(limit) : undefined);
    res.json({ success: true, data: results });
  } catch (err: any) {
    logger.error({ err }, '[ADMIN-USER-SUPPORT] Failed to search users');
    res.status(500).json({ success: false, error: { message: 'Failed to search users' } });
  }
}

export async function getUserSummaryHandler(req: AuthRequest, res: Response): Promise<void> {
  const { userId } = req.params;
  try {
    const summary = await getUserSummary(userId);
    res.json({ success: true, data: summary });
  } catch (err: any) {
    if (isAdminUserSupportError(err) && CLIENT_ERROR_CODES.has(err.code)) {
      res.status(statusForCode(err.code)).json({ success: false, error: { message: err.message, code: err.code } });
      return;
    }
    logger.error({ err }, '[ADMIN-USER-SUPPORT] Failed to load user summary');
    res.status(500).json({ success: false, error: { message: 'Failed to load user summary' } });
  }
}

export async function revokeUserSessionsHandler(req: AuthRequest, res: Response): Promise<void> {
  const { userId } = req.params;
  const { reason } = req.body;
  const actorId = req.user!.userId;

  try {
    const result = await revokeUserSessions({ userId, actorId, reason }, { req });
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (isAdminUserSupportError(err) && CLIENT_ERROR_CODES.has(err.code)) {
      res.status(statusForCode(err.code)).json({ success: false, error: { message: err.message, code: err.code } });
      return;
    }
    logger.error({ err }, '[ADMIN-USER-SUPPORT] Failed to revoke sessions');
    res.status(500).json({ success: false, error: { message: 'Failed to revoke sessions' } });
  }
}

export async function changeUserStatusHandler(req: AuthRequest, res: Response): Promise<void> {
  const { userId } = req.params;
  const { status, reason } = req.body;
  const actorId = req.user!.userId;

  try {
    const result = await changeUserStatus({ userId, actorId, status, reason }, { req });
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (isAdminUserSupportError(err) && CLIENT_ERROR_CODES.has(err.code)) {
      res.status(statusForCode(err.code)).json({ success: false, error: { message: err.message, code: err.code } });
      return;
    }
    logger.error({ err }, '[ADMIN-USER-SUPPORT] Failed to change user status');
    res.status(500).json({ success: false, error: { message: 'Failed to change user status' } });
  }
}
