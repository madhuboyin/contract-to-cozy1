// apps/backend/src/controllers/inventoryRoomScan.controller.ts
import { Response } from 'express';
import { CustomRequest } from '../types';
import { APIError } from '../middleware/error.middleware';
import { RoomScanService } from '../services/roomScan/roomScan.service';

const svc = new RoomScanService();

function pickUploadedFiles(req: CustomRequest): Express.Multer.File[] {
  const direct = ((req as any).files as Express.Multer.File[]) || [];
  if (Array.isArray(direct) && direct.length) return direct;

  const obj = (req as any).files as Record<string, Express.Multer.File[]> | undefined;
  const fromImages = obj?.images || obj?.image || [];
  return Array.isArray(fromImages) ? fromImages : [];
}

export async function startRoomScan(req: CustomRequest, res: Response) {
  const propertyId = req.params.propertyId;
  const roomId = req.params.roomId;
  const userId = req.user?.userId;

  if (!userId) throw new APIError('Authentication required', 401, 'AUTH_REQUIRED');

  const files = pickUploadedFiles(req);
  const out = await svc.runRoomScan({ propertyId, roomId, userId, files });

  return res.json({
    sessionId: out.sessionId,
    drafts: out.drafts,
  });
}

export async function getRoomScanSession(req: CustomRequest, res: Response) {
  const propertyId = req.params.propertyId;
  const roomId = req.params.roomId;
  const sessionId = req.params.sessionId;
  const userId = req.user?.userId;

  if (!userId) throw new APIError('Authentication required', 401, 'AUTH_REQUIRED');

  const out = await svc.getSession({ propertyId, roomId, sessionId, userId });
  return res.json(out);
}
