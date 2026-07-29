import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { APIError } from '../middleware/error.middleware';
import { ServicePriceRadarService } from '../services/servicePriceRadar.service';
import {
  CreateServicePriceRadarBody,
  listServicePriceRadarQuerySchema,
  TrackServicePriceRadarEventBody,
} from '../validators/servicePriceRadar.validators';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import {
  assertProjectComplianceApplicable,
  getProjectComplianceEnvelope,
} from '../services/projectCompliance/context';

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
    const currentContext = await assertProjectComplianceApplicable(
      req.params.propertyId,
      userId,
      'SERVICE_PRICE_RADAR',
      { serviceCategory: payload.serviceCategory },
      'localPriceBenchmarking',
    );
    const result = await service.createCheck(
      req.params.propertyId,
      userId,
      payload,
      currentContext.contextVersion,
    );
    const propertyContext = await getProjectComplianceEnvelope(
      req.params.propertyId,
      userId,
      'SERVICE_PRICE_RADAR',
      { serviceCategory: payload.serviceCategory },
      currentContext.contextVersion,
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.MARKETPLACE,
      featureKey: AnalyticsFeature.SERVICE_PRICE_RADAR,
      metadataJson: {
        actionType: 'check_generated',
        outcomeCompleted: false,
        verdict: result.check.verdict,
        confidenceScore: result.check.confidenceScore,
      },
    });

    return res.status(201).json({ success: true, data: { ...result, propertyContext } });
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
    const [result, propertyContext] = await Promise.all([
      service.listChecks(req.params.propertyId, userId, query),
      getProjectComplianceEnvelope(req.params.propertyId, userId, 'SERVICE_PRICE_RADAR'),
    ]);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.MARKETPLACE,
      featureKey: AnalyticsFeature.SERVICE_PRICE_RADAR,
      metadataJson: {},
    });

    return res.status(200).json({ success: true, data: { ...result, propertyContext } });
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
    const snapshot = result.check.propertySnapshotJson;
    const generatedContextVersion = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
      ? String((snapshot as Record<string, unknown>).propertyContextVersion ?? '') || null
      : null;
    const propertyContext = await getProjectComplianceEnvelope(
      req.params.propertyId,
      userId,
      'SERVICE_PRICE_RADAR',
      { serviceCategory: result.check.serviceCategory },
      generatedContextVersion,
    );
    return res.status(200).json({ success: true, data: { ...result, propertyContext } });
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
