// apps/backend/src/controllers/insuranceAuditor.controller.ts
import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { calculateProtectionGap } from '../services/insuranceAuditor.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';

export async function getProtectionGap(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId } = req.params;
    const result = await calculateProtectionGap(propertyId);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.INSURANCE,
      featureKey: AnalyticsFeature.INSURANCE_AUDITOR,
      metadataJson: { gapAmountCents: (result as any)?.gapAmountCents ?? (result as any)?.protectionGapCents },
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
