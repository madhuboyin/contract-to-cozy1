// apps/backend/src/controllers/adminIntelligenceRecompute.controller.ts

import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { logger } from '../lib/logger';
import {
  AdminIntelligenceRecomputeError,
  triggerManualRefresh,
  retryFailedTarget,
  getAdminPropertyRefreshState,
} from '../services/adminIntelligenceRecompute.service';

function handleAdminRecomputeError(err: unknown, res: Response, logContext: string): void {
  if (err instanceof AdminIntelligenceRecomputeError) {
    const status = err.code === 'PROPERTY_NOT_FOUND' || err.code === 'TARGET_NOT_FOUND' ? 404 : 409;
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
    return;
  }
  logger.error({ err }, logContext);
  res.status(500).json({ success: false, error: { message: 'Failed to process intelligence recompute request' } });
}

export async function triggerManualRefreshHandler(req: AuthRequest, res: Response): Promise<void> {
  const { propertyId } = req.params;
  try {
    const result = await triggerManualRefresh(propertyId);
    res.json({ success: true, data: result });
  } catch (err) {
    handleAdminRecomputeError(err, res, '[ADMIN-INTELLIGENCE-RECOMPUTE] Failed to trigger manual refresh');
  }
}

export async function retryFailedTargetHandler(req: AuthRequest, res: Response): Promise<void> {
  const { runId, targetId } = req.params;
  try {
    const result = await retryFailedTarget(runId, targetId);
    res.json({ success: true, data: result });
  } catch (err) {
    handleAdminRecomputeError(err, res, '[ADMIN-INTELLIGENCE-RECOMPUTE] Failed to retry recompute target');
  }
}

export async function getPropertyRefreshStateHandler(req: AuthRequest, res: Response): Promise<void> {
  const { propertyId } = req.params;
  try {
    const result = await getAdminPropertyRefreshState(propertyId);
    res.json({ success: true, data: result });
  } catch (err) {
    handleAdminRecomputeError(err, res, '[ADMIN-INTELLIGENCE-RECOMPUTE] Failed to load property refresh state');
  }
}
