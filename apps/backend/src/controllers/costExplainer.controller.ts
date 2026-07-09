// apps/backend/src/controllers/costExplainer.controller.ts
import { Response } from 'express';
import { CustomRequest } from '../types';
import { CostExplainerService } from '../services/costExplainer.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';

const service = new CostExplainerService();

export async function getCostExplainer(req: CustomRequest, res: Response) {
  const propertyId = req.params.propertyId;
  const years = (req.query.years ? Number(req.query.years) : 5) as 5 | 10;

  const data = await service.explain(propertyId, years);

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
    data: { costExplainer: data },
  });
}
