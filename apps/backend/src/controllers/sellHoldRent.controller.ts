// apps/backend/src/controllers/sellHoldRent.controller.ts
import { Response } from 'express';
import { CustomRequest } from '../types';
import { SellHoldRentService } from '../services/sellHoldRent.service';

const svc = new SellHoldRentService();

function num(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function getSellHoldRent(req: CustomRequest, res: Response) {
  const propertyId = req.params.propertyId;
  const userId = req.user?.userId;

  const yearsRaw = req.query.years;
  const years = yearsRaw === '10' ? 10 : 5;

  const dto = await svc.estimate(propertyId, {
    years,
    assumptionSetId: typeof req.query.assumptionSetId === 'string' ? req.query.assumptionSetId : undefined,
    homeValueNow: num(req.query.homeValueNow),
    appreciationRate: num(req.query.appreciationRate),
    sellingCostRate: num(req.query.sellingCostRate),
    inflationRate: num(req.query.inflationRate),
    interestRate: num(req.query.interestRate),
    propertyTaxGrowthRate: num(req.query.propertyTaxGrowthRate),
    insuranceGrowthRate: num(req.query.insuranceGrowthRate),
    maintenanceGrowthRate: num(req.query.maintenanceGrowthRate),
    monthlyRentNow: num(req.query.monthlyRentNow),
    rentGrowthRate: num(req.query.rentGrowthRate),
    vacancyRate: num(req.query.vacancyRate),
    managementRate: num(req.query.managementRate),
  }, userId);

  // ✅ Option B: match your standard API envelope used by api.get()
  return res.json({
    success: true,
    data: { sellHoldRent: dto },
  });
}
