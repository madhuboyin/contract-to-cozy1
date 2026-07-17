import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { guidanceJourneyService } from '../services/guidanceEngine/guidanceJourney.service';
import { guidanceStepResolverService } from '../services/guidanceEngine/guidanceStepResolver.service';
import { guidanceBookingGuardService } from '../services/guidanceEngine/guidanceBookingGuard.service';
import {
  SUGGESTED_ISSUE_TYPES_ITEM,
  SUGGESTED_ISSUE_TYPES_SERVICE,
  getSymptomTypesForCategory,
} from '../services/guidanceEngine/guidanceTemplateRegistry';
import {
  mapGuidanceJourney,
  mapGuidanceSignal,
  mapGuidanceStep,
  mapGuidanceEvent,
  mapGuidanceEvidence,
} from '../services/guidanceEngine/guidanceMapper';
import { APIError } from '../middleware/error.middleware';
import { modelShortlistAdvisorService } from '../services/guidanceEngine/modelShortlistAdvisor.service';
import { vendorSuggestionsAdvisorService } from '../services/guidanceEngine/vendorSuggestionsAdvisor.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { getProtectionContextDecisions } from '../services/protection/context';

const GUIDANCE_TARGET_ACTIONS = new Set([
  'BOOKING',
  'CLAIM_ESCALATION',
  'INSPECTION_SCHEDULING',
  'PROVIDER_HANDOFF',
  'EXECUTION',
]);

function requireUserId(req: CustomRequest): string {
  const userId = req.user?.userId;
  if (!userId) {
    throw new APIError('Authentication required.', 401, 'AUTH_REQUIRED');
  }
  return userId;
}

export async function getPropertyGuidance(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;
    const userSelectedScopeId = req.query.userSelectedScopeId
      ? String(req.query.userSelectedScopeId)
      : undefined;

    const [payload, protectionContext] = await Promise.all([
      guidanceJourneyService.getPropertyGuidance(propertyId, { userSelectedScopeId }),
      getProtectionContextDecisions(propertyId, userId),
    ]);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId,
      propertyId,
      moduleKey: AnalyticsModule.GUIDANCE,
      featureKey: AnalyticsFeature.GUIDANCE_ADVISOR,
      metadataJson: { journeyCount: payload.journeys.length },
    });

    const reconciledSuppressedIds = new Set(protectionContext.reconciliation.suppressedGuidanceSignalIds);
    const signals = payload.signals.filter((signal: any) => !reconciledSuppressedIds.has(signal.id));
    const journeys = payload.journeys.filter((journey: any) => !reconciledSuppressedIds.has(journey.primarySignalId));
    const next = payload.next.filter((item: any) => !reconciledSuppressedIds.has(item.signalId));
    const contextSuppressions = [...reconciledSuppressedIds].map((signalId) => ({
      signalId,
      reasonCode: protectionContext.reconciliation.suppressionReasons[signalId],
      source: 'PROPERTY_CONTEXT_RECONCILIATION',
    }));

    res.json({
      success: true,
      data: {
        propertyId,
        counts: {
          ...payload.counts,
          surfacedSignals: signals.length,
          surfacedJourneys: journeys.length,
          suppressedSignals: (payload.suppressedSignals?.length ?? 0) + contextSuppressions.length,
        },
        signals: signals.map(mapGuidanceSignal),
        journeys: journeys.map(mapGuidanceJourney),
        next,
        suppressedSignals: [...(payload.suppressedSignals ?? []), ...contextSuppressions],
        protectionContext,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listActiveGuidanceJourneys(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    requireUserId(req);
    const propertyId = req.params.propertyId;

    const payload = await guidanceJourneyService.getPropertyGuidance(propertyId);
    res.json({
      success: true,
      data: {
        journeys: payload.journeys.map(mapGuidanceJourney),
        suppressedSignals: payload.suppressedSignals ?? [],
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getGuidanceJourneyDetail(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;
    const journeyId = req.params.journeyId;

    const journey = await guidanceJourneyService.getJourneyById(propertyId, journeyId, userId);
    const next = await guidanceJourneyService.resolveNextStepWithIntelligence({
      propertyId,
      journeyId,
      userId,
    });

    res.json({
      success: true,
      data: {
        journey: mapGuidanceJourney(journey),
        next: next ?? null,
        events: (journey.events ?? []).map(mapGuidanceEvent),
        evidences: (journey.evidences ?? []).map(mapGuidanceEvidence),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function resolveGuidanceSignal(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;

    const result = await guidanceJourneyService.ingestSignal({
      propertyId,
      ...(req.body ?? {}),
      actorUserId: userId,
    });

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId,
      propertyId,
      moduleKey: AnalyticsModule.GUIDANCE,
      featureKey: AnalyticsFeature.GUIDANCE_ADVISOR,
      metadataJson: { actionType: 'resolve_signal' },
    });

    res.status(201).json({
      success: true,
      data: {
        signal: mapGuidanceSignal(result.signal),
        journey: mapGuidanceJourney(result.journey),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function completeGuidanceStep(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;
    const stepId = req.params.stepId;

    const result = await guidanceStepResolverService.markStepStatus({
      propertyId,
      stepId,
      nextStatus: 'COMPLETED',
      producedData: req.body?.producedData ?? null,
      actorUserId: userId,
    });

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId,
      propertyId,
      moduleKey: AnalyticsModule.GUIDANCE,
      featureKey: AnalyticsFeature.GUIDANCE_ADVISOR,
      metadataJson: { actionType: 'complete_step' },
    });

    res.json({
      success: true,
      data: {
        step: mapGuidanceStep(result.step),
        journey: mapGuidanceJourney(result.journey),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function skipGuidanceStep(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;
    const stepId = req.params.stepId;

    const result = await guidanceStepResolverService.markStepStatus({
      propertyId,
      stepId,
      nextStatus: 'SKIPPED',
      reasonCode: req.body?.reasonCode ?? 'USER_SKIPPED',
      reasonMessage: req.body?.reasonMessage ?? null,
      producedData: req.body?.producedData ?? null,
      actorUserId: userId,
    });

    res.json({
      success: true,
      data: {
        step: mapGuidanceStep(result.step),
        journey: mapGuidanceJourney(result.journey),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function blockGuidanceStep(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;
    const stepId = req.params.stepId;

    const result = await guidanceStepResolverService.markStepStatus({
      propertyId,
      stepId,
      nextStatus: 'BLOCKED',
      reasonCode: req.body?.reasonCode ?? 'MISSING_PREREQUISITE',
      reasonMessage: req.body?.reasonMessage ?? null,
      missingContextKeys: req.body?.missingContextKeys ?? null,
      actorUserId: userId,
    });

    res.json({
      success: true,
      data: {
        step: mapGuidanceStep(result.step),
        journey: mapGuidanceJourney(result.journey),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getGuidanceNextStep(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;
    const journeyId = String(req.query.journeyId || '');

    if (!journeyId) throw new APIError('journeyId is required.', 400, 'GUIDANCE_JOURNEY_ID_REQUIRED');

    const result = await guidanceJourneyService.resolveNextStepWithIntelligence({
      propertyId,
      journeyId,
      userId,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getGuidanceExecutionGuard(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    requireUserId(req);
    const propertyId = req.params.propertyId;

    const targetAction = String(req.query.targetAction || 'BOOKING') as
      | 'BOOKING'
      | 'CLAIM_ESCALATION'
      | 'INSPECTION_SCHEDULING'
      | 'PROVIDER_HANDOFF'
      | 'EXECUTION';

    if (!GUIDANCE_TARGET_ACTIONS.has(targetAction)) {
      throw new APIError('Invalid targetAction supplied.', 400, 'GUIDANCE_INVALID_TARGET_ACTION');
    }

    const result = await guidanceBookingGuardService.evaluateExecutionGuard({
      propertyId,
      targetAction,
      journeyId: req.query.journeyId ? String(req.query.journeyId) : null,
      inventoryItemId: req.query.inventoryItemId ? String(req.query.inventoryItemId) : null,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function recordGuidanceToolCompletion(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;

    const result = await guidanceJourneyService.recordToolCompletion({
      propertyId,
      ...(req.body ?? {}),
      actorUserId: userId,
    });

    res.status(201).json({
      success: true,
      data: {
        signal: result.signal ? mapGuidanceSignal(result.signal) : null,
        journey: mapGuidanceJourney(result.journey),
        step: mapGuidanceStep(result.step),
        next: result.next,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function startGuidanceJourney(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;

    const journey = await guidanceJourneyService.createUserInitiatedJourney(
      propertyId,
      req.body,
      userId
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId,
      propertyId,
      moduleKey: AnalyticsModule.GUIDANCE,
      featureKey: AnalyticsFeature.GUIDANCE_ADVISOR,
      metadataJson: { actionType: 'start_journey' },
    });

    res.status(201).json({
      success: true,
      data: { journey: mapGuidanceJourney(journey) },
    });
  } catch (error) {
    next(error);
  }
}

export async function dismissGuidanceJourney(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;
    const journeyId = req.params.journeyId;

    const journey = await guidanceJourneyService.dismissJourney(
      propertyId,
      journeyId,
      userId,
      req.body?.reason ?? null
    );

    res.json({
      success: true,
      data: { journey: mapGuidanceJourney(journey) },
    });
  } catch (error) {
    next(error);
  }
}

export async function branchGuidanceRepairReplace(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;
    const journeyId = req.params.journeyId;

    const result = await guidanceJourneyService.branchFromRepairReplaceDecision({
      propertyId,
      journeyId,
      actorUserId: userId,
      stepKey: req.body.stepKey,
      analysisId: req.body.analysisId,
      verdict: req.body.verdict,
      choice: req.body.choice,
    });

    res.json({
      success: true,
      data: {
        sourceJourney: mapGuidanceJourney(result.sourceJourney),
        activeJourney: mapGuidanceJourney(result.activeJourney),
        next: result.next,
        branchCreated: result.branchCreated,
        branchType: result.branchType,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function changeGuidanceJourneyIssue(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const propertyId = req.params.propertyId;
    const journeyId = req.params.journeyId;

    if (!req.body?.issueType) {
      throw new APIError('issueType is required.', 400, 'GUIDANCE_ISSUE_TYPE_REQUIRED');
    }

    const journey = await guidanceJourneyService.changeIssueForJourney(
      propertyId,
      journeyId,
      userId,
      req.body.issueType
    );

    res.json({
      success: true,
      data: { journey: mapGuidanceJourney(journey) },
    });
  } catch (error) {
    next(error);
  }
}

export async function getGuidanceIssueTypes(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    requireUserId(req);
    const scopeCategory = String(req.query.scopeCategory || 'ITEM');
    const issueTypes =
      scopeCategory === 'SERVICE' ? SUGGESTED_ISSUE_TYPES_SERVICE : SUGGESTED_ISSUE_TYPES_ITEM;

    res.json({
      success: true,
      data: { scopeCategory, issueTypes },
    });
  } catch (error) {
    next(error);
  }
}

export async function getGuidanceServiceCategories(_req: CustomRequest, res: Response, next: NextFunction) {
  try {
    res.json({
      success: true,
      data: {
        serviceCategories: [
          { key: 'warranty_purchase', label: 'Home warranty' },
          { key: 'insurance_purchase', label: 'Home insurance' },
          { key: 'general_inspection', label: 'Home inspection' },
          { key: 'cleaning_service', label: 'Cleaning service' },
        ],
      },
    });
  } catch (error) {
    next(error);
  }
}

// FRD-FR-04: Returns asset-category-specific symptom types for the verify_history step.
// ?category=HVAC returns HVAC-specific symptoms; omitting category returns the DEFAULT list.
export async function getGuidanceSymptomTypes(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    requireUserId(req);
    const category = req.query.category ? String(req.query.category) : undefined;
    const symptomTypes = getSymptomTypesForCategory(category);

    res.json({
      success: true,
      data: { category: category ?? 'DEFAULT', symptomTypes },
    });
  } catch (error) {
    next(error);
  }
}

export async function generateGuidanceModelShortlist(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    requireUserId(req);
    const propertyId = req.params.propertyId;
    const { assetName, budgetMin, budgetMax, rebateAmount, primaryPriority, homeOwnershipYears, mustHaves, journeyContext } = req.body as {
      assetName: string;
      budgetMin?: number;
      budgetMax?: number;
      rebateAmount?: number;
      primaryPriority?: string;
      homeOwnershipYears?: string;
      mustHaves?: string[];
      journeyContext?: string;
    };

    const result = await modelShortlistAdvisorService.generateShortlist({
      propertyId,
      assetName,
      budgetMin,
      budgetMax,
      rebateAmount,
      primaryPriority,
      homeOwnershipYears,
      mustHaves,
      journeyContext,
    });

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.GUIDANCE,
      featureKey: AnalyticsFeature.GUIDANCE_ADVISOR,
      metadataJson: { actionType: 'generate_model_shortlist' },
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function generateGuidanceVendorSuggestions(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    requireUserId(req);
    const propertyId = req.params.propertyId;
    const { assetName, modelName, budgetMax } = req.body as {
      assetName: string;
      modelName: string;
      budgetMax?: number;
    };

    const result = await vendorSuggestionsAdvisorService.generateSuggestions({
      propertyId,
      assetName,
      modelName,
      budgetMax,
    });

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.GUIDANCE,
      featureKey: AnalyticsFeature.GUIDANCE_ADVISOR,
      metadataJson: { actionType: 'generate_vendor_suggestions' },
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

// FRD-FR-03: Returns the 2-year lookback context for a specific inventory item.
// Used by the verify_history step to decide whether to show the lookback form
// and to populate the asset history sidebar in GuidanceDrawer.
export async function getAssetResolutionContext(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    requireUserId(req);
    const propertyId = req.params.propertyId;
    const inventoryItemId = String(req.query.inventoryItemId || '');

    if (!inventoryItemId) {
      throw new APIError('inventoryItemId is required.', 400, 'GUIDANCE_INVENTORY_ITEM_ID_REQUIRED');
    }

    const context = await guidanceJourneyService.getAssetResolutionContext(
      propertyId,
      inventoryItemId
    );

    res.json({
      success: true,
      data: context,
    });
  } catch (error) {
    next(error);
  }
}
