import { Response } from 'express';
import { CustomRequest } from '../types';
import { logger } from '../lib/logger';
import { savingsBenefitsUnifiedService } from '../services/savingsBenefitsUnified.service';
import {
  CreateCanonicalActionInput,
  createCanonicalAction,
  getCanonicalCoverage,
  getCanonicalOpportunityDetail,
  recordCanonicalActionOutcome,
  recordCanonicalFact,
  updateCanonicalAction,
} from '../services/savingsBenefitsCanonical.service';
import type {
  RecordHiddenAssetMatchOutcomeInput,
  RecordHomeSavingsOpportunityOutcomeInput,
} from '../services/savingsOutcome.service';

function requireUserId(req: CustomRequest): string {
  const userId = req.user?.userId;
  if (!userId) throw new Error('Authentication required.');
  return userId;
}

export async function getSavingsBenefitsOpportunityDetail(req: CustomRequest, res: Response) {
  try {
    const data = await getCanonicalOpportunityDetail(
      req.params.propertyId,
      req.params.opportunityId,
      requireUserId(req),
    );
    return res.json({ success: true, data });
  } catch (error: any) {
    const status = /not found|access denied/i.test(error?.message ?? '') ? 404 : 500;
    return res.status(status).json({ success: false, message: error?.message || 'Failed to fetch opportunity.' });
  }
}

export async function postSavingsBenefitsOpportunityFact(req: CustomRequest, res: Response) {
  try {
    const data = await recordCanonicalFact(
      req.params.propertyId,
      req.params.opportunityId,
      requireUserId(req),
      req.body,
    );
    return res.status(201).json({ success: true, data });
  } catch (error: any) {
    const status = /not found|access denied/i.test(error?.message ?? '') ? 404 : 422;
    return res.status(status).json({ success: false, message: error?.message || 'Failed to record fact.' });
  }
}

export async function postSavingsBenefitsOpportunityAction(req: CustomRequest, res: Response) {
  try {
    const body = req.body as Record<string, any>;
    const data = await createCanonicalAction(
      req.params.propertyId,
      req.params.opportunityId,
      requireUserId(req),
      ({
        ...body,
        followUpAt: body.followUpAt ? new Date(body.followUpAt) : null,
      }) as CreateCanonicalActionInput,
    );
    return res.status(201).json({ success: true, data });
  } catch (error: any) {
    const status = /not found|access denied/i.test(error?.message ?? '') ? 404 : 422;
    return res.status(status).json({ success: false, message: error?.message || 'Failed to record action.' });
  }
}

export async function patchSavingsBenefitsAction(req: CustomRequest, res: Response) {
  try {
    const body = req.body as Record<string, any>;
    const data = await updateCanonicalAction(
      req.params.propertyId,
      req.params.actionId,
      requireUserId(req),
      {
        ...body,
        followUpAt:
          body.followUpAt === undefined
            ? undefined
            : body.followUpAt
              ? new Date(body.followUpAt)
              : null,
      },
    );
    return res.json({ success: true, data });
  } catch (error: any) {
    const status = /not found|access denied/i.test(error?.message ?? '') ? 404 : 422;
    return res.status(status).json({ success: false, message: error?.message || 'Failed to update action.' });
  }
}

export async function postSavingsBenefitsActionOutcome(req: CustomRequest, res: Response) {
  try {
    const body = req.body as Record<string, any>;
    const data = await recordCanonicalActionOutcome(
      req.params.propertyId,
      req.params.actionId,
      requireUserId(req),
      ({
        ...body,
        observationStartedAt: body.observationStartedAt ? new Date(body.observationStartedAt) : null,
        observationEndedAt: body.observationEndedAt ? new Date(body.observationEndedAt) : null,
      }) as RecordHiddenAssetMatchOutcomeInput | RecordHomeSavingsOpportunityOutcomeInput,
    );
    return res.status(201).json({ success: true, data });
  } catch (error: any) {
    const status = /not found|access denied/i.test(error?.message ?? '') ? 404 : 422;
    return res.status(status).json({ success: false, message: error?.message || 'Failed to record outcome.' });
  }
}

export async function getSavingsBenefitsCoverage(req: CustomRequest, res: Response) {
  try {
    const data = await getCanonicalCoverage(req.params.propertyId, requireUserId(req));
    return res.json({ success: true, data });
  } catch (error: any) {
    const status = /not found|access denied/i.test(error?.message ?? '') ? 404 : 500;
    return res.status(status).json({ success: false, message: error?.message || 'Failed to fetch coverage.' });
  }
}

// ============================================================================
// GET /properties/:propertyId/savings-benefits
// ============================================================================

export async function getSavingsBenefitsUnifiedForProperty(req: CustomRequest, res: Response) {
  try {
    const userId = requireUserId(req);
    const { propertyId } = req.params;

    const result = await savingsBenefitsUnifiedService.getUnified(propertyId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    const status =
      error?.message === 'Authentication required.' ? 401 :
      error?.message === 'Property not found or access denied.' ? 404 :
      500;
    logger.error({ err: error }, '[SavingsBenefitsUnified] getSavingsBenefitsUnifiedForProperty error');
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to fetch unified savings and benefits view.',
    });
  }
}
