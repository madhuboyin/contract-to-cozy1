// apps/backend/src/controllers/valueIntelligence.controller.ts
import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { calculateHomeEquity } from '../services/valueIntelligence.service';

export async function getHomeEquity(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId } = req.params;
    const result = await calculateHomeEquity(propertyId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
