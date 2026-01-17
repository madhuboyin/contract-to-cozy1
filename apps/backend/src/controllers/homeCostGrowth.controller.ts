// apps/backend/src/controllers/homeCostGrowth.controller.ts
import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { HomeCostGrowthService } from '../services/homeCostGrowth.service';

const service = new HomeCostGrowthService();

function parseNumber(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function parseYears(v: any): 5 | 10 | undefined {
  const n = parseNumber(v);
  if (n === undefined) return undefined;
  if (Math.round(n) === 10) return 10;
  if (Math.round(n) === 5) return 5;
  return undefined;
}

export async function getHomeCostGrowth(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;

    const years = parseYears(req.query.years) ?? 5;

    const assessedValue = parseNumber(req.query.assessedValue);
    const taxRate = parseNumber(req.query.taxRate);
    const homeValueNow = parseNumber(req.query.homeValueNow);
    const appreciationRate = parseNumber(req.query.appreciationRate);
    const insuranceAnnualNow = parseNumber(req.query.insuranceAnnualNow);
    const maintenanceAnnualNow = parseNumber(req.query.maintenanceAnnualNow);

    const costGrowth = await service.estimate(propertyId, {
      years,
      assessedValue,
      taxRate,
      homeValueNow,
      appreciationRate,
      insuranceAnnualNow,
      maintenanceAnnualNow,
    });

    res.json({ success: true, data: { costGrowth } });
  } catch (err) {
    next(err);
  }
}
