import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { APIError } from '../middleware/error.middleware';
import { ServicePriceRadarService } from '../services/servicePriceRadar.service';
import { guidanceJourneyService } from '../services/guidanceEngine/guidanceJourney.service';
import {
  CreateServicePriceRadarBody,
  listServicePriceRadarQuerySchema,
  TrackServicePriceRadarEventBody,
} from '../validators/servicePriceRadar.validators';
import { logger } from '../lib/logger';
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

function resolveScopeFromLinkedEntities(
  entities: Array<{ linkedEntityType: string; linkedEntityId: string }> | undefined
) {
  let inventoryItemId: string | null = null;

  for (const entity of entities ?? []) {
    if (!inventoryItemId && (entity.linkedEntityType === 'APPLIANCE' || entity.linkedEntityType === 'SYSTEM')) {
      inventoryItemId = entity.linkedEntityId;
    }
    if (inventoryItemId) break;
  }

  return { inventoryItemId };
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

    const guidanceSignalIntentFamily =
      payload.guidanceSignalIntentFamily?.trim().toLowerCase() || null;

    const issueDomain =
      guidanceSignalIntentFamily === 'inspection_followup_needed'
        ? 'MAINTENANCE'
        : 'ASSET_LIFECYCLE';
    const guidanceScope = resolveScopeFromLinkedEntities(result.check.linkedEntities);

    try {
      await guidanceJourneyService.recordToolCompletion({
        propertyId: req.params.propertyId,
        actorUserId: userId,
        journeyId: payload.guidanceJourneyId ?? null,
        inventoryItemId: guidanceScope.inventoryItemId,
        signalIntentFamily: guidanceSignalIntentFamily ?? 'lifecycle_end_or_past_life',
        issueDomain,
        sourceToolKey: 'service-price-radar',
        sourceEntityType: 'SERVICE_PRICE_RADAR_CHECK',
        sourceEntityId: result.check.id,
        stepKey: payload.guidanceStepKey ?? null,
        status: 'COMPLETED',
        producedData: {
          checkId: result.check.id,
          serviceCategory: result.check.serviceCategory,
          verdict: result.check.verdict,
          confidenceScore: result.check.confidenceScore,
          fairPriceMin: result.check.expectedLow,
          fairPriceMax: result.check.expectedHigh,
          fairPriceMedian: result.check.expectedMedian,
          currency: result.check.quoteCurrency,
          quoteAmount: result.check.quoteAmount,
          explanationShort: result.check.explanationShort,
          proofType: 'price_validation',
          proofId: result.check.id,
        },
        metadata: {
          linkedEntityCount: result.check.linkedEntities?.length ?? 0,
        },
      });
    } catch (guidanceError) {
      logger.warn({ guidanceError }, '[GUIDANCE] service price radar hook failed');
    }

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.MARKETPLACE,
      featureKey: AnalyticsFeature.SERVICE_PRICE_RADAR,
      metadataJson: {
        actionType: 'create_check',
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
