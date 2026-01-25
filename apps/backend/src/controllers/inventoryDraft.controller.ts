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

export async function updateInventoryDraft(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const draftId = req.params.draftId;
    const userId = req.user?.userId;
    if (!userId) throw new APIError('Authentication required', 401, 'AUTH_REQUIRED');

    const body = req.body || {};

    const updated = await svc.updateDraft({
      propertyId,
      userId,
      draftId,
      patch: {
        name: typeof body.name === 'string' ? body.name : undefined,
        category: typeof body.category === 'string' ? body.category : undefined,
        roomId: typeof body.roomId === 'string' ? body.roomId : undefined,

        condition: typeof body.condition === 'string' ? body.condition : undefined,
        brand: typeof body.brand === 'string' ? body.brand : undefined,
        model: typeof body.model === 'string' ? body.model : undefined,
        serialNo: typeof body.serialNo === 'string' ? body.serialNo : undefined,

        manufacturer: typeof body.manufacturer === 'string' ? body.manufacturer : undefined,
        modelNumber: typeof body.modelNumber === 'string' ? body.modelNumber : undefined,
        serialNumber: typeof body.serialNumber === 'string' ? body.serialNumber : undefined,
        upc: typeof body.upc === 'string' ? body.upc : undefined,
        sku: typeof body.sku === 'string' ? body.sku : undefined,
      },
    });

    return res.json({ success: true, data: { draft: updated } });
  } catch (err) {
    next(err);
  }
}
