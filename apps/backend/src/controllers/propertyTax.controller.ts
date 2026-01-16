// apps/backend/src/controllers/propertyTax.controller.ts
import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { PropertyTaxService } from '../services/propertyTax.service';

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
    const historyYears = parseNumber(req.query.historyYears);

    const estimate = await service.estimate(propertyId, {
      assessedValue,
      taxRate,
      historyYears: historyYears ? Math.round(historyYears) : undefined,
    });

    res.json({ success: true, data: { estimate } });
  } catch (err) {
    next(err);
  }
}
