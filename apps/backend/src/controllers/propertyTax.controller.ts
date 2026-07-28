// apps/backend/src/controllers/propertyTax.controller.ts
import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { PropertyTaxService } from '../services/propertyTax.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { getCurrentFinancialContextEnvelope } from '../services/financialContext/context';

const service = new PropertyTaxService();

function parseNumber(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

export async function getPropertyTaxEstimate(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;

    const assessedValue = parseNumber(req.query.assessedValue); // USD
    const taxRate = parseNumber(req.query.taxRate); // decimal
    const estimate = await service.estimate(propertyId, {
      assessedValue,
      taxRate,
    });
    const propertyContext = await getCurrentFinancialContextEnvelope(propertyId, req.user!.userId, 'PROPERTY_TAX_VALUE');
    const overrideFields = Object.entries({ assessedValue, taxRate })
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.TAX,
      featureKey: AnalyticsFeature.PROPERTY_TAX,
      metadataJson: { annualTax: estimate.current?.annualTax, confidence: estimate.current?.confidence },
    });

    res.json({
      success: true,
      data: {
        estimate: {
          ...estimate,
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
