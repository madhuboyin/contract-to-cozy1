// apps/backend/src/controllers/costExplainer.controller.ts
import { Response } from 'express';
import { CustomRequest } from '../types';
import { CostExplainerService } from '../services/costExplainer.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { getCurrentFinancialContextEnvelope } from '../services/financialContext/context';
import { ownershipCostYearsQuerySchema, validationErrorResponse } from './ownershipCostContainment.schemas';

const service = new CostExplainerService();

export async function getCostExplainer(req: CustomRequest, res: Response) {
  const propertyId = req.params.propertyId;
  const parsed = ownershipCostYearsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json(validationErrorResponse(parsed.error));
  }
  const { years } = parsed.data;

  const data = await service.explain(propertyId, years);
  const propertyContext = await getCurrentFinancialContextEnvelope(propertyId, req.user!.userId, 'COST_EXPLAINER');

  analyticsEmitter.track({
    eventType: AnalyticsEvent.TOOL_USED,
    userId: req.user?.userId,
    propertyId,
    moduleKey: AnalyticsModule.FINANCIAL,
    featureKey: AnalyticsFeature.COST_EXPLAINER,
    metadataJson: { years, annualTotalNow: data.snapshot.annualTotalNow },
  });

  return res.json({
    success: true,
    data: {
      costExplainer: {
        ...data,
        propertyContext,
        calculationContext: { mode: 'CANONICAL', overrideFields: [] },
      },
    },
  });
}
