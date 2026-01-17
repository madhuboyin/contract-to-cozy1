// apps/backend/src/controllers/insuranceCostTrend.controller.ts
import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { InsuranceCostTrendService } from '../services/insuranceCostTrend.service';

const service = new InsuranceCostTrendService();

function parseNumber(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function parseYears(v: any): 5 | 10 | undefined {
  const n = parseNumber(v);
  if (n === undefined) return undefined;
  if (Math.round(n) === 10) return 10;
  if (Math.round(n) === 5) return 5;
  return undefined;
}

export async function getInsuranceCostTrend(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const years = parseYears(req.query.years) ?? 5;

    const homeValueNow = parseNumber(req.query.homeValueNow);
    const insuranceAnnualNow = parseNumber(req.query.insuranceAnnualNow);
    const inflationRate = parseNumber(req.query.inflationRate);

    const trend = await service.estimate(propertyId, {
      years,
      homeValueNow,
      insuranceAnnualNow,
      inflationRate,
    });

    res.json({ success: true, data: { insuranceTrend: trend } });
  } catch (err) {
    next(err);
  }
}
