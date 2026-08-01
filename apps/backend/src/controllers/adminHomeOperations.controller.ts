// apps/backend/src/controllers/adminHomeOperations.controller.ts

import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { logger } from '../lib/logger';
import {
  AdminHomeOperationsError,
  getAdminWorkItemDetail,
} from '../services/adminHomeOperations.service';

export async function getAdminWorkItemDetailHandler(req: AuthRequest, res: Response): Promise<void> {
  const { workItemId } = req.params;
  try {
    const detail = await getAdminWorkItemDetail(workItemId);
    res.json({ success: true, data: detail });
  } catch (err: any) {
    if (err instanceof AdminHomeOperationsError && err.code === 'WORK_ITEM_NOT_FOUND') {
      res.status(404).json({ success: false, error: { message: err.message, code: err.code } });
      return;
    }
    logger.error({ err }, '[ADMIN-HOME-OPERATIONS] Failed to load work item detail');
    res.status(500).json({ success: false, error: { message: 'Failed to load work item detail' } });
  }
}
