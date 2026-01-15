// apps/backend/src/controllers/roomInsights.controller.ts
import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { RoomInsightsService } from '../services/roomInsights.service';

const svc = new RoomInsightsService();

export async function getRoomInsights(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, roomId } = req.params;
    const data = await svc.getRoomInsights(propertyId, roomId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function patchRoomMeta(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, roomId } = req.params;
    const { type, profile, heroImage } = req.body || {};
    const updated = await svc.updateRoomMeta(propertyId, roomId, { type, profile, heroImage });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

export async function updateRoomProfile(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, roomId } = req.params;
    const { profile } = req.body || {};
    const room = await svc.updateRoomProfile(propertyId, roomId, profile);
    res.json({ success: true, data: { room } });
  } catch (err) {
    next(err);
  }
}

export async function listRoomChecklistItems(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, roomId } = req.params;
    const items = await svc.listRoomChecklistItems(propertyId, roomId);
    res.json({ success: true, data: { items } });
  } catch (err) {
    next(err);
  }
}

export async function createRoomChecklistItem(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, roomId } = req.params;
    const item = await svc.createRoomChecklistItem(propertyId, roomId, req.body);
    res.json({ success: true, data: { item } });
  } catch (err) {
    next(err);
  }
}

export async function updateRoomChecklistItem(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, roomId, itemId } = req.params;
    const item = await svc.updateRoomChecklistItem(propertyId, roomId, itemId, req.body);
    res.json({ success: true, data: { item } });
  } catch (err) {
    next(err);
  }
}

export async function deleteRoomChecklistItem(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, roomId, itemId } = req.params;
    await svc.deleteRoomChecklistItem(propertyId, roomId, itemId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function getRoomTimeline(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, roomId } = req.params;
    const timeline = await svc.getRoomTimeline(propertyId, roomId);
    res.json({ success: true, data: { timeline } });
  } catch (err) {
    next(err);
  }
}
