// apps/backend/src/controllers/breakEven.controller.ts
import { Response } from 'express';
import { CustomRequest } from '../types';
import { BreakEvenService } from '../services/breakEven.service';

const svc = new BreakEvenService();

export async function getBreakEven(req: CustomRequest, res: Response) {
  const propertyId = req.params.propertyId;
  const userId = req.user?.userId;

  const years = req.query.years ? Number(req.query.years) : undefined;
  const homeValueNow = req.query.homeValueNow ? Number(req.query.homeValueNow) : undefined;
  const appreciationRate = req.query.appreciationRate ? Number(req.query.appreciationRate) : undefined;
  const expenseGrowthRate = req.query.expenseGrowthRate ? Number(req.query.expenseGrowthRate) : undefined;
  const inflationRate = req.query.inflationRate ? Number(req.query.inflationRate) : undefined;
  const rentGrowthRate = req.query.rentGrowthRate ? Number(req.query.rentGrowthRate) : undefined;
  const interestRate = req.query.interestRate ? Number(req.query.interestRate) : undefined;
  const propertyTaxGrowthRate = req.query.propertyTaxGrowthRate
    ? Number(req.query.propertyTaxGrowthRate)
    : undefined;
  const insuranceGrowthRate = req.query.insuranceGrowthRate
    ? Number(req.query.insuranceGrowthRate)
    : undefined;
  const maintenanceGrowthRate = req.query.maintenanceGrowthRate
    ? Number(req.query.maintenanceGrowthRate)
    : undefined;
  const sellingCostPercent = req.query.sellingCostPercent
    ? Number(req.query.sellingCostPercent)
    : undefined;
  const mortgageBalance = req.query.mortgageBalance
    ? Number(req.query.mortgageBalance)
    : undefined;
  const mortgageAnnualRate = req.query.mortgageAnnualRate
    ? Number(req.query.mortgageAnnualRate)
    : undefined;
  const remainingTermMonths = req.query.remainingTermMonths
    ? Number(req.query.remainingTermMonths)
    : undefined;
  const monthlyPayment = req.query.monthlyPayment
    ? Number(req.query.monthlyPayment)
    : undefined;
  const assumptionSetId =
    typeof req.query.assumptionSetId === 'string' ? req.query.assumptionSetId : undefined;

  const dto = await svc.compute(propertyId, {
    years: years as any,
    assumptionSetId,
    homeValueNow,
    appreciationRate,
    expenseGrowthRate,
    inflationRate,
    rentGrowthRate,
    interestRate,
    propertyTaxGrowthRate,
    insuranceGrowthRate,
    maintenanceGrowthRate,
    sellingCostPercent,
    mortgageBalance,
    mortgageAnnualRate,
    remainingTermMonths,
    monthlyPayment,
  }, userId);

  return res.json({
    success: true,
    data: { breakEven: dto },
  });
}
