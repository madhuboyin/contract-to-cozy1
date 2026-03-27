import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { RoomPlantAdvisorService } from '../services/roomPlantAdvisor.service';

const service = new RoomPlantAdvisorService();

export async function listEligiblePlantAdvisorRooms(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId } = req.params;
    const data = await service.listEligibleRooms(propertyId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listPlantCatalog(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId } = req.params;
    const data = await service.listCatalog(propertyId, {
      roomType: req.query.roomType as any,
      lightLevel: req.query.lightLevel as any,
      maintenanceLevel: req.query.maintenanceLevel as any,
      petSafeOnly:
        req.query.petSafeOnly === 'true' || req.query.petSafeOnly === '1'
          ? true
          : req.query.petSafeOnly === 'false' || req.query.petSafeOnly === '0'
            ? false
            : undefined,
      goal: req.query.goal as any,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getRoomPlantAdvisorState(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, roomId } = req.params;
    const data = await service.getRoomAdvisorState(propertyId, roomId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function upsertRoomPlantProfile(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, roomId } = req.params;
    const data = await service.upsertRoomProfile(propertyId, roomId, req.body);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function generateRoomPlantRecommendations(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, roomId } = req.params;
    const data = await service.generateRecommendations(propertyId, roomId, req.body || {});
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function saveRoomPlantRecommendation(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, roomId, recommendationId } = req.params;
    const data = await service.saveRecommendation(propertyId, roomId, recommendationId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function dismissRoomPlantRecommendation(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, roomId, recommendationId } = req.params;
    const data = await service.dismissRecommendation(propertyId, roomId, recommendationId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function addRoomPlantRecommendationToHome(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, roomId, recommendationId } = req.params;
    const userId = req.user?.userId ?? null;
    const data = await service.addRecommendationToHome(propertyId, roomId, recommendationId, userId, req.body || {});
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

