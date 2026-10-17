// apps/backend/src/controllers/sellHoldRent.controller.ts
import { Response } from 'express';
import { CustomRequest } from '../types';
import { SellHoldRentService, SellHoldRentInput } from '../services/sellHoldRent.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { APIError } from '../middleware/error.middleware';
import { sendMortgageRateInvalid, sendPlanningHomeValueRequired } from '../utils/planningHomeValueResponse';
import { getCurrentFinancialContextEnvelope } from '../services/financialContext/context';

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
  const years: 5 | 10 = yearsRaw === '10' ? 10 : 5;

  const inputs: SellHoldRentInput = {
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
  };
  let outcome: Awaited<ReturnType<typeof svc.estimateOutcome>>;
  try {
    outcome = await svc.estimateOutcome(propertyId, inputs, userId);
  } catch (error) {
    if (error instanceof APIError && error.code === 'MORTGAGE_RATE_INVALID') return sendMortgageRateInvalid(res, error);
    throw error;
  }
  if (outcome.status === 'HOME_VALUE_REQUIRED') return sendPlanningHomeValueRequired(res);
  const dto = outcome.value;
  const propertyContext = await getCurrentFinancialContextEnvelope(propertyId, req.user!.userId, 'SELL_HOLD_RENT');
  const overrideFields = Object.entries(inputs)
    .filter(([key, value]) => key !== 'years' && value !== undefined)
    .map(([key]) => key);

  analyticsEmitter.track({
    eventType: AnalyticsEvent.TOOL_USED,
    userId,
    propertyId,
    moduleKey: AnalyticsModule.HOME_BUYER,
    featureKey: AnalyticsFeature.SELL_HOLD_RENT,
    metadataJson: { years },
  });

  // ✅ Option B: match your standard API envelope used by api.get()
  return res.json({
    success: true,
    data: {
      sellHoldRent: {
        ...dto,
        propertyContext,
        calculationContext: {
          mode: overrideFields.length > 0 ? 'SCENARIO' : 'CANONICAL',
          overrideFields,
        },
      },
    },
  });
}
