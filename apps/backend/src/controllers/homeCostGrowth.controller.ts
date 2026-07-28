// apps/backend/src/controllers/homeCostGrowth.controller.ts
import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { HomeCostGrowthService } from '../services/homeCostGrowth.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { getCurrentFinancialContextEnvelope } from '../services/financialContext/context';
import { costGrowthQuerySchema, validationErrorResponse } from './ownershipCostContainment.schemas';

const service = new HomeCostGrowthService();

export async function getHomeCostGrowth(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;

    const parsed = costGrowthQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json(validationErrorResponse(parsed.error));
    }
    const {
      years,
      assessedValue,
      taxRate,
      homeValueNow,
      appreciationRate,
      insuranceAnnualNow,
      maintenanceAnnualNow,
    } = parsed.data;

    const costGrowth = await service.estimate(propertyId, {
      years,
      assessedValue,
      taxRate,
      homeValueNow,
      appreciationRate,
      insuranceAnnualNow,
      maintenanceAnnualNow,
    });
    const propertyContext = await getCurrentFinancialContextEnvelope(propertyId, req.user!.userId, 'COST_GROWTH');
    const overrideFields = Object.entries({
      assessedValue,
      taxRate,
      homeValueNow,
      appreciationRate,
      insuranceAnnualNow,
      maintenanceAnnualNow,
    }).filter(([, value]) => value !== undefined).map(([key]) => key);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.HOME_COST_GROWTH,
      metadataJson: { years, appreciationRate: costGrowth.current.appreciationRate },
    });

    res.json({
      success: true,
      data: {
        costGrowth: {
          ...costGrowth,
          propertyContext,
          calculationContext: {
            mode: overrideFields.length > 0 ? 'SCENARIO' : 'CANONICAL',
            overrideFields,
          },
        },
      },
    });
  } catch (err) {
    next(err);
  }
}
