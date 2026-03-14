import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { APIError } from '../middleware/error.middleware';
import { ServicePriceRadarService } from '../services/servicePriceRadar.service';
import {
  CreateServicePriceRadarBody,
  listServicePriceRadarQuerySchema,
  TrackServicePriceRadarEventBody,
} from '../validators/servicePriceRadar.validators';

const service = new ServicePriceRadarService();

function requireUserId(req: CustomRequest): string {
  const userId = req.user?.userId;
  if (!userId) {
    throw new APIError('Authentication required.', 401, 'AUTH_REQUIRED');
  }
  return userId;
}

export async function createServicePriceRadarCheck(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = requireUserId(req);
    const payload = req.body as CreateServicePriceRadarBody;
    const result = await service.createCheck(req.params.propertyId, userId, payload);
    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
}

export async function listServicePriceRadarChecks(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = requireUserId(req);
    const queryResult = listServicePriceRadarQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      throw new APIError('Invalid Service Price Radar query parameters.', 400, 'VALIDATION_ERROR', queryResult.error.issues);
    }

    const query = queryResult.data;
    const result = await service.listChecks(req.params.propertyId, userId, query);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
}

export async function getServicePriceRadarCheckDetail(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = requireUserId(req);
    const result = await service.getCheckDetail(req.params.propertyId, req.params.checkId, userId);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
}

export async function trackServicePriceRadarEvent(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = requireUserId(req);
    const payload = req.body as TrackServicePriceRadarEventBody;
    const result = await service.trackEvent(req.params.propertyId, userId, payload);
    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
}
