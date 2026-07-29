import { Response } from 'express';
import { CustomRequest } from '../types';
import {
  AccountUpsertPayload,
  OpportunityStatusInput,
  RunComparisonInput,
} from '../services/homeSavings/types';
import { HomeSavingsService } from '../services/homeSavings.service';
import { guidanceJourneyService } from '../services/guidanceEngine/guidanceJourney.service';
import { logger } from '../lib/logger';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { getFinancialContextEnvelope } from '../services/financialContext/context';
import {
  getHomeSavingsOpportunityOutcomes,
} from '../services/savingsOutcome.service';

const service = new HomeSavingsService();

function requireUserId(req: CustomRequest): string {
  const userId = req.user?.userId;
  if (!userId) {
    throw new Error('Authentication required.');
  }
  return userId;
}

export async function revokeHomeSavingsOpportunityOutcomeController(req: CustomRequest, res: Response) {
  return res.status(410).json({
    success: false,
    code: 'CANONICAL_ACTION_REQUIRED',
    message:
      'Outcome revocation requires its canonical Savings & Benefits action. Use the canonical action outcome-revocation endpoint.',
  });
}

export async function listHomeSavingsCategories(req: CustomRequest, res: Response) {
  try {
    requireUserId(req);
    const result = await service.listCategories();
    return res.json({ success: true, data: result });
  } catch (error: any) {
    const status = error?.message === 'Authentication required.' ? 401 : 500;
    logger.error({ err: error }, 'Error listing home savings categories');
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to list home savings categories.',
    });
  }
}

export async function getHomeSavingsSummary(req: CustomRequest, res: Response) {
  try {
    const userId = requireUserId(req);
    const result = await service.getSummary(req.params.propertyId, userId);
    const propertyContext = await getFinancialContextEnvelope(
      req.params.propertyId,
      userId,
      'HOME_SAVINGS',
      result.propertyContextVersion,
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.HOME_SAVINGS,
      metadataJson: {
        potentialMonthlySavings: result.potentialMonthlySavings,
        potentialAnnualSavings: result.potentialAnnualSavings,
      },
    });

    return res.json({ success: true, data: { ...result, propertyContext } });
  } catch (error: any) {
    const status = error?.message === 'Authentication required.' ? 401 : 500;
    logger.error({ err: error }, 'Error fetching home savings summary');
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to fetch home savings summary.',
    });
  }
}

export async function getHomeSavingsCategoryDetail(req: CustomRequest, res: Response) {
  try {
    const userId = requireUserId(req);
    const result = await service.getCategoryDetail(
      req.params.propertyId,
      req.params.categoryKey,
      userId
    );
    const summary = await service.getSummary(req.params.propertyId, userId);
    const propertyContext = await getFinancialContextEnvelope(
      req.params.propertyId,
      userId,
      'HOME_SAVINGS',
      summary.propertyContextVersion,
    );
    return res.json({ success: true, data: { ...result, propertyContext } });
  } catch (error: any) {
    const status = error?.message === 'Authentication required.' ? 401 : 500;
    logger.error({ err: error }, 'Error fetching home savings category detail');
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to fetch home savings category detail.',
    });
  }
}

export async function upsertHomeSavingsAccount(req: CustomRequest, res: Response) {
  try {
    const userId = requireUserId(req);
    const payload = (req.body ?? {}) as AccountUpsertPayload;
    const result = await service.upsertAccount(
      req.params.propertyId,
      req.params.categoryKey,
      userId,
      payload
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.HOME_SAVINGS,
      metadataJson: { actionType: 'upsert_account', categoryKey: req.params.categoryKey },
    });

    return res.json({ success: true, data: result });
  } catch (error: any) {
    const status = error?.message === 'Authentication required.' ? 401 : 500;
    logger.error({ err: error }, 'Error upserting home savings account');
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to save home savings account.',
    });
  }
}

export async function runHomeSavingsComparison(req: CustomRequest, res: Response) {
  try {
    const userId = requireUserId(req);
    const payload = (req.body ?? {}) as RunComparisonInput & {
      guidanceJourneyId?: string;
      guidanceStepKey?: string;
      guidanceSignalIntentFamily?: string;
    };

    const {
      guidanceJourneyId,
      guidanceStepKey,
      guidanceSignalIntentFamily,
      ...comparisonInput
    } = payload;

    const result = await service.runComparison(req.params.propertyId, userId, comparisonInput);
    const propertyContext = await getFinancialContextEnvelope(
      req.params.propertyId,
      userId,
      'HOME_SAVINGS',
      result.summary.propertyContextVersion,
    );

    try {
      const categoriesWithSavings = result.summary.categories.filter(
        (entry) => entry.status === 'FOUND_SAVINGS',
      ).length;
      const categoriesReviewed = result.summary.categories.filter(
        (entry) => entry.account !== null,
      ).length;
      const decisionStatuses = new Set(['SAVED', 'DISMISSED', 'APPLIED', 'SWITCHED']);
      const decidedOpportunity = result.summary.categories
        .map((entry) => entry.topOpportunity)
        .find((opportunity) => opportunity && decisionStatuses.has(opportunity.status));
      // Generated output, a connected account, or a benchmark flag is not
      // completion. Only a durable homeowner decision/action may complete
      // the Guidance step.
      const hasRecordedDecision = Boolean(decidedOpportunity);

      await guidanceJourneyService.recordToolCompletion({
        propertyId: req.params.propertyId,
        actorUserId: userId,
        journeyId: guidanceJourneyId ?? null,
        signalIntentFamily:
          guidanceSignalIntentFamily?.trim().toLowerCase() || 'financial_exposure',
        issueDomain: 'FINANCIAL',
        sourceToolKey: 'home-savings',
        sourceEntityType: 'HOME_SAVINGS_RUN',
        sourceEntityId: result.runId,
        stepKey: guidanceStepKey ?? 'evaluate_savings_funding',
        status: hasRecordedDecision ? 'COMPLETED' : 'IN_PROGRESS',
        reasonCode: hasRecordedDecision ? null : 'decision_required',
        reasonMessage: hasRecordedDecision
          ? null
          : 'Review an opportunity and save, dismiss, apply, or record another durable decision to complete this step.',
        producedData: {
          proofType: 'savings_analysis',
          proofId: result.runId,
          runId: result.runId,
          potentialMonthlySavings: result.summary.potentialMonthlySavings,
          potentialAnnualSavings: result.summary.potentialAnnualSavings,
          categoriesWithSavings,
          categoriesReviewed,
          decisionOpportunityId: decidedOpportunity?.id ?? null,
          decisionStatus: decidedOpportunity?.status ?? null,
        },
      });
    } catch (guidanceError) {
      logger.warn({ guidanceError }, '[GUIDANCE] home savings hook failed');
    }

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.HOME_SAVINGS,
      metadataJson: {
        actionType: 'run_comparison',
        potentialMonthlySavings: result.summary.potentialMonthlySavings,
        potentialAnnualSavings: result.summary.potentialAnnualSavings,
      },
    });

    return res.json({ success: true, data: { ...result, propertyContext } });
  } catch (error: any) {
    const status = error?.message === 'Authentication required.' ? 401 : 500;
    logger.error({ err: error }, 'Error running home savings comparison');
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to run home savings comparison.',
    });
  }
}

export async function setHomeSavingsOpportunityStatus(req: CustomRequest, res: Response) {
  try {
    const userId = requireUserId(req);
    const payload = (req.body ?? {}) as { status: OpportunityStatusInput };
    const result = await service.setOpportunityStatus(req.params.id, payload.status, userId);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    const status = error?.message === 'Authentication required.' ? 401 : 500;
    logger.error({ err: error }, 'Error updating home savings opportunity');
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to update home savings opportunity.',
    });
  }
}

export async function createHomeSavingsOpportunityOutcome(req: CustomRequest, res: Response) {
  return res.status(410).json({
    success: false,
    code: 'CANONICAL_ACTION_REQUIRED',
    message:
      'Outcome writes require a canonical Savings & Benefits action. Use /api/properties/:propertyId/savings-benefits/actions/:actionId/outcome.',
  });
}

export async function listHomeSavingsOpportunityOutcomes(req: CustomRequest, res: Response) {
  try {
    const userId = requireUserId(req);
    const outcomes = await getHomeSavingsOpportunityOutcomes(req.params.id, userId);
    return res.json({ success: true, data: outcomes });
  } catch (error: any) {
    const isNotFound = error?.message === 'Opportunity not found or access denied.';
    const isAuth = error?.message === 'Authentication required.';
    const status = isNotFound ? 404 : isAuth ? 401 : 500;
    logger.error({ err: error }, 'Error fetching home savings opportunity outcomes');
    return res.status(status).json({
      success: false,
      message: error?.message || 'Failed to fetch opportunity outcomes.',
    });
  }
}
