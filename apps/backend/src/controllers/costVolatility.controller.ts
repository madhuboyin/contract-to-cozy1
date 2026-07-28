// apps/backend/src/controllers/costVolatility.controller.ts
import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { CostVolatilityService } from '../services/costVolatility.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { getCurrentFinancialContextEnvelope } from '../services/financialContext/context';
import { ownershipCostYearsQuerySchema, validationErrorResponse } from './ownershipCostContainment.schemas';

const svc = new CostVolatilityService();

export async function getCostVolatility(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const parsed = ownershipCostYearsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json(validationErrorResponse(parsed.error));
    }
    const { years } = parsed.data;

    const costVolatility = await svc.compute(propertyId, { years });
    const propertyContext = await getCurrentFinancialContextEnvelope(propertyId, req.user!.userId, 'COST_VOLATILITY');

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.COST_VOLATILITY,
      metadataJson: {
        volatilityEligible: costVolatility.eligibility.eligible,
        comparableObservedPeriods: costVolatility.eligibility.comparableObservedPeriods,
      },
    });

    return res.json({
      success: true,
      data: {
        costVolatility: {
          ...costVolatility,
          propertyContext,
          calculationContext: { mode: 'CANONICAL', overrideFields: [] },
        },
      },
    });
  } catch (e) {
    next(e);
  }
}
