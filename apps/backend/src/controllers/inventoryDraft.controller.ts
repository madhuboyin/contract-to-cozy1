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

    const scanSessionId =
      typeof req.query.scanSessionId === 'string' && req.query.scanSessionId.trim()
        ? req.query.scanSessionId.trim()
        : undefined;

    const roomId =
      typeof req.query.roomId === 'string' && req.query.roomId.trim()
        ? req.query.roomId.trim()
        : undefined;

    const status =
      typeof req.query.status === 'string' && req.query.status.trim()
        ? req.query.status.trim()
        : undefined;

    // ✅ keep “filtered” endpoint behavior
    // if you want status filtering, add it in service; right now service always uses DRAFT
    const drafts = await svc.listDraftsFiltered({
      propertyId,
      userId,
      roomId,
      scanSessionId,
    });

    // ✅ ALWAYS return an array
    return res.json({ drafts });
  } catch (err) {
    next(err);
  }
}
