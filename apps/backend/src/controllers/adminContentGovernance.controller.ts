// apps/backend/src/controllers/adminContentGovernance.controller.ts

import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { logger } from '../lib/logger';
import {
  AdminContentGovernanceError,
  getEditorialQueues,
  transitionKnowledgeArticle,
} from '../services/adminContentGovernance.service';

const CLIENT_ERROR_CODES = new Set(['ARTICLE_NOT_FOUND', 'INVALID_ACTION', 'INVALID_TRANSITION']);

function handleClientError(err: unknown, res: Response): boolean {
  if (err instanceof AdminContentGovernanceError && CLIENT_ERROR_CODES.has(err.code)) {
    const status = err.code === 'ARTICLE_NOT_FOUND' ? 404 : 409;
    res.status(status).json({ success: false, error: { message: err.message, code: err.code } });
    return true;
  }
  return false;
}

export function makeTransitionHandler(allowedActions: readonly string[]) {
  return async function transitionHandler(req: AuthRequest, res: Response): Promise<void> {
    const { action, reason } = req.body as { action: string; reason: string };

    if (!allowedActions.includes(action)) {
      res.status(403).json({
        success: false,
        error: { message: `Action "${action}" is not available on this endpoint.`, code: 'ACTION_NOT_ALLOWED' },
      });
      return;
    }

    try {
      const result = await transitionKnowledgeArticle(
        { articleId: req.params.articleId, actorId: req.user!.userId, action: action as any, reason },
        { req }
      );
      res.json({ success: true, data: result });
    } catch (err: any) {
      if (handleClientError(err, res)) return;
      logger.error({ err }, '[ADMIN-CONTENT-GOV] Failed to transition article');
      res.status(500).json({ success: false, error: { message: 'Failed to transition article' } });
    }
  };
}

export async function getEditorialQueuesHandler(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const queues = await getEditorialQueues();
    res.json({ success: true, data: queues });
  } catch (err: any) {
    logger.error({ err }, '[ADMIN-CONTENT-GOV] Failed to load editorial queues');
    res.status(500).json({ success: false, error: { message: 'Failed to load editorial queues' } });
  }
}
