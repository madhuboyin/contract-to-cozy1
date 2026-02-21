// apps/backend/src/controllers/insuranceAuditor.controller.ts
import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { calculateProtectionGap } from '../services/insuranceAuditor.service';

export async function getProtectionGap(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId } = req.params;
    const result = await calculateProtectionGap(propertyId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
