// apps/backend/src/controllers/homeEventRadar.controller.ts

import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { HomeEventRadarService } from '../services/homeEventRadar.service';
import { APIError } from '../middleware/error.middleware';
import { logger } from '../lib/logger';
import { guidanceJourneyService } from '../services/guidanceEngine/guidanceJourney.service';
import { prisma } from '../config/database';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { recordAdminAction } from '../services/adminAudit.service';
import {
  radarQueryService,
  type RadarUserState,
} from '../modules/homeEventRadar/services/radarQuery.service';
import { listRadarEventsQuerySchema } from '../validators/homeEventRadar.validators';

const service = new HomeEventRadarService();

function inferRadarIssueDomain(signalIntentFamily?: string | null): 'WEATHER' | 'ENERGY' | 'OTHER' {
  const family = String(signalIntentFamily ?? '').trim().toLowerCase();
  if (['freeze_risk', 'flood_risk', 'heat_risk', 'weather_risk'].includes(family)) {
    return 'WEATHER';
  }
  if (['energy_inefficiency_detected', 'high_utility_cost'].includes(family)) {
    return 'ENERGY';
  }
  return 'OTHER';
}

function requireUser(req: CustomRequest): { userId: string } {
  const userId = req.user?.userId;
  if (!userId) throw new APIError('Authentication required', 401, 'AUTH_REQUIRED');
  return { userId };
}

// ---------------------------------------------------------------------------
// Admin / operations endpoints
// ---------------------------------------------------------------------------

/**
 * POST /admin/radar/events
 * Upsert a canonical RadarEvent and immediately trigger property matching.
 */
export async function upsertRadarEvent(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);

    const { event, isNew } = await service.upsertRadarEvent(req.body);
    const eventId = String((event as any).id);

    await recordAdminAction({
      actorId: userId,
      action: isNew ? 'RADAR_EVENT_CREATE' : 'RADAR_EVENT_UPDATE',
      entityType: 'RADAR_EVENT',
      entityId: eventId,
      capability: 'INTEGRATION_MANAGE',
      newValues: {
        eventType: (event as any).eventType ?? null,
        sourceType: (event as any).sourceType ?? null,
        locationType: (event as any).locationType ?? null,
        severity: (event as any).severity ?? null,
        status: (event as any).status ?? null,
      },
      req,
    });

    // Trigger matching asynchronously (do not await to keep response fast)
    // Errors in matching are non-fatal for the upsert response.
    service.triggerMatching(eventId, null).catch((err) => {
      logger.error({ eventId, err }, '[HomeEventRadar] Background matching failed for event');
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
 * POST /admin/radar/events/:eventId/match
 * (Re-)trigger property matching for a specific event.
 * Optionally pass { propertyIds: [...] } to restrict scope.
 */
export async function triggerEventMatching(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);

    const { eventId } = req.params;
    const propertyIds: string[] | null = req.body?.propertyIds ?? null;

    const result = await service.triggerMatching(eventId, propertyIds);

    await recordAdminAction({
      actorId: userId,
      action: 'RADAR_EVENT_MATCH_TRIGGER',
      entityType: 'RADAR_EVENT',
      entityId: eventId,
      capability: 'INTEGRATION_MANAGE',
      newValues: {
        scope: propertyIds?.length ? 'PROPERTY_LIST' : 'ALL_ELIGIBLE_PROPERTIES',
        propertyCount: propertyIds?.length ?? null,
        matched: result.matched,
        skipped: result.skipped,
      },
      req,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/radar/events/:eventId
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

export async function getRadarOverview(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const data = await radarQueryService.getOverview(req.params.propertyId, userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getRadarCoverage(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    requireUser(req);
    const data = await radarQueryService.getCoverage(req.params.propertyId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getRadarCounts(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const data = await radarQueryService.getCounts(req.params.propertyId, userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listRadarEvents(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const { propertyId } = req.params;
    const query = listRadarEventsQuerySchema.parse(req.query);
    const data = await radarQueryService.listFeed(propertyId, userId, query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getRadarEventDetail(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const data = await radarQueryService.getDetail(
      req.params.propertyId,
      req.params.matchId,
      userId,
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getRadarStateView(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { userId } = requireUser(req);
    const query = listRadarEventsQuerySchema.omit({ state: true }).parse(req.query);
    const data = await radarQueryService.getStateView(
      req.params.propertyId,
      userId,
      req.params.state as RadarUserState,
      query,
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

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

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId,
      propertyId,
      moduleKey: AnalyticsModule.RISK,
      featureKey: AnalyticsFeature.HOME_EVENT_RADAR,
      metadataJson: { itemCount: (result as any)?.items?.length },
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
    const guidanceJourneyId =
      typeof req.body?.guidanceJourneyId === 'string' ? req.body.guidanceJourneyId : null;
    const guidanceStepKey =
      typeof req.body?.guidanceStepKey === 'string' ? req.body.guidanceStepKey : null;
    const guidanceSignalIntentFamily =
      typeof req.body?.guidanceSignalIntentFamily === 'string'
        ? req.body.guidanceSignalIntentFamily
        : null;
    const nextState = req.body.state;

    const state = await service.updateMatchState(
      propertyId,
      matchId,
      userId,
      nextState,
      req.body.stateMetaJson ?? null,
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId,
      propertyId,
      moduleKey: AnalyticsModule.RISK,
      featureKey: AnalyticsFeature.HOME_EVENT_RADAR,
      metadataJson: { actionType: 'update_match_state', matchId, state: nextState },
    });

    if (
      guidanceJourneyId &&
      guidanceStepKey &&
      ['saved', 'dismissed', 'acted_on'].includes(String(nextState))
    ) {
      try {
        const match = await prisma.propertyRadarMatch.findFirst({
          where: { id: matchId, propertyId },
          include: { radarEvent: true },
        });

        await guidanceJourneyService.recordToolCompletion({
          propertyId,
          actorUserId: userId,
          journeyId: guidanceJourneyId,
          signalIntentFamily: guidanceSignalIntentFamily,
          issueDomain: inferRadarIssueDomain(guidanceSignalIntentFamily),
          sourceToolKey: 'home-event-radar',
          sourceEntityType: 'PROPERTY_RADAR_MATCH',
          sourceEntityId: matchId,
          stepKey: guidanceStepKey,
          status: 'COMPLETED',
          producedData: {
            proofType: 'radar_event_triage',
            proofId: `radar-match:${matchId}:${nextState}`,
            propertyRadarMatchId: matchId,
            radarEventId: match?.radarEventId ?? null,
            eventType: match?.radarEvent?.eventType ?? null,
            severity: match?.radarEvent?.severity ?? null,
            impactLevel: match?.impactLevel ?? null,
            selectedState: nextState,
            completedAt: new Date().toISOString(),
          },
        });
      } catch (guidanceError) {
        logger.warn({ guidanceError, propertyId, matchId }, '[GUIDANCE] home event radar hook failed');
      }
    }

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
