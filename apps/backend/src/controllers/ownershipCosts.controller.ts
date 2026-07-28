import type { Response } from 'express';
import { z } from 'zod';
import type { CustomRequest } from '../types';
import {
  AnalyticsEvent,
  AnalyticsFeature,
  AnalyticsModule,
  analyticsEmitter,
} from '../services/analytics';
import {
  OWNERSHIP_COST_CURRENT_LENSES,
  ownershipCostReadModelService,
} from '../services/ownershipCosts/ownershipCostReadModel.service';
import { OwnershipCostAccessDeniedError } from '../services/ownershipCosts/ownershipCostObservation.service';
import { validationErrorResponse } from './ownershipCostContainment.schemas';

export const ownershipCostReadQuerySchema = z.object({
  lens: z.enum(OWNERSHIP_COST_CURRENT_LENSES)
    .default('OPERATING_EXPENSE'),
}).strict();

function ownershipCostError(error: unknown, res: Response) {
  if (error instanceof OwnershipCostAccessDeniedError) {
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
  const message = error instanceof Error
    ? error.message
    : 'Ownership costs are temporarily unavailable.';
  const noSnapshot = message.includes('No ownership-cost snapshot');
  return res.status(noSnapshot ? 404 : 503).json({
    success: false,
    message,
  });
}

async function respondWithCurrentCost(
  req: CustomRequest,
  res: Response,
  refresh: boolean,
) {
  const parsed = ownershipCostReadQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json(validationErrorResponse(parsed.error));
  }

  try {
    const ownershipCosts = await ownershipCostReadModelService.getCurrent(
      req.params.propertyId,
      req.user!.userId,
      parsed.data.lens,
      { refresh },
    );
    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.TRUE_COST_OWNERSHIP,
      metadataJson: {
        capability: 'ownership-costs',
        lens: ownershipCosts.selectedLens,
        coverageStatus: ownershipCosts.snapshot.coverageStatus,
        confirmedCategoryCount:
          ownershipCosts.coverage.confirmedCategoryCount,
        estimatedCategoryCount:
          ownershipCosts.coverage.estimatedCategoryCount,
        missingCategoryCount:
          ownershipCosts.coverage.missingCategoryCount,
        lastKnownGood: ownershipCosts.snapshot.lastKnownGood,
        refresh,
      },
    });
    return res.json({
      success: true,
      data: { ownershipCosts },
    });
  } catch (error) {
    return ownershipCostError(error, res);
  }
}

export async function getOwnershipCosts(
  req: CustomRequest,
  res: Response,
) {
  return respondWithCurrentCost(req, res, false);
}

export async function recalculateOwnershipCosts(
  req: CustomRequest,
  res: Response,
) {
  return respondWithCurrentCost(req, res, true);
}
