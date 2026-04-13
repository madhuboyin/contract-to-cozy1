// apps/backend/src/controllers/homeEventRadar.controller.ts

import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { HomeEventRadarService } from '../services/homeEventRadar.service';
import { APIError } from '../middleware/error.middleware';
import { logger } from '../lib/logger';

const service = new HomeEventRadarService();

function requireUser(req: CustomRequest): { userId: string } {
  const userId = req.user?.userId;
  if (!userId) throw new APIError('Authentication required', 401, 'AUTH_REQUIRED');
  return { userId };
}

// ---------------------------------------------------------------------------
// Internal / operations endpoints
// ---------------------------------------------------------------------------

/**
 * POST /radar/events
 * Upsert a canonical RadarEvent and immediately trigger property matching.
 */
export async function upsertRadarEvent(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    requireUser(req);

    const { event, isNew } = await service.upsertRadarEvent(req.body);
    const eventId = String((event as any).id);

    // Trigger matching asynchronously (do not await to keep response fast)
    // Errors in matching are non-fatal for the upsert response.
    service.triggerMatching(eventId, null).catch((err) => {
      logger.error('[HomeEventRadar] Background matching failed for event', eventId, err);
    });

    res.status(isNew ? 201 : 200).json({
      success: true,
      data: { event, isNew },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /radar/events/:eventId/match
 * (Re-)trigger property matching for a specific event.
 * Optionally pass { propertyIds: [...] } to restrict scope.
 */
export async function triggerEventMatching(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    requireUser(req);

    const { eventId } = req.params;
    const propertyIds: string[] | null = req.body?.propertyIds ?? null;

    const result = await service.triggerMatching(eventId, propertyIds);

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /radar/events/:eventId
 * Fetch a canonical radar event by ID.
 */
export async function getRadarEvent(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    requireUser(req);

    const event = await service.getRadarEvent(req.params.eventId);
    res.json({ success: true, data: { event } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Property-scoped endpoints
// ---------------------------------------------------------------------------

/**
 * GET /properties/:propertyId/radar/feed
 * Compact event feed for a property.
 */
export async function listRadarFeed(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const { propertyId } = req.params;

    const result = await service.listFeedForProperty(propertyId, userId, {
      severity: req.query.severity ? String(req.query.severity) : undefined,
      includeResolved: req.query.includeResolved === 'true',
      limit: req.query.limit ? Number(req.query.limit) : 40,
      cursor: req.query.cursor ? String(req.query.cursor) : undefined,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /properties/:propertyId/radar/matches/:matchId
 * Full event detail for a property-event match.
 */
export async function getRadarMatchDetail(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const { propertyId, matchId } = req.params;

    const detail = await service.getMatchDetail(propertyId, matchId, userId);
    res.json({ success: true, data: { detail } });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /properties/:propertyId/radar/matches/:matchId/state
 * Update user state on a property-event match.
 */
export async function updateRadarMatchState(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const { propertyId, matchId } = req.params;

    const state = await service.updateMatchState(
      propertyId,
      matchId,
      userId,
      req.body.state,
      req.body.stateMetaJson ?? null,
    );

    res.json({ success: true, data: { state } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /properties/:propertyId/radar/events
 * Record a frontend analytics event for Home Event Radar.
 */
export async function trackHomeEventRadarEvent(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const { propertyId } = req.params;
    const payload = req.body as { event: string; section?: string; metadata?: Record<string, unknown> };
    const result = await service.trackEvent(propertyId, userId, payload);
    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}
