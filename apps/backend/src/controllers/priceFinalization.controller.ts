import { resolveGuidanceStepBinding } from '../services/guidanceEngine/guidanceStepBinding';
import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { APIError } from '../middleware/error.middleware';
import { priceFinalizationService } from '../services/priceFinalization.service';
import {
  createPriceFinalizationDraftWithEffects,
  finalizePriceFinalizationWithEffects,
  updatePriceFinalizationDraftWithEffects,
} from '../services/priceFinalizationOperations';
import {
  CreatePriceFinalizationBody,
  FinalizePriceFinalizationBody,
  priceFinalizationListQuerySchema,
  UpdatePriceFinalizationBody,
} from '../validators/priceFinalization.validators';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { getProjectComplianceEnvelope } from '../services/projectCompliance/context';

function requireUser(req: CustomRequest) {
  const userId = req.user?.userId;
  if (!userId) {
    throw new APIError('Authentication required.', 401, 'AUTH_REQUIRED');
  }

  return {
    userId,
  };
}

function propertyContextVersionFromMetadata(metadata: Record<string, unknown> | null): string | null {
  const value = metadata?._propertyContextVersion;
  return typeof value === 'string' && value.trim() ? value : null;
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
      }
    );
    const propertyContext = await getProjectComplianceEnvelope(
      req.params.propertyId,
      userId,
      'PRICE_FINALIZATION',
    );

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
    const propertyContext = await getProjectComplianceEnvelope(
      req.params.propertyId,
      userId,
      'PRICE_FINALIZATION',
      { serviceCategory: detail.serviceCategory },
      propertyContextVersionFromMetadata(detail.metadataJson),
    );

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
    const { guidanceStepId, ...body } = req.body as CreatePriceFinalizationBody & { guidanceStepId?: string | null };
    // The record's journey and step come only from the supplied step, re-read inside this home. A step that does not fit stores neither, so finalizing reports to no journey.
    let guidanceJourneyId: string | null = null;
    let guidanceStepKey: string | null = null;
    if (guidanceStepId) {
      const bound = await resolveGuidanceStepBinding(req.params.propertyId, guidanceStepId, { toolKey: 'price-finalization', stepKeys: ['finalize_price'] });
      if (bound.ok) { guidanceJourneyId = bound.binding.journeyId; guidanceStepKey = bound.binding.stepKey; }
    }
    const payload = { ...body, guidanceJourneyId, guidanceStepKey } as CreatePriceFinalizationBody;
    const { detail, contextVersion } = await createPriceFinalizationDraftWithEffects(req.params.propertyId, userId, payload as never);
    const propertyContext = await getProjectComplianceEnvelope(
      req.params.propertyId,
      userId,
      'PRICE_FINALIZATION',
      { serviceCategory: detail.serviceCategory },
      contextVersion,
    );

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
    const { detail, contextVersion } = await updatePriceFinalizationDraftWithEffects(
      req.params.propertyId, userId, req.params.finalizationId, payload as never,
    );
    const propertyContext = await getProjectComplianceEnvelope(
      req.params.propertyId,
      userId,
      'PRICE_FINALIZATION',
      { serviceCategory: detail.serviceCategory },
      contextVersion,
    );

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
    const { detail, contextVersion } = await finalizePriceFinalizationWithEffects(
      req.params.propertyId, userId, req.params.finalizationId, payload as never,
    );
    const propertyContext = await getProjectComplianceEnvelope(
      req.params.propertyId,
      userId,
      'PRICE_FINALIZATION',
      { serviceCategory: detail.serviceCategory },
      contextVersion,
    );

    res.status(200).json({ success: true, data: { finalization: detail, propertyContext } });
  } catch (error) {
    next(error);
  }
}
