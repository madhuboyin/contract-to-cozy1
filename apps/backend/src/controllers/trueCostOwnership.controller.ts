// apps/backend/src/controllers/trueCostOwnership.controller.ts
import { Response } from 'express';
import { TrueCostOwnershipService } from '../services/trueCostOwnership.service';
import { CustomRequest } from '../types';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { getCurrentFinancialContextEnvelope } from '../services/financialContext/context';
import { trueCostQuerySchema, validationErrorResponse } from './ownershipCostContainment.schemas';

const svc = new TrueCostOwnershipService();

export async function getTrueCostOwnership(req: CustomRequest, res: Response) {
  const propertyId = req.params.propertyId;

  const parsed = trueCostQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json(validationErrorResponse(parsed.error));
  }
  const {
    years,
    homeValueNow,
    insuranceAnnualNow,
    maintenanceAnnualNow,
    utilitiesAnnualNow,
    inflationRate,
  } = parsed.data;

  const dto = await svc.estimate(propertyId, {
    years,
    homeValueNow,
    insuranceAnnualNow,
    maintenanceAnnualNow,
    utilitiesAnnualNow,
    inflationRate,
  });
  const propertyContext = await getCurrentFinancialContextEnvelope(propertyId, req.user!.userId, 'TRUE_COST');
  const overrideFields = Object.entries({
    homeValueNow,
    insuranceAnnualNow,
    maintenanceAnnualNow,
    utilitiesAnnualNow,
    inflationRate,
  }).filter(([, value]) => value !== undefined).map(([key]) => key);

  analyticsEmitter.track({
    eventType: AnalyticsEvent.TOOL_USED,
    userId: req.user?.userId,
    propertyId,
    moduleKey: AnalyticsModule.FINANCIAL,
    featureKey: AnalyticsFeature.TRUE_COST_OWNERSHIP,
    metadataJson: { years, annualTotalNow: dto.current.annualTotalNow, confidence: dto.meta.confidence },
  });

  return res.json({
    success: true,
    data: {
      trueCostOwnership: {
        ...dto,
        propertyContext,
        calculationContext: {
          mode: overrideFields.length > 0 ? 'SCENARIO' : 'CANONICAL',
          overrideFields,
        },
      },
    },
  });
}
