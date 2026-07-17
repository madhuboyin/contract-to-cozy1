import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { APIError } from '../middleware/error.middleware';
import { guidanceJourneyService } from '../services/guidanceEngine/guidanceJourney.service';
import { priceFinalizationService } from '../services/priceFinalization.service';
import {
  CreatePriceFinalizationBody,
  FinalizePriceFinalizationBody,
  priceFinalizationListQuerySchema,
  UpdatePriceFinalizationBody,
} from '../validators/priceFinalization.validators';
import { logger } from '../lib/logger';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import {
  assertProjectComplianceDecisionsApplicable,
  getProjectComplianceEnvelope,
} from '../services/projectCompliance/context';

function requireUser(req: CustomRequest) {
  const userId = req.user?.userId;
  if (!userId) {
    throw new APIError('Authentication required.', 401, 'AUTH_REQUIRED');
  }

  return {
    userId,
  };
}

function inferIssueDomainFromSignalFamily(signalIntentFamily?: string | null) {
  const family = String(signalIntentFamily ?? '').trim().toLowerCase();

  if (family === 'inspection_followup_needed') return 'MAINTENANCE' as const;
  if (family === 'financial_exposure' || family === 'cost_of_inaction_risk') return 'FINANCIAL' as const;
  if (family === 'coverage_gap' || family === 'coverage_lapse_detected') return 'INSURANCE' as const;

  return 'ASSET_LIFECYCLE' as const;
}

export async function listPriceFinalizations(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = requireUser(req);
    const queryResult = priceFinalizationListQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      throw new APIError(
        'Invalid price finalization query parameters.',
        400,
        'VALIDATION_ERROR',
        queryResult.error.issues
      );
    }

    const result = await priceFinalizationService.listForProperty(
      req.params.propertyId,
      userId,
      queryResult.data.limit,
      {
        guidanceJourneyId: queryResult.data.guidanceJourneyId,
        inventoryItemId: queryResult.data.inventoryItemId,
        homeAssetId: queryResult.data.homeAssetId,
      }
    );
    const propertyContext = await getProjectComplianceEnvelope(req.params.propertyId, userId, 'PRICE_FINALIZATION');

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.PROJECT_MGMT,
      featureKey: AnalyticsFeature.PRICE_FINALIZATION,
      metadataJson: { count: Array.isArray((result as any)?.finalizations) ? (result as any).finalizations.length : undefined },
    });

    res.status(200).json({ success: true, data: { ...result, propertyContext } });
  } catch (error) {
    next(error);
  }
}

export async function getPriceFinalizationDetail(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = requireUser(req);
    const detail = await priceFinalizationService.getDetail(
      req.params.propertyId,
      userId,
      req.params.finalizationId
    );
    const propertyContext = await getProjectComplianceEnvelope(req.params.propertyId, userId, 'PRICE_FINALIZATION');

    res.status(200).json({ success: true, data: { finalization: detail, propertyContext } });
  } catch (error) {
    next(error);
  }
}

export async function createPriceFinalizationDraft(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = requireUser(req);
    const payload = req.body as CreatePriceFinalizationBody;
    const serviceCategory = await priceFinalizationService.resolveServiceCategory(
      req.params.propertyId,
      userId,
      payload,
    );

    await assertProjectComplianceDecisionsApplicable(
      req.params.propertyId,
      userId,
      'PRICE_FINALIZATION',
      { serviceCategory: serviceCategory ?? 'UNSPECIFIED' },
      ['priceFinalization', 'providerBooking'],
    );

    const detail = await priceFinalizationService.createDraft(
      req.params.propertyId,
      userId,
      {
        ...payload,
        serviceCategory: payload.serviceCategory ?? serviceCategory,
      }
    );
    const propertyContext = await getProjectComplianceEnvelope(req.params.propertyId, userId, 'PRICE_FINALIZATION');

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.PROJECT_MGMT,
      featureKey: AnalyticsFeature.PRICE_FINALIZATION,
      metadataJson: { actionType: 'create_draft', finalizationId: detail.id, serviceCategory: detail.serviceCategory },
    });

    res.status(201).json({ success: true, data: { finalization: detail, propertyContext } });
  } catch (error) {
    next(error);
  }
}

export async function updatePriceFinalizationDraft(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = requireUser(req);
    const payload = req.body as UpdatePriceFinalizationBody;

    const detail = await priceFinalizationService.updateDraft(
      req.params.propertyId,
      userId,
      req.params.finalizationId,
      {
        ...payload,
      }
    );
    const propertyContext = await getProjectComplianceEnvelope(req.params.propertyId, userId, 'PRICE_FINALIZATION');

    res.status(200).json({ success: true, data: { finalization: detail, propertyContext } });
  } catch (error) {
    next(error);
  }
}

export async function finalizePriceFinalization(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = requireUser(req);
    const payload = req.body as FinalizePriceFinalizationBody & {
      serviceCategory?: string | null;
      guidanceStepKey?: string | null;
      guidanceSignalIntentFamily?: string | null;
    };

    const existing = await priceFinalizationService.getDetail(
      req.params.propertyId,
      userId,
      req.params.finalizationId,
    );
    await assertProjectComplianceDecisionsApplicable(
      req.params.propertyId,
      userId,
      'PRICE_FINALIZATION',
      { serviceCategory: payload.serviceCategory ?? existing.serviceCategory ?? 'UNSPECIFIED' },
      ['priceFinalization', 'providerBooking'],
    );

    const detail = await priceFinalizationService.finalize(
      req.params.propertyId,
      userId,
      req.params.finalizationId,
      {
        ...payload,
      }
    );
    const propertyContext = await getProjectComplianceEnvelope(req.params.propertyId, userId, 'PRICE_FINALIZATION');

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.PROJECT_MGMT,
      featureKey: AnalyticsFeature.PRICE_FINALIZATION,
      metadataJson: {
        actionType: 'finalize',
        finalizationId: detail.id,
        acceptedPrice: detail.acceptedPrice,
        serviceCategory: detail.serviceCategory,
      },
    });

    const resolvedStepKey =
      detail.guidanceStepKey ||
      (typeof payload.guidanceStepKey === 'string' ? payload.guidanceStepKey : null) ||
      'finalize_price';

    const resolvedSignalFamily =
      detail.guidanceSignalIntentFamily ||
      (typeof payload.guidanceSignalIntentFamily === 'string' ? payload.guidanceSignalIntentFamily : null) ||
      'lifecycle_end_or_past_life';

    try {
      await guidanceJourneyService.recordToolCompletion({
        propertyId: req.params.propertyId,
        actorUserId: userId,
        journeyId: detail.guidanceJourneyId,
        signalIntentFamily: resolvedSignalFamily,
        issueDomain: inferIssueDomainFromSignalFamily(resolvedSignalFamily),
        sourceToolKey: 'price-finalization',
        sourceEntityType: 'PRICE_FINALIZATION',
        sourceEntityId: detail.id,
        stepKey: resolvedStepKey,
        status: 'COMPLETED',
        inventoryItemId: detail.inventoryItemId,
        homeAssetId: detail.homeAssetId,
        producedData: {
          proofType: 'price_finalization',
          proofId: detail.id,
          finalizationId: detail.id,
          acceptedPrice: detail.acceptedPrice,
          currency: detail.currency,
          vendorName: detail.vendorName,
          serviceCategory: detail.serviceCategory,
          termsAcceptedCount: detail.terms.filter((term) => term.isAccepted).length,
        },
      });
    } catch (guidanceError) {
      logger.warn({ guidanceError }, '[GUIDANCE] price finalization hook failed');
    }

    res.status(200).json({ success: true, data: { finalization: detail, propertyContext } });
  } catch (error) {
    next(error);
  }
}
