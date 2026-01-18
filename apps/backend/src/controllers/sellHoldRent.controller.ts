// apps/backend/src/controllers/sellHoldRent.controller.ts
import { Request, Response } from 'express';
import { SellHoldRentService } from '../services/sellHoldRent.service';

const svc = new SellHoldRentService();

function num(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function getSellHoldRent(req: Request, res: Response) {
  const propertyId = req.params.propertyId;

  const yearsRaw = req.query.years;
  const years = yearsRaw === '10' ? 10 : 5;

  const dto = await svc.estimate(propertyId, {
    years,
    homeValueNow: num(req.query.homeValueNow),
    appreciationRate: num(req.query.appreciationRate),
    sellingCostRate: num(req.query.sellingCostRate),
    monthlyRentNow: num(req.query.monthlyRentNow),
    rentGrowthRate: num(req.query.rentGrowthRate),
    vacancyRate: num(req.query.vacancyRate),
    managementRate: num(req.query.managementRate),
  });

  // Match existing tool response pattern (keyed payload)
  return res.json({ sellHoldRent: dto });
}
