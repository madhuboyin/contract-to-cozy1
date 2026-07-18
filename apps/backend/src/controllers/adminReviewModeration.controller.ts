// apps/backend/src/controllers/adminReviewModeration.controller.ts

import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { logger } from '../lib/logger';
import {
  AdminReviewModerationError,
  getReviewDetail,
  listReviews,
  moderateReview,
  ModerationAction,
} from '../services/adminReviewModeration.service';

function isModerationError(err: unknown): err is AdminReviewModerationError {
  return err instanceof AdminReviewModerationError;
}

const CLIENT_ERROR_CODES = new Set([
  'REVIEW_NOT_FOUND',
  'SELF_MODERATION_FORBIDDEN',
  'INVALID_ACTION',
  'INVALID_TRANSITION',
]);

function statusForCode(code: string): number {
  return code === 'REVIEW_NOT_FOUND' ? 404 : 409;
}

export async function listReviewsHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { status, page, limit } = req.query as { status?: string; page?: string; limit?: string };
    const result = await listReviews({
      status: status as any,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    logger.error({ err }, '[ADMIN-REVIEW-MODERATION] Failed to list reviews');
    res.status(500).json({ success: false, error: { message: 'Failed to list reviews' } });
  }
}

export async function getReviewDetailHandler(req: AuthRequest, res: Response): Promise<void> {
  const { reviewId } = req.params;
  try {
    const detail = await getReviewDetail(reviewId);
    res.json({ success: true, data: detail });
  } catch (err: any) {
    if (isModerationError(err) && CLIENT_ERROR_CODES.has(err.code)) {
      res.status(statusForCode(err.code)).json({ success: false, error: { message: err.message, code: err.code } });
      return;
    }
    logger.error({ err }, '[ADMIN-REVIEW-MODERATION] Failed to load review detail');
    res.status(500).json({ success: false, error: { message: 'Failed to load review detail' } });
  }
}

export async function moderateReviewHandler(req: AuthRequest, res: Response): Promise<void> {
  const { reviewId } = req.params;
  const { action, reason, policyVersion } = req.body as {
    action: ModerationAction;
    reason: string;
    policyVersion?: string;
  };
  const actorId = req.user!.userId;

  try {
    const result = await moderateReview({ reviewId, actorId, action, reason, policyVersion }, { req });
    res.json({ success: true, data: result });
  } catch (err: any) {
    if (isModerationError(err) && CLIENT_ERROR_CODES.has(err.code)) {
      res.status(statusForCode(err.code)).json({ success: false, error: { message: err.message, code: err.code } });
      return;
    }
    logger.error({ err }, '[ADMIN-REVIEW-MODERATION] Failed to moderate review');
    res.status(500).json({ success: false, error: { message: 'Failed to moderate review' } });
  }
}
