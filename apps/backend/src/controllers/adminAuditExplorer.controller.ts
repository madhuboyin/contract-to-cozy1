// apps/backend/src/controllers/adminAuditExplorer.controller.ts

import { Response } from 'express';
import { AuthRequest } from '../types/auth.types';
import { logger } from '../lib/logger';
import { queryAuditLog } from '../services/adminAuditExplorer.service';

export async function queryAuditLogHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { actorId, entityType, entityId, action, requestId, from, to, before, limit } = req.query as Record<
      string,
      string | undefined
    >;

    const result = await queryAuditLog({
      actorId,
      entityType,
      entityId,
      action,
      requestId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      before: before ? new Date(before) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    res.json({ success: true, data: result });
  } catch (err: any) {
    logger.error({ err }, '[ADMIN-AUDIT-EXPLORER] Failed to query audit log');
    res.status(500).json({ success: false, error: { message: 'Failed to query audit log' } });
  }
}
