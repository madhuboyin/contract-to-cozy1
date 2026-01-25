// apps/backend/src/controllers/inventoryRoomScan.controller.ts
import { CustomRequest } from '../types';
import { APIError } from '../middleware/error.middleware';
import { RoomScanService } from '../services/roomScan/roomScan.service';
import { NextFunction, Response } from 'express';

const svc = new RoomScanService();

function pickUploadedFiles(req: CustomRequest): Express.Multer.File[] {
  const direct = ((req as any).files as Express.Multer.File[]) || [];
  if (Array.isArray(direct) && direct.length) return direct;

  const obj = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
  const fromImages = obj?.images || obj?.image || [];
  return Array.isArray(fromImages) ? fromImages : [];
}

export async function startRoomScan(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const propertyId = req.params.propertyId;
    const roomId = req.params.roomId;
    const userId = req.user?.userId;

    if (!userId) {
      throw new APIError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    const files = pickUploadedFiles(req);
    if (!files.length || !files[0]?.buffer) {
      throw new APIError('At least one image file is required', 400, 'VALIDATION_ERROR');
    }
    const images = files.map((f) => f.buffer);
    const out = await svc.startScan({ propertyId, roomId, userId, images });

    return res.json({
      sessionId: out.sessionId,
      drafts: out.drafts,
      
    });
  } catch (err) {
    next(err); // ✅ CRITICAL
  }
}

export async function getRoomScanSession(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const propertyId = req.params.propertyId;
    const roomId = req.params.roomId;
    const sessionId = req.params.sessionId;
    const userId = req.user?.userId;

    if (!userId) {
      throw new APIError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    const out = await svc.getSession({ propertyId, roomId, sessionId, userId });
    return res.json(out);
  } catch (err) {
    next(err);
  }
}

