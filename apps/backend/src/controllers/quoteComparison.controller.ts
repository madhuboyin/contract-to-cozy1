import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { getOrCreateQuoteComparisonWorkspace } from '../services/quoteComparison.service';
import {
  assertProjectComplianceDecisionsApplicable,
  getProjectComplianceEnvelope,
} from '../services/projectCompliance/context';

export async function getOrCreateWorkspace(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    await assertProjectComplianceDecisionsApplicable(
      req.params.propertyId,
      req.user!.userId,
      'QUOTE_COMPARISON',
      { serviceCategory: req.body.serviceCategory ?? 'UNSPECIFIED' },
      ['quoteComparison', 'providerBooking'],
    );
    const result = await getOrCreateQuoteComparisonWorkspace(
      req.params.propertyId,
      req.user!.userId,
      req.body,
    );
    const propertyContext = await getProjectComplianceEnvelope(
      req.params.propertyId,
      req.user!.userId,
      'QUOTE_COMPARISON',
      { serviceCategory: req.body.serviceCategory },
    );
    res.status(result.reused ? 200 : 201).json({
      success: true,
      data: { ...result, propertyContext },
    });
  } catch (error) {
    next(error);
  }
}
