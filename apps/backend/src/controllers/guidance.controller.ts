import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import { guidanceJourneyService } from '../services/guidanceEngine/guidanceJourney.service';
import { guidanceStepResolverService } from '../services/guidanceEngine/guidanceStepResolver.service';
import { guidanceBookingGuardService } from '../services/guidanceEngine/guidanceBookingGuard.service';
import { mapGuidanceJourney, mapGuidanceSignal, mapGuidanceStep, mapGuidanceEvent } from '../services/guidanceEngine/guidanceMapper';

function requireUserId(req: CustomRequest): string {
  const userId = req.user?.userId;
  if (!userId) {
    throw new Error('Authentication required.');
  }
  return userId;
}

export async function getPropertyGuidance(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    requireUserId(req);
    const propertyId = req.params.propertyId;

    const payload = await guidanceJourneyService.getPropertyGuidance(propertyId);

    res.json({
      success: true,
      data: {
        propertyId,
        counts: payload.counts,
        signals: payload.signals.map(mapGuidanceSignal),
        journeys: payload.journeys.map(mapGuidanceJourney),
        next: payload.next,
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

    const journeys = await guidanceJourneyService.listActiveJourneysForProperty(propertyId);
    res.json({
      success: true,
      data: {
        journeys: journeys.map(mapGuidanceJourney),
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

    res.json({
      success: true,
      data: {
        journey: mapGuidanceJourney(journey),
        events: (journey.events ?? []).map(mapGuidanceEvent),
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

    if (!journeyId) {
      return res.status(400).json({
        success: false,
        message: 'journeyId is required',
      });
    }

    const result = await guidanceStepResolverService.resolveNextStep({
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
