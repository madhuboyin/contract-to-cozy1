// apps/backend/src/neighborhoodIntelligence/neighborhoodIntelligence.controller.ts

import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { APIError } from '../middleware/error.middleware';
import { NeighborhoodIntelligenceService } from './neighborhoodIntelligenceService';
import { NeighborhoodRadarQueryService } from './neighborhoodRadarQueryService';
import { NeighborhoodSignalService } from './neighborhoodSignalService';
import { NeighborhoodEventType } from '@prisma/client';
import { EventListQuery } from './neighborhoodIntelligence.validators';

const intelligenceService = new NeighborhoodIntelligenceService();
const queryService = new NeighborhoodRadarQueryService();
const signalService = new NeighborhoodSignalService();

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
    const summary = await queryService.getSummary(propertyId);
    res.json({ success: true, data: { summary } });
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

    const result = await queryService.getEventList(propertyId, {
      sortBy: query.sortBy,
      filterType: query.filterType as NeighborhoodEventType | undefined,
      filterEffect: query.filterEffect as 'POSITIVE' | 'NEGATIVE' | 'MIXED' | undefined,
      limit: query.limit ? Number(query.limit) : 20,
      offset: query.offset ? Number(query.offset) : 0,
    });

    res.json({ success: true, data: result });
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
    const detail = await queryService.getEventDetail(propertyId, eventId);
    res.json({ success: true, data: { event: detail } });
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
    const trends = await queryService.getTrends(propertyId);
    res.json({ success: true, data: { trends } });
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
    const signals = await signalService.getSignalsForProperty(propertyId);
    res.json({ success: true, data: { signals } });
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
