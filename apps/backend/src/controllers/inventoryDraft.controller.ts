// apps/backend/src/controllers/inventoryDraft.controller.ts
import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { APIError } from '../middleware/error.middleware';
import { InventoryDraftService } from '../services/inventoryDraft.service';

const svc = new InventoryDraftService();

export async function listInventoryDrafts(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;
    if (!userId) throw new APIError('Authentication required', 401, 'AUTH_REQUIRED');

    const scanSessionIdRaw = typeof req.query.scanSessionId === 'string' ? req.query.scanSessionId.trim() : '';
    const roomIdRaw = typeof req.query.roomId === 'string' ? req.query.roomId.trim() : '';

    // ✅ Treat "undefined" as absent (frontend bug / bad callers)
    const scanSessionId =
      scanSessionIdRaw && scanSessionIdRaw !== 'undefined' ? scanSessionIdRaw : undefined;

    const roomId =
      roomIdRaw && roomIdRaw !== 'undefined' ? roomIdRaw : undefined;

    const drafts = await svc.listDraftsFiltered({
      propertyId,
      userId,
      roomId,
      scanSessionId,
    });

    // ✅ Always return array
    return res.json({ drafts: Array.isArray(drafts) ? drafts : [] });
  } catch (err) {
    next(err);
  }
}
