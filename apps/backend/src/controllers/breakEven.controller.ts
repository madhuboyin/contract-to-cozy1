// apps/backend/src/controllers/breakEven.controller.ts
import { Response } from 'express';
import { CustomRequest } from '../types';
import { BreakEvenService } from '../services/breakEven.service';

const svc = new BreakEvenService();

export async function getBreakEven(req: CustomRequest, res: Response) {
  const propertyId = req.params.propertyId;

  const years = req.query.years ? Number(req.query.years) : undefined;
  const homeValueNow = req.query.homeValueNow ? Number(req.query.homeValueNow) : undefined;
  const appreciationRate = req.query.appreciationRate ? Number(req.query.appreciationRate) : undefined;
  const expenseGrowthRate = req.query.expenseGrowthRate ? Number(req.query.expenseGrowthRate) : undefined;

  const dto = await svc.compute(propertyId, {
    years: years as any,
    homeValueNow,
    appreciationRate,
    expenseGrowthRate,
  });

  return res.json({
    success: true,
    data: { breakEven: dto },
  });
}
