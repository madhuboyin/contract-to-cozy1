import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { guidanceJourneyService } from '../services/guidanceEngine/guidanceJourney.service';
import { guidanceStepResolverService } from '../services/guidanceEngine/guidanceStepResolver.service';
import { guidanceBookingGuardService } from '../services/guidanceEngine/guidanceBookingGuard.service';
import {
  SUGGESTED_ISSUE_TYPES_ITEM,
  SUGGESTED_ISSUE_TYPES_SERVICE,
} from '../services/guidanceEngine/guidanceTemplateRegistry';
import {
  mapGuidanceJourney,
  mapGuidanceSignal,
  mapGuidanceStep,
  mapGuidanceEvent,
  mapGuidanceEvidence,
} from '../services/guidanceEngine/guidanceMapper';
import { APIError } from '../middleware/error.middleware';

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
    requireUserId(req);
    const propertyId = req.params.propertyId;
    const userSelectedScopeId = req.query.userSelectedScopeId
      ? String(req.query.userSelectedScopeId)
      : undefined;

    const payload = await guidanceJourneyService.getPropertyGuidance(propertyId, {
      userSelectedScopeId,
    });

    res.json({
      success: true,
      data: {
        propertyId,
        counts: payload.counts,
        signals: payload.signals.map(mapGuidanceSignal),
        journeys: payload.journeys.map(mapGuidanceJourney),
        next: payload.next,
        suppressedSignals: payload.suppressedSignals ?? [],
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
    requireUserId(req);
    const propertyId = req.params.propertyId;
    const journeyId = req.params.journeyId;

    const journey = await guidanceJourneyService.getJourneyById(propertyId, journeyId);
    const next = await guidanceJourneyService.resolveNextStepWithIntelligence({
      propertyId,
      journeyId,
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
    requireUserId(req);
    const propertyId = req.params.propertyId;
    const journeyId = String(req.query.journeyId || '');

    if (!journeyId) throw new APIError('journeyId is required.', 400, 'GUIDANCE_JOURNEY_ID_REQUIRED');

    const result = await guidanceJourneyService.resolveNextStepWithIntelligence({
      propertyId,
      journeyId,
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
      homeAssetId: req.query.homeAssetId ? String(req.query.homeAssetId) : null,
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
