import { prisma } from '../lib/prisma';
import { currentCoverageTerms, reviewCoverageTermsWithEffects } from '../services/coverageTermReviewOperations';
import { Response } from 'express';
import { CustomRequest } from '../types';
import {
  CoverageAnalysisOverrides,
  ItemCoverageAnalysisOverrides,
  CoverageIntelligenceService,
  CoverageSimulationInput,
} from '../services/coverageAnalysis.service';
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
} from '../services/coverageComparison.service';
import { recordCoverageDecisionWithEffects } from '../services/coverageDecisionOperations';
import { runCoverageAnalysisWithEffects } from '../services/coverageAnalysisOperations';

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
    const result = await recordCoverageDecisionWithEffects(req.params.propertyId, req.params.comparisonId, userId, req.body);
    if (result.idempotentReplay) {
      return res.status(200).json({ success: true, data: result });
    }
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

    // The run, its analytics and the journey proof are the shared service's, so Ask runs the same analysis the same way.
    const { analysis } = await runCoverageAnalysisWithEffects(propertyId, userId, { kind: 'PROPERTY' }, {
      overrides: (req.body?.overrides ?? {}) as CoverageAnalysisOverrides, assumptionSetId, guidanceStepId: typeof req.body?.guidanceStepId === 'string' ? req.body.guidanceStepId : null,
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

    // The item gates, the run, its analytics and the journey proof are the shared service's.
    const { analysis } = await runCoverageAnalysisWithEffects(propertyId, userId, { kind: 'ITEM', itemId }, {
      overrides: (req.body?.overrides ?? {}) as ItemCoverageAnalysisOverrides, guidanceStepId: typeof req.body?.guidanceStepId === 'string' ? req.body.guidanceStepId : null,
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

/** The homeowner's explicit review of the current policy or warranty terms (the same operation Ask uses). */
export async function reviewCoverageTerms(req: CustomRequest, res: Response, next: (error?: unknown) => void) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required.' });
    // The page knows its journey and step key, not the step id: resolve it here, inside this home, so the shared service re-reads and binds it exactly as it does for Ask.
    let guidanceStepId: string | null = req.body.guidanceStepId ?? null;
    if (!guidanceStepId && req.body.guidanceJourneyId && req.body.guidanceStepKey) {
      const step = await prisma.guidanceJourneyStep.findFirst({ where: { journeyId: req.body.guidanceJourneyId, stepKey: req.body.guidanceStepKey, journey: { propertyId: req.params.propertyId } }, select: { id: true } });
      guidanceStepId = step?.id ?? null;
    }
    const result = await reviewCoverageTermsWithEffects(req.params.propertyId, userId, req.body.kind, {
      guidanceStepId, inventoryItemId: req.body.inventoryItemId ?? null, expectedFingerprint: req.body.expectedFingerprint ?? null,
    });
    return res.status(200).json({ success: true, data: { review: result.review, reused: result.reused, guidanceReported: result.guidanceReported } });
  } catch (error) {
    return next(error);
  }
}

/** The current policy or warranty terms in scope, the fingerprint a review is recorded against, and the latest review of exactly those terms. */
export async function getCoverageTermReviewState(req: CustomRequest, res: Response, next: (error?: unknown) => void) {
  try {
    const kind = req.query.kind === 'WARRANTY' ? 'WARRANTY' : 'POLICY';
    const inventoryItemId = typeof req.query.inventoryItemId === 'string' ? req.query.inventoryItemId : null;
    const terms = await currentCoverageTerms(req.params.propertyId, kind, inventoryItemId);
    const latest = terms.count === 0 ? null : await prisma.coverageTermReview.findFirst({
      where: { propertyId: req.params.propertyId, termKind: kind, inventoryItemId, termFingerprint: terms.fingerprint }, orderBy: { reviewedAt: 'desc' }, select: { reviewedAt: true },
    });
    return res.status(200).json({ success: true, data: { kind, count: terms.count, fingerprint: terms.fingerprint, labels: terms.labels, latestReviewedAt: latest?.reviewedAt ?? null } });
  } catch (error) {
    return next(error);
  }
}
