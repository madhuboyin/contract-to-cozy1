// apps/backend/src/controllers/propertyTax.controller.ts
import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { PropertyTaxService } from '../services/propertyTax.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { getCurrentFinancialContextEnvelope } from '../services/financialContext/context';
import { z } from 'zod';
import { propertyTaxRecordService } from '../services/propertyTax/propertyTaxRecord.service';

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

const homeownerRecordSchema = z.object({
  taxYear: z.number().int().min(1900).max(new Date().getFullYear() + 2),
  parcelId: z.string().trim().max(120).optional(),
  stage: z.enum(['UNKNOWN', 'PRELIMINARY', 'TENTATIVE', 'CURRENT_ROLL', 'FINAL', 'CORRECTED']).optional(),
  valuationDate: z.iso.datetime({ offset: true }).optional(),
  classification: z.string().trim().max(160).optional(),
  landValue: z.number().finite().min(0).max(1_000_000_000).optional(),
  improvementValue: z.number().finite().min(0).max(1_000_000_000).optional(),
  totalAssessedValue: z.number().finite().min(0).max(1_000_000_000).optional(),
  taxableValue: z.number().finite().min(0).max(1_000_000_000).optional(),
  assessmentRatio: z.number().finite().min(0).max(1).optional(),
  billAmount: z.number().finite().min(0).max(1_000_000_000).optional(),
  effectiveTaxRate: z.number().finite().min(0).max(1).optional(),
  billNumber: z.string().trim().max(160).optional(),
  issueDate: z.iso.datetime({ offset: true }).optional(),
  dueDates: z.array(z.iso.datetime({ offset: true })).max(12).optional(),
}).strict();

export async function getPropertyTaxCenter(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const record = await propertyTaxRecordService.getCenter(
      req.params.propertyId,
      req.user!.userId,
    );
    res.json({ success: true, data: { record } });
  } catch (error) {
    next(error);
  }
}

export async function recordHomeownerPropertyTaxValues(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = homeownerRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Invalid property tax record',
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    const record = await propertyTaxRecordService.recordHomeownerValues(
      req.params.propertyId,
      req.user!.userId,
      parsed.data,
    );

    res.status(201).json({ success: true, data: { record } });
  } catch (error) {
    next(error);
  }
}
