// apps/backend/src/controllers/trueCostOwnership.controller.ts
import { Response } from 'express';
import { TrueCostOwnershipService } from '../services/trueCostOwnership.service';
import { CustomRequest } from '../types';

const svc = new TrueCostOwnershipService();

export async function getTrueCostOwnership(req: CustomRequest, res: Response) {
  const propertyId = req.params.propertyId;

  // Phase 1: years fixed to 5. Allow overrides via query (optional).
  const homeValueNow = req.query.homeValueNow ? Number(req.query.homeValueNow) : undefined;
  const insuranceAnnualNow = req.query.insuranceAnnualNow ? Number(req.query.insuranceAnnualNow) : undefined;
  const maintenanceAnnualNow = req.query.maintenanceAnnualNow ? Number(req.query.maintenanceAnnualNow) : undefined;
  const utilitiesAnnualNow = req.query.utilitiesAnnualNow ? Number(req.query.utilitiesAnnualNow) : undefined;
  const inflationRate = req.query.inflationRate ? Number(req.query.inflationRate) : undefined;

  const dto = await svc.estimate(propertyId, {
    years: 5,
    homeValueNow,
    insuranceAnnualNow,
    maintenanceAnnualNow,
    utilitiesAnnualNow,
    inflationRate,
  });

  return res.json({
    success: true,
    data: { trueCostOwnership: dto },
  });
}
