// apps/backend/src/services/homeEventRadar.service.ts

import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { runMatchingForEvent } from './homeEventRadarMatcher.service';

// ---------------------------------------------------------------------------
// DTO serializers
// ---------------------------------------------------------------------------

function serializeEvent(event: any): Record<string, unknown> {
  return {
    id: String(event.id),
    eventType: event.eventType,
    eventSubType: event.eventSubType ?? null,
    title: event.title,
    summary: event.summary ?? null,
    sourceType: event.sourceType,
    sourceRef: event.sourceRef ?? null,
    severity: event.severity,
    startAt: event.startAt instanceof Date ? event.startAt.toISOString() : event.startAt,
    endAt: event.endAt ? (event.endAt instanceof Date ? event.endAt.toISOString() : event.endAt) : null,
    locationType: event.locationType,
    locationKey: event.locationKey,
    status: event.status,
    dedupeKey: event.dedupeKey,
    createdAt: event.createdAt instanceof Date ? event.createdAt.toISOString() : event.createdAt,
    updatedAt: event.updatedAt instanceof Date ? event.updatedAt.toISOString() : event.updatedAt,
  };
}

function serializeMatchFeedItem(match: any, state: any | null): Record<string, unknown> {
  const event = match.radarEvent;
  return {
    propertyRadarMatchId: String(match.id),
    radarEventId: String(match.radarEventId),
    propertyId: String(match.propertyId),
    eventType: event?.eventType ?? null,
    eventSubType: event?.eventSubType ?? null,
    title: event?.title ?? '',
    summary: event?.summary ?? null,
    severity: event?.severity ?? null,
    startAt: event?.startAt instanceof Date ? event.startAt.toISOString() : (event?.startAt ?? null),
    endAt: event?.endAt ? (event.endAt instanceof Date ? event.endAt.toISOString() : event.endAt) : null,
    impactLevel: match.impactLevel,
    impactSummary: match.impactSummary ?? null,
    isVisible: match.isVisible,
    state: state?.state ?? 'new',
    createdAt: match.createdAt instanceof Date ? match.createdAt.toISOString() : match.createdAt,
  };
}

function serializeMatchDetail(match: any, state: any | null): Record<string, unknown> {
  return {
    propertyRadarMatchId: String(match.id),
    radarEventId: String(match.radarEventId),
    propertyId: String(match.propertyId),
    matchScore: match.matchScore !== null && match.matchScore !== undefined
      ? parseFloat(String(match.matchScore))
      : null,
    impactLevel: match.impactLevel,
    impactSummary: match.impactSummary ?? null,
    impactFactorsJson: match.impactFactorsJson ?? null,
    recommendedActionsJson: match.recommendedActionsJson ?? null,
    matchedSystemsJson: match.matchedSystemsJson ?? null,
    isVisible: match.isVisible,
    visibleFrom: match.visibleFrom ? (match.visibleFrom instanceof Date ? match.visibleFrom.toISOString() : match.visibleFrom) : null,
    visibleUntil: match.visibleUntil ? (match.visibleUntil instanceof Date ? match.visibleUntil.toISOString() : match.visibleUntil) : null,
    event: match.radarEvent ? serializeEvent(match.radarEvent) : null,
    state: state?.state ?? 'new',
    stateMetaJson: state?.stateMetaJson ?? null,
    createdAt: match.createdAt instanceof Date ? match.createdAt.toISOString() : match.createdAt,
    updatedAt: match.updatedAt instanceof Date ? match.updatedAt.toISOString() : match.updatedAt,
  };
}

function serializeState(state: any): Record<string, unknown> {
  return {
    id: String(state.id),
    propertyRadarMatchId: String(state.propertyRadarMatchId),
    userId: String(state.userId),
    state: state.state,
    stateMetaJson: state.stateMetaJson ?? null,
    createdAt: state.createdAt instanceof Date ? state.createdAt.toISOString() : state.createdAt,
    updatedAt: state.updatedAt instanceof Date ? state.updatedAt.toISOString() : state.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class HomeEventRadarService {
  private get db() {
    return prisma as any;
  }

  // --------------------------------------------------------------------------
  // 1. Upsert canonical RadarEvent
  // --------------------------------------------------------------------------

  async upsertRadarEvent(body: {
    eventType: string;
    eventSubType?: string | null;
    title: string;
    summary?: string | null;
    sourceType: string;
    sourceRef?: string | null;
    severity: string;
    startAt: string;
    endAt?: string | null;
    locationType: string;
    locationKey: string;
    geoJson?: unknown;
    payloadJson?: unknown;
    dedupeKey: string;
    status?: string;
  }): Promise<{ event: Record<string, unknown>; isNew: boolean }> {
    const data = {
      eventType: body.eventType,
      eventSubType: body.eventSubType ?? null,
      title: body.title,
      summary: body.summary ?? null,
      sourceType: body.sourceType,
      sourceRef: body.sourceRef ?? null,
      severity: body.severity,
      startAt: new Date(body.startAt),
      endAt: body.endAt ? new Date(body.endAt) : null,
      locationType: body.locationType,
      locationKey: body.locationKey,
      geoJson: (body.geoJson as any) ?? undefined,
      payloadJson: (body.payloadJson as any) ?? undefined,
      status: (body.status as any) ?? 'active',
    };

    // Check if event already exists
    const existing = await this.db.radarEvent.findUnique({
      where: { dedupeKey: body.dedupeKey },
    });

    if (existing) {
      // Update mutable fields (title, summary, status, endAt) but preserve core identity
      const updated = await this.db.radarEvent.update({
        where: { dedupeKey: body.dedupeKey },
        data: {
          title: body.title,
          summary: body.summary ?? null,
          status: body.status ? (body.status as any) : undefined,
          endAt: body.endAt ? new Date(body.endAt) : undefined,
          payloadJson: (body.payloadJson as any) ?? undefined,
        },
      });
      return { event: serializeEvent(updated), isNew: false };
    }

    const created = await this.db.radarEvent.create({ data: { ...data, dedupeKey: body.dedupeKey } });
    return { event: serializeEvent(created), isNew: true };
  }

  // --------------------------------------------------------------------------
  // 2. Trigger matching for an event
  // --------------------------------------------------------------------------

  async triggerMatching(
    eventId: string,
    propertyIds?: string[] | null,
  ): Promise<{ matched: number; skipped: number }> {
    const event = await this.db.radarEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new APIError('Radar event not found', 404, 'RADAR_EVENT_NOT_FOUND');

    return runMatchingForEvent(eventId, propertyIds);
  }

  // --------------------------------------------------------------------------
  // 3. List event feed for a property
  // --------------------------------------------------------------------------

  async listFeedForProperty(
    propertyId: string,
    userId: string,
    query: {
      severity?: string;
      includeResolved?: boolean;
      limit?: number;
      cursor?: string;
    },
  ): Promise<{ items: Record<string, unknown>[]; hasMore: boolean; nextCursor: string | null }> {
    const limit = Math.min(query.limit ?? 40, 100);

    const where: Record<string, unknown> = {
      propertyId,
      isVisible: true,
    };

    if (!query.includeResolved) {
      where.radarEvent = {
        status: { not: 'archived' },
      };
    }

    if (query.severity) {
      where.radarEvent = {
        ...(where.radarEvent as object ?? {}),
        severity: query.severity,
      };
    }

    if (query.cursor) {
      where.id = { lt: query.cursor };
    }

    const matches = await this.db.propertyRadarMatch.findMany({
      where,
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: limit + 1,
      include: {
        radarEvent: true,
      },
    });

    const hasMore = matches.length > limit;
    const page = hasMore ? matches.slice(0, limit) : matches;

    // Fetch states for this user across all match IDs
    const matchIds = page.map((m: any) => m.id);
    const states = matchIds.length > 0
      ? await this.db.propertyRadarState.findMany({
          where: {
            propertyRadarMatchId: { in: matchIds },
            userId,
          },
        })
      : [];

    const stateMap = new Map<string, any>();
    for (const s of states) {
      stateMap.set(s.propertyRadarMatchId, s);
    }

    const items = page.map((match: any) => serializeMatchFeedItem(match, stateMap.get(match.id) ?? null));
    const nextCursor = hasMore ? String(page[page.length - 1].id) : null;

    return { items, hasMore, nextCursor };
  }

  // --------------------------------------------------------------------------
  // 4. Get event detail for a match
  // --------------------------------------------------------------------------

  async getMatchDetail(
    propertyId: string,
    matchId: string,
    userId: string,
  ): Promise<Record<string, unknown>> {
    const match = await this.db.propertyRadarMatch.findFirst({
      where: { id: matchId, propertyId },
      include: { radarEvent: true },
    });

    if (!match) throw new APIError('Radar match not found', 404, 'RADAR_MATCH_NOT_FOUND');

    const state = await this.db.propertyRadarState.findFirst({
      where: { propertyRadarMatchId: matchId, userId },
    });

    // Auto-mark as 'seen' if currently 'new'
    if (!state || state.state === 'new') {
      await this.db.propertyRadarState.upsert({
        where: { propertyRadarMatchId_userId: { propertyRadarMatchId: matchId, userId } },
        create: { propertyRadarMatchId: matchId, userId, state: 'seen' },
        update: state?.state === 'new' ? { state: 'seen' } : {},
      });
    }

    // Log open_event action
    await this.db.propertyRadarAction.create({
      data: { propertyRadarMatchId: matchId, actionType: 'open_event' },
    });

    const refreshedState = await this.db.propertyRadarState.findFirst({
      where: { propertyRadarMatchId: matchId, userId },
    });

    return serializeMatchDetail(match, refreshedState);
  }

  // --------------------------------------------------------------------------
  // 5. Update user state on a match
  // --------------------------------------------------------------------------

  async updateMatchState(
    propertyId: string,
    matchId: string,
    userId: string,
    state: string,
    stateMetaJson?: Record<string, unknown> | null,
  ): Promise<Record<string, unknown>> {
    // Verify match belongs to property
    const match = await this.db.propertyRadarMatch.findFirst({
      where: { id: matchId, propertyId },
      select: { id: true },
    });
    if (!match) throw new APIError('Radar match not found', 404, 'RADAR_MATCH_NOT_FOUND');

    const updated = await this.db.propertyRadarState.upsert({
      where: { propertyRadarMatchId_userId: { propertyRadarMatchId: matchId, userId } },
      create: {
        propertyRadarMatchId: matchId,
        userId,
        state,
        stateMetaJson: (stateMetaJson as any) ?? null,
      },
      update: {
        state,
        stateMetaJson: (stateMetaJson as any) ?? null,
      },
    });

    // Map state transition → action type
    const actionMap: Record<string, string> = {
      saved: 'save_event',
      dismissed: 'dismiss_event',
      acted_on: 'mark_checked',
      seen: 'open_event',
    };
    const actionType = actionMap[state];
    if (actionType) {
      await this.db.propertyRadarAction.create({
        data: { propertyRadarMatchId: matchId, actionType },
      });
    }

    return serializeState(updated);
  }

  // --------------------------------------------------------------------------
  // 6. Get a canonical radar event by ID (utility for admin/debug)
  // --------------------------------------------------------------------------

  async getRadarEvent(eventId: string): Promise<Record<string, unknown>> {
    const event = await this.db.radarEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new APIError('Radar event not found', 404, 'RADAR_EVENT_NOT_FOUND');
    return serializeEvent(event);
  }

  // --------------------------------------------------------------------------
  // 7. Analytics event tracking
  // --------------------------------------------------------------------------

  async trackEvent(
    propertyId: string,
    userId: string,
    input: { event: string; section?: string; metadata?: Record<string, unknown> },
  ): Promise<{ ok: true }> {
    const eventName = String(input.event || 'UNKNOWN')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_')
      .slice(0, 80);
    const section = input.section ? String(input.section).slice(0, 80) : null;

    await prisma.auditLog.create({
      data: {
        userId,
        action: `HOME_EVENT_RADAR_${eventName || 'UNKNOWN'}`,
        entityType: 'PROPERTY',
        entityId: propertyId,
        newValues: {
          section,
          metadata: (input.metadata ?? {}) as any,
        } as any,
      },
    });

    return { ok: true };
  }
}
