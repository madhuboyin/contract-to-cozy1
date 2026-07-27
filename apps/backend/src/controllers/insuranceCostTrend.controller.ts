// apps/backend/src/controllers/insuranceCostTrend.controller.ts
import { Response } from 'express';
import { CustomRequest } from '../types';

export async function getInsuranceCostTrend(_req: CustomRequest, res: Response) {
  return res.status(410).json({
    success: false,
    code: 'HEURISTIC_INSURANCE_TREND_RETIRED',
    message:
      'Modeled insurance history is no longer available. Use the confirmed policy-term history endpoint.',
  });
}
