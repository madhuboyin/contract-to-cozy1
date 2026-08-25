// apps/backend/src/controllers/adminFeedbackQuality.controller.ts
//
// Home Intelligence Functional Completeness FRD Phase 7 (HI-FBK-005) — one
// admin-reachable read for the typed-feedback quality aggregate. See
// feedbackQualityAggregates.service.ts for the capability/version metric
// joins and deterministic evaluation results returned by this endpoint.

import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { logger } from '../lib/logger';
import { getFeedbackQualityAggregates } from '../services/feedback/feedbackQualityAggregates.service';

export async function getFeedbackQualityHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const sinceParam = typeof req.query.since === 'string' ? req.query.since : undefined;
    const since = sinceParam ? new Date(sinceParam) : undefined;
    if (since && Number.isNaN(since.getTime())) {
      res.status(400).json({ success: false, error: { message: 'since must be a valid ISO date string' } });
      return;
    }
    const report = await getFeedbackQualityAggregates({ since });
    res.json({ success: true, data: report });
  } catch (err) {
    logger.error({ err }, '[ADMIN-FEEDBACK-QUALITY] Failed to load feedback quality aggregates');
    res.status(500).json({ success: false, error: { message: 'Failed to load feedback quality aggregates' } });
  }
}
