// apps/backend/src/controllers/valueIntelligence.controller.ts
import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { calculateHomeEquity } from '../services/valueIntelligence.service';
import { getCurrentFinancialContextEnvelope } from '../services/financialContext/context';

export async function getHomeEquity(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId } = req.params;
    const result = await calculateHomeEquity(propertyId);
    const propertyContext = await getCurrentFinancialContextEnvelope(propertyId, req.user!.userId, 'VALUE_TRACKER');
    res.json({
      success: true,
      data: {
        ...result,
        propertyContext,
        calculationContext: { mode: 'CANONICAL', overrideFields: [] },
      },
    });
  } catch (err) {
    next(err);
  }
}
