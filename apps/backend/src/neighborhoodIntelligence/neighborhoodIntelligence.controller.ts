// apps/backend/src/neighborhoodIntelligence/neighborhoodIntelligence.controller.ts

import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { APIError } from '../middleware/error.middleware';
import { NeighborhoodIntelligenceService } from './neighborhoodIntelligenceService';
import { NeighborhoodRadarQueryService } from './neighborhoodRadarQueryService';
import { NeighborhoodSignalService } from './neighborhoodSignalService';
import { NeighborhoodEventType } from '@prisma/client';
import { EventListQuery } from './neighborhoodIntelligence.validators';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { getPlanningContextEnvelope } from '../services/planningContext/context';
import { evaluateFeatureContext } from '../modules/propertyContext/application/evaluateFeatureContext';

const intelligenceService = new NeighborhoodIntelligenceService();
const queryService = new NeighborhoodRadarQueryService();
const signalService = new NeighborhoodSignalService();

function getRadarContext(req: CustomRequest, propertyId: string) {
  return getPlanningContextEnvelope(propertyId, req.user!.userId, 'NEIGHBORHOOD_RADAR');
}

async function requireInteractiveRadarContext(req: CustomRequest, propertyId: string): Promise<void> {
  const evaluation = await evaluateFeatureContext(propertyId, req.user!.userId, {
    featureKey: 'NEIGHBORHOOD_RADAR',
    operationKey: 'VIEW_RADAR',
  });
  if (!evaluation.canExecute) {
    throw new APIError(
      'Complete the required property location before viewing neighborhood matches.',
      409,
      'PROPERTY_CONTEXT_INCOMPLETE',
      { evaluation },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/properties/:propertyId/neighborhood-radar/summary
// ---------------------------------------------------------------------------

export async function getNeighborhoodRadarSummary(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { propertyId } = req.params;
    await requireInteractiveRadarContext(req, propertyId);
    const [summary, context] = await Promise.all([
      queryService.getSummary(propertyId),
      getRadarContext(req, propertyId),
    ]);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.COMMUNITY,
      featureKey: AnalyticsFeature.NEIGHBORHOOD_CHANGE_RADAR,
      metadataJson: {},
    });

    res.json({ success: true, data: { summary, context } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/properties/:propertyId/neighborhood-radar/events
// ---------------------------------------------------------------------------

export async function getNeighborhoodRadarEvents(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { propertyId } = req.params;
    const query = req.query as EventListQuery;
    await requireInteractiveRadarContext(req, propertyId);

    const [result, context] = await Promise.all([
      queryService.getEventList(propertyId, {
        sortBy: query.sortBy,
        filterType: query.filterType as NeighborhoodEventType | undefined,
        filterEffect: query.filterEffect as 'POSITIVE' | 'NEGATIVE' | 'MIXED' | undefined,
        limit: query.limit ? Number(query.limit) : 20,
        offset: query.offset ? Number(query.offset) : 0,
      }),
      getRadarContext(req, propertyId),
    ]);

    res.json({ success: true, data: { ...result, context } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/properties/:propertyId/neighborhood-radar/events/:eventId
// ---------------------------------------------------------------------------

export async function getNeighborhoodRadarEventDetail(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { propertyId, eventId } = req.params;
    await requireInteractiveRadarContext(req, propertyId);
    const [detail, context] = await Promise.all([
      queryService.getEventDetail(propertyId, eventId),
      getRadarContext(req, propertyId),
    ]);
    res.json({ success: true, data: { event: detail, context } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/properties/:propertyId/neighborhood-radar/trends
// ---------------------------------------------------------------------------

export async function getNeighborhoodRadarTrends(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { propertyId } = req.params;
    await requireInteractiveRadarContext(req, propertyId);
    const [trends, context] = await Promise.all([
      queryService.getTrends(propertyId),
      getRadarContext(req, propertyId),
    ]);
    res.json({ success: true, data: { trends, context } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/neighborhood-intelligence/ingest  (internal / admin)
// ---------------------------------------------------------------------------

export async function ingestNeighborhoodEvent(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await intelligenceService.ingestAndProcessEvent(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/neighborhood-intelligence/events/:eventId/recompute (internal / admin)
// ---------------------------------------------------------------------------

export async function recomputeEventMatches(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { eventId } = req.params;
    const result = await intelligenceService.recomputeEventMatches(eventId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /api/properties/:propertyId/neighborhood-radar/signals
// ---------------------------------------------------------------------------

export async function getNeighborhoodSignals(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { propertyId } = req.params;
    const [signals, context] = await Promise.all([
      signalService.getSignalsForProperty(propertyId),
      getRadarContext(req, propertyId),
    ]);
    res.json({ success: true, data: { signals, context } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/properties/:propertyId/neighborhood-radar/recompute (internal / admin)
// ---------------------------------------------------------------------------

export async function recomputePropertyRadar(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { propertyId } = req.params;

    // Ensure the request user has access to the property (already enforced by propertyAuthMiddleware)
    if (!req.property) {
      throw new APIError('Property not found.', 404, 'PROPERTY_NOT_FOUND');
    }

    const result = await intelligenceService.recomputePropertyNeighborhoodRadar(propertyId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
