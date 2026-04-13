// apps/backend/src/controllers/trueCostOwnership.controller.ts
import { Response } from 'express';
import { TrueCostOwnershipService } from '../services/trueCostOwnership.service';
import { CustomRequest } from '../types';
import { guidanceJourneyService } from '../services/guidanceEngine/guidanceJourney.service';
import { logger } from '../lib/logger';

const svc = new TrueCostOwnershipService();

function readQueryString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    const trimmed = value[0].trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

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

  const guidanceJourneyId = readQueryString(req.query.guidanceJourneyId);
  const guidanceStepKey = readQueryString(req.query.guidanceStepKey);
  const guidanceSignalIntentFamily =
    readQueryString(req.query.guidanceSignalIntentFamily)?.toLowerCase() ?? 'financial_exposure';

  try {
    await guidanceJourneyService.recordToolCompletion({
      propertyId,
      actorUserId: req.user?.userId ?? null,
      journeyId: guidanceJourneyId ?? null,
      signalIntentFamily: guidanceSignalIntentFamily,
      issueDomain: 'FINANCIAL',
      sourceToolKey: 'true-cost',
      sourceEntityType: 'TRUE_COST_OWNERSHIP_ESTIMATE',
      sourceEntityId: `${propertyId}:${dto.meta.generatedAt}`,
      stepKey: guidanceStepKey ?? 'estimate_out_of_pocket_cost',
      status: 'COMPLETED',
      producedData: {
        proofType: 'cost_estimate',
        proofId: `${propertyId}:${dto.meta.generatedAt}`,
        annualTotalNow: dto.current.annualTotalNow,
        total5y: dto.rollup.total5y,
        taxes5y: dto.rollup.breakdown5y.taxes,
        insurance5y: dto.rollup.breakdown5y.insurance,
        maintenance5y: dto.rollup.breakdown5y.maintenance,
        utilities5y: dto.rollup.breakdown5y.utilities,
        confidence: dto.meta.confidence,
      },
    });
  } catch (guidanceError) {
    logger.warn('[GUIDANCE] true-cost hook failed:', guidanceError);
  }

  return res.json({
    success: true,
    data: { trueCostOwnership: dto },
  });
}
