import { Response } from 'express';
import { CustomRequest } from '../types';
import {
  CoverageAnalysisOverrides,
  ItemCoverageAnalysisOverrides,
  CoverageIntelligenceService,
  CoverageSimulationInput,
} from '../services/coverageAnalysis.service';
import { guidanceJourneyService } from '../services/guidanceEngine/guidanceJourney.service';
import { logger } from '../lib/logger';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { InventoryService } from '../services/inventory.service';
import { evaluateFeatureContext } from '../modules/propertyContext/application/evaluateFeatureContext';
import { APIError } from '../middleware/error.middleware';
import { findCurrentCoverageReview, getOrCreateCoverageReview } from '../services/coverageReview.service';
import { getInsurancePolicyHistory } from '../services/insurancePolicyHistory.service';
import {
  addCoverageComparisonOption,
  getOrCreateCoverageComparison,
  findCoverageComparison,
  recordCoverageDecision,
} from '../services/coverageComparison.service';
import { recordCapabilityCompletionAndResolveNext } from '../services/capabilityCompletion.service';
import { resolveCoverageHomeActionFromDecision } from '../services/coverageLifecycle.service';

const service = new CoverageIntelligenceService();
const inventoryService = new InventoryService();

/** GET: strictly read-only for every role. Starting a comparison is the explicit POST below. */
export async function getCoverageComparisonWorkspace(req: CustomRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const result = await findCoverageComparison(req.params.propertyId, userId, {
      sourceActionId:
        typeof req.query.sourceActionId === 'string' ? req.query.sourceActionId : null,
    });
    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ err: error }, 'Error fetching coverage comparison');
    const statusCode = error instanceof APIError ? error.statusCode : 500;
    return res.status(statusCode).json({
      success: false,
      code: error instanceof APIError ? error.code : undefined,
      message: error?.message || 'Failed to fetch coverage comparison.',
    });
  }
}

/** POST: the explicit mutation that creates (or links) the comparison workspace. CONTRIBUTOR floor on the route. */
export async function startCoverageComparison(req: CustomRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const result = await getOrCreateCoverageComparison(req.params.propertyId, userId, {
      guidanceJourneyId:
        typeof req.body?.guidanceJourneyId === 'string' ? req.body?.guidanceJourneyId : null,
      guidanceStepKey:
        typeof req.body?.guidanceStepKey === 'string' ? req.body?.guidanceStepKey : null,
      sourceActionId:
        typeof req.body?.sourceActionId === 'string' ? req.body?.sourceActionId : null,
    });
    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ err: error }, 'Error starting coverage comparison');
    const statusCode = error instanceof APIError ? error.statusCode : 500;
    return res.status(statusCode).json({
      success: false,
      code: error instanceof APIError ? error.code : undefined,
      message: error?.message || 'Failed to start coverage comparison.',
    });
  }
}

export async function addCoverageOption(req: CustomRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const option = await addCoverageComparisonOption(
      req.params.propertyId,
      req.params.comparisonId,
      userId,
      req.body
    );
    return res.status(201).json({ success: true, data: { option } });
  } catch (error: any) {
    logger.error({ err: error }, 'Error adding coverage comparison option');
    const statusCode = error instanceof APIError ? error.statusCode : 500;
    return res.status(statusCode).json({
      success: false,
      code: error instanceof APIError ? error.code : undefined,
      message: error?.message || 'Failed to add coverage comparison option.',
    });
  }
}

export async function recordCoverageComparisonDecision(req: CustomRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const result = await recordCoverageDecision(
      req.params.propertyId,
      req.params.comparisonId,
      userId,
      req.body
    );
    if (result.idempotentReplay) {
      return res.status(200).json({ success: true, data: result });
    }

    try {
      await resolveCoverageHomeActionFromDecision({
        propertyId: req.params.propertyId,
        userId,
        sourceActionId: result.decision.sourceActionId,
        decisionId: result.decision.id,
      });
    } catch (resolutionError) {
      logger.warn({ resolutionError }, '[COVERAGE] Home Action resolution hook failed');
    }

    if (req.body.guidanceJourneyId) {
      try {
        await guidanceJourneyService.recordToolCompletion({
          propertyId: req.params.propertyId,
          actorUserId: userId,
          journeyId: req.body.guidanceJourneyId,
          signalIntentFamily: 'coverage_decision',
          issueDomain: 'INSURANCE',
          sourceToolKey: 'coverage-intelligence',
          sourceEntityType: 'COVERAGE_DECISION',
          sourceEntityId: result.decision.id,
          stepKey: req.body.guidanceStepKey || 'compare_options',
          status: 'COMPLETED',
          producedData: {
            proofType: 'coverage_decision',
            proofId: result.decision.id,
            comparisonId: req.params.comparisonId,
            decision: result.decision.decision,
            homeEventId: result.homeEvent.id,
          },
        });
      } catch (guidanceError) {
        logger.warn({ guidanceError }, '[GUIDANCE] coverage decision hook failed');
      }
    }

    try {
      await recordCapabilityCompletionAndResolveNext({
        propertyId: req.params.propertyId,
        userId,
        capabilityId: 'coverage-intelligence',
        completionKind: 'DECISION_RECORDED',
        outputEntityType: 'COVERAGE_DECISION',
        outputEntityId: result.decision.id,
        sourceActionId: req.body.sourceActionId ?? null,
        journeyId: req.body.guidanceJourneyId ?? null,
        surface: 'coverage-comparison',
      });
    } catch (completionError) {
      logger.warn({ completionError }, '[CAPABILITY] coverage decision lifecycle hook failed');
    }

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.COVERAGE_ANALYSIS,
      metadataJson: {
        actionType: 'coverage_decision_recorded',
        comparisonId: req.params.comparisonId,
        decision: result.decision.decision,
        sourceActionId: req.body.sourceActionId ?? null,
      },
    });
    return res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ err: error }, 'Error recording coverage decision');
    const statusCode = error instanceof APIError ? error.statusCode : 500;
    return res.status(statusCode).json({
      success: false,
      code: error instanceof APIError ? error.code : undefined,
      message: error?.message || 'Failed to record coverage decision.',
    });
  }
}

export async function getInsuranceHistory(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const history = await getInsurancePolicyHistory(propertyId, userId);
    return res.json({ success: true, data: { history } });
  } catch (error: any) {
    logger.error({ err: error }, 'Error fetching insurance policy history');
    const statusCode = error instanceof APIError ? error.statusCode : 500;
    return res.status(statusCode).json({
      success: false,
      code: error instanceof APIError ? error.code : undefined,
      message: error?.message || 'Failed to fetch insurance policy history.',
    });
  }
}

/** GET: strictly read-only for every role (never generates, expires or marks a review). Generation is the explicit POST below. */
export async function getCoverageReview(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const { review, isCurrent } = await findCurrentCoverageReview(propertyId, userId);
    return res.json({ success: true, data: { review, isCurrent } });
  } catch (error: any) {
    logger.error({ err: error }, 'Error fetching coverage review');
    const statusCode = error instanceof APIError ? error.statusCode : 500;
    return res.status(statusCode).json({
      success: false,
      code: error instanceof APIError ? error.code : undefined,
      message: error?.message || 'Failed to fetch coverage review.',
    });
  }
}

/** POST: the explicit mutation that generates (or reuses) the review for the present facts. CONTRIBUTOR floor on the route. */
export async function generateCoverageReview(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const review = await getOrCreateCoverageReview(propertyId, userId, {
      triggerType:
        typeof req.body?.triggerType === 'string' ? req.body?.triggerType : 'WORKSPACE_OPEN',
      triggerEntityType:
        typeof req.body?.triggerEntityType === 'string' ? req.body?.triggerEntityType : undefined,
      triggerEntityId:
        typeof req.body?.triggerEntityId === 'string' ? req.body?.triggerEntityId : undefined,
    });
    return res.status(201).json({ success: true, data: { review, isCurrent: true } });
  } catch (error: any) {
    logger.error({ err: error }, 'Error fetching coverage review');
    const statusCode = error instanceof APIError ? error.statusCode : 500;
    return res.status(statusCode).json({
      success: false,
      code: error instanceof APIError ? error.code : undefined,
      message: error?.message || 'Failed to fetch coverage review.',
    });
  }
}

export async function getCoverageAnalysis(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const result = await service.getLatest(propertyId, userId);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId,
      propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.COVERAGE_ANALYSIS,
      metadataJson: {
        exists: result.exists,
        insuranceReviewState: result.exists ? result.analysis.insuranceReviewState : null,
      },
    });

    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error({ err: error }, 'Error fetching coverage analysis');
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch coverage analysis.',
    });
  }
}

export async function runCoverageAnalysis(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const assumptionSetId =
      typeof req.body?.assumptionSetId === 'string' ? req.body.assumptionSetId : undefined;

    const overrides = (req.body?.overrides ?? {}) as CoverageAnalysisOverrides;
    const analysis = await service.run(propertyId, userId, overrides, { assumptionSetId });

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId,
      propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.COVERAGE_ANALYSIS,
      metadataJson: {
        actionType: 'run_analysis',
        insuranceReviewState: analysis.insuranceReviewState,
        confidence: analysis.confidence,
      },
    });

    return res.json({ success: true, data: { analysis } });
  } catch (error: any) {
    logger.error({ err: error }, 'Error running coverage analysis');
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to run coverage analysis.',
    });
  }
}

export async function simulateCoverageAnalysis(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const payload = (req.body ?? {}) as CoverageSimulationInput;
    const analysis = await service.simulate(propertyId, userId, payload);
    return res.json({ success: true, data: { analysis } });
  } catch (error: any) {
    logger.error({ err: error }, 'Error simulating coverage analysis');
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to simulate coverage analysis.',
    });
  }
}

export async function getItemCoverageAnalysis(req: CustomRequest, res: Response) {
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
    logger.error({ err: error }, 'Error fetching item coverage analysis');
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch item coverage analysis.',
    });
  }
}

export async function runItemCoverageAnalysis(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const itemId = req.params.itemId;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const overrides = (req.body?.overrides ?? {}) as ItemCoverageAnalysisOverrides;
    const item = await inventoryService.getItem(propertyId, itemId);
    const featureContext = await evaluateFeatureContext(propertyId, userId, {
      featureKey: 'COVERAGE_INTELLIGENCE',
      operationKey: 'ASSESS_ITEM_COVERAGE',
      operationInput: {
        inventoryItemId: itemId,
        responsibilityScope: item.responsibilityScope ?? undefined,
        hasDisclosedEstimate: item.replacementValueSource === 'ESTIMATED',
      },
    });
    if (!featureContext.canExecute || !['MISSING', 'CONFIRMED'].includes(item.coverageState)) {
      throw new APIError(
        item.coverageState === 'MANAGED_ELSEWHERE'
          ? 'This system is managed by another responsible party.'
          : 'Complete the item coverage information before running an analysis.',
        409,
        'PROPERTY_CONTEXT_REQUIRED',
        featureContext,
      );
    }
    const analysis = await service.runItemAnalysis(propertyId, itemId, userId, overrides);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId,
      propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.COVERAGE_ANALYSIS,
      metadataJson: { actionType: 'run_item_analysis', itemId, scenarioComparisonReady: true },
    });

    return res.json({ success: true, data: { analysis } });
  } catch (error: any) {
    logger.error({ err: error }, 'Error running item coverage analysis');
    const statusCode = error instanceof APIError ? error.statusCode : 500;
    return res.status(statusCode).json({
      success: false,
      code: error instanceof APIError ? error.code : undefined,
      message: error?.message || 'Failed to run item coverage analysis.',
    });
  }
}
