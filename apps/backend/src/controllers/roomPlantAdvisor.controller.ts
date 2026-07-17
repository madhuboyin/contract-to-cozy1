import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { RoomPlantAdvisorService } from '../services/roomPlantAdvisor.service';
import { PlantCarePlannerService } from '../services/plantCarePlanner.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';

const service = new RoomPlantAdvisorService();
const carePlanner = new PlantCarePlannerService();

export async function getPlantCareOutlook(req: CustomRequest, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await carePlanner.getOutlook(req.params.propertyId, req.user!.userId) }); } catch (err) { next(err); }
}

export async function createHomePlant(req: CustomRequest, res: Response, next: NextFunction) {
  try { res.status(201).json({ success: true, data: await carePlanner.createPlant(req.params.propertyId, req.user!.userId, req.body) }); } catch (err) { next(err); }
}

export async function updateHomePlantCare(req: CustomRequest, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await carePlanner.updatePlantCare(req.params.propertyId, req.params.plantId, req.body) }); } catch (err) { next(err); }
}

export async function createGardenZone(req: CustomRequest, res: Response, next: NextFunction) {
  try { res.status(201).json({ success: true, data: await carePlanner.createGardenZone(req.params.propertyId, req.user!.userId, req.body) }); } catch (err) { next(err); }
}

export async function updateGardenZone(req: CustomRequest, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await carePlanner.updateGardenZone(req.params.propertyId, req.user!.userId, req.params.zoneId, req.body) }); } catch (err) { next(err); }
}

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

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.AI_INSIGHTS,
      featureKey: AnalyticsFeature.ROOM_PLANT_ADVISOR,
      metadataJson: { roomId },
    });

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

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.AI_INSIGHTS,
      featureKey: AnalyticsFeature.ROOM_PLANT_ADVISOR,
      metadataJson: { actionType: 'generate_recommendations', roomId },
    });

    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function saveRoomPlantRecommendation(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, roomId, recommendationId } = req.params;
    const data = await service.saveRecommendation(propertyId, roomId, recommendationId);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.AI_INSIGHTS,
      featureKey: AnalyticsFeature.ROOM_PLANT_ADVISOR,
      metadataJson: { actionType: 'save_recommendation', roomId },
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function dismissRoomPlantRecommendation(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, roomId, recommendationId } = req.params;
    const data = await service.dismissRecommendation(propertyId, roomId, recommendationId);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.AI_INSIGHTS,
      featureKey: AnalyticsFeature.ROOM_PLANT_ADVISOR,
      metadataJson: { actionType: 'dismiss_recommendation', roomId },
    });

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

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.AI_INSIGHTS,
      featureKey: AnalyticsFeature.ROOM_PLANT_ADVISOR,
      metadataJson: { actionType: 'add_recommendation_to_home', roomId },
    });

    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
