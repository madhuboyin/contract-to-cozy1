import { Response } from 'express';
import { CustomRequest } from '../types';
import { ReplaceRepairOverrides, ReplaceRepairService } from '../services/replaceRepairAnalysis.service';
import { guidanceJourneyService } from '../services/guidanceEngine/guidanceJourney.service';
import { logger } from '../lib/logger';
import { APIError } from '../middleware/error.middleware';
import {
  assertFinancialContextApplicable,
  getFinancialContextEnvelope,
} from '../services/financialContext/context';

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
    const generatedContextVersion = result.exists
      ? result.analysis.generatedContextVersion ?? null
      : null;
    const propertyContext = await getFinancialContextEnvelope(
      propertyId,
      userId,
      'REPAIR_REPLACE',
      generatedContextVersion,
      { inventoryItemId: itemId },
    );
    return res.json({ success: true, data: { ...result, propertyContext } });
  } catch (error: any) {
    logger.error({ err: error }, 'Error fetching replace/repair analysis');
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
    const currentContext = await assertFinancialContextApplicable(
      propertyId,
      userId,
      'REPAIR_REPLACE',
      'repairReplace',
      { inventoryItemId: itemId },
    );
    const analysis = await service.runItemAnalysis(
      propertyId,
      itemId,
      userId,
      overrides,
      currentContext.contextVersion,
    );

    const guidanceProducedData = {
      proofType: 'repair_replace_analysis',
      proofId: analysis.id,
      verdict: analysis.verdict,
      confidence: analysis.confidence,
      impactLevel: analysis.impactLevel,
      summary: analysis.summary,
      ageYears: analysis.ageYears,
      remainingYears: analysis.remainingYears,
      breakEvenMonths: analysis.breakEvenMonths,
      estimatedNextRepairCostCents: analysis.estimatedNextRepairCostCents,
      estimatedReplacementCostCents: analysis.estimatedReplacementCostCents,
      expectedAnnualRepairRiskCents: analysis.expectedAnnualRepairRiskCents,
      decisionTrace: analysis.decisionTrace ?? [],
      nextSteps: analysis.nextSteps ?? [],
    };
    const guidanceMetadata = {
      actualScopeCategory: 'ITEM',
      actualScopeId: itemId,
      resultContextLabel: 'Item-specific repair vs replace analysis',
    };

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
        producedData: guidanceProducedData,
        metadata: guidanceMetadata,
      });

      if (guidanceJourneyId && guidanceStepKey !== 'estimate_cost_impact') {
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
            stepKey: 'estimate_cost_impact',
            status: 'COMPLETED',
            producedData: guidanceProducedData,
            metadata: {
              ...guidanceMetadata,
              legacyStepBackfill: true,
            },
          });
        } catch (legacyStepError) {
          if (
            legacyStepError instanceof APIError &&
            legacyStepError.code === 'GUIDANCE_STEP_NOT_FOUND'
          ) {
            // Current journeys no longer have this step; ignore.
          } else {
            throw legacyStepError;
          }
        }
      }
    } catch (guidanceError) {
      logger.warn({ guidanceError }, '[GUIDANCE] replace/repair analysis hook failed');
    }

    const propertyContext = await getFinancialContextEnvelope(
      propertyId,
      userId,
      'REPAIR_REPLACE',
      currentContext.contextVersion,
      { inventoryItemId: itemId },
    );
    return res.json({ success: true, data: { analysis, propertyContext } });
  } catch (error: any) {
    logger.error({ err: error }, 'Error running replace/repair analysis');
    const statusCode = error instanceof APIError ? error.statusCode : 500;
    return res.status(statusCode).json({
      success: false,
      code: error instanceof APIError ? error.code : undefined,
      message: error?.message || 'Failed to run replace/repair analysis.',
    });
  }
}
