// apps/backend/src/controllers/costVolatility.controller.ts
import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { CostVolatilityService } from '../services/costVolatility.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';

const svc = new CostVolatilityService();

function parseYears(q: any): 5 | 10 {
  const v = String(q?.years ?? '').trim();
  if (v === '10') return 10;
  return 5;
}

export async function getCostVolatility(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const years = parseYears(req.query);

    const costVolatility = await svc.compute(propertyId, { years });

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.COST_VOLATILITY,
      metadataJson: { volatilityIndex: costVolatility.index.volatilityIndex, band: costVolatility.index.band },
    });

    return res.json({ success: true, data: { costVolatility } });
  } catch (e) {
    next(e);
  }
}
