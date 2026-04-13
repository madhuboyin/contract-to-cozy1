import { Response } from 'express';
import { CustomRequest } from '../types';
import { ReplaceRepairOverrides, ReplaceRepairService } from '../services/replaceRepairAnalysis.service';
import { guidanceJourneyService } from '../services/guidanceEngine/guidanceJourney.service';
import { logger } from '../lib/logger';

const service = new ReplaceRepairService();

export async function getReplaceRepairAnalysis(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const itemId = req.params.itemId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const result = await service.getLatestForItem(propertyId, itemId, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Error fetching replace/repair analysis:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch replace/repair analysis.',
    });
  }
}

export async function runReplaceRepairAnalysis(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const itemId = req.params.itemId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const guidanceJourneyId =
      typeof req.body?.guidanceJourneyId === 'string' ? req.body.guidanceJourneyId : null;
    const guidanceStepKey =
      typeof req.body?.guidanceStepKey === 'string' ? req.body.guidanceStepKey : null;
    const guidanceSignalIntentFamily =
      typeof req.body?.guidanceSignalIntentFamily === 'string'
        ? req.body.guidanceSignalIntentFamily.trim().toLowerCase()
        : null;

    const overrides = (req.body?.overrides ?? {}) as ReplaceRepairOverrides;
    const analysis = await service.runItemAnalysis(propertyId, itemId, userId, overrides);

    try {
      await guidanceJourneyService.recordToolCompletion({
        propertyId,
        actorUserId: userId,
        journeyId: guidanceJourneyId,
        inventoryItemId: itemId,
        signalIntentFamily: guidanceSignalIntentFamily || 'lifecycle_end_or_past_life',
        issueDomain: 'ASSET_LIFECYCLE',
        sourceToolKey: 'replace-repair',
        sourceEntityType: 'REPLACE_REPAIR_ANALYSIS',
        sourceEntityId: analysis.id,
        stepKey: guidanceStepKey || 'repair_replace_decision',
        status: 'COMPLETED',
        producedData: {
          proofType: 'repair_replace_analysis',
          proofId: analysis.id,
          verdict: analysis.verdict,
          confidence: analysis.confidence,
          impactLevel: analysis.impactLevel,
          breakEvenMonths: analysis.breakEvenMonths,
          estimatedNextRepairCostCents: analysis.estimatedNextRepairCostCents,
          estimatedReplacementCostCents: analysis.estimatedReplacementCostCents,
          expectedAnnualRepairRiskCents: analysis.expectedAnnualRepairRiskCents,
          nextSteps: analysis.nextSteps ?? [],
        },
      });
    } catch (guidanceError) {
      logger.warn('[GUIDANCE] replace/repair analysis hook failed:', guidanceError);
    }

    return res.json({ success: true, data: { analysis } });
  } catch (error: any) {
    logger.error('Error running replace/repair analysis:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to run replace/repair analysis.',
    });
  }
}
