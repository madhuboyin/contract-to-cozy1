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

    // NOTE: service always filters status='DRAFT'
    const drafts = await svc.listDraftsFiltered({
      propertyId,
      userId,
      roomId,
      scanSessionId,
    });

    // ✅ IMPORTANT: return APISuccess envelope for frontend APIClient.get()
    return res.json({
      success: true,
      data: {
        drafts: Array.isArray(drafts) ? drafts : [],
      },
    });
  } catch (err) {
    next(err);
  }
}
