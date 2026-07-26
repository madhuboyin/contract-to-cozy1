// apps/backend/src/services/homeEventRadar.service.ts

import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { runMatchingForEvent } from './homeEventRadarMatcher.service';
import { getProtectionContextDecisions } from './protection/context';
import type { FeatureDecision } from '../modules/propertyContext';
import { radarTimingGroup } from '../modules/homeEventRadar/domain/radarVisibility';
import {
  compareRadarPriority,
  computeRadarPriority,
  type RadarPriorityResult,
  type RadarPriorityTieBreakers,
  type RadarPriorityUserState,
} from '../modules/homeEventRadar/domain/radarPriority';
import { evaluateRadarSourceFreshness } from '../modules/homeEventRadar/domain/radarMatchLifecycle';

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
    lifecycleStatus: event?.status ?? null,
    timingGroup: match.lifecycleStatus === 'now'
      || match.lifecycleStatus === 'upcoming'
      || match.lifecycleStatus === 'recently_ended'
      ? match.lifecycleStatus
      : event
        ? radarTimingGroup(event)
        : null,
    impactLevel: match.impactLevel,
    impactSummary: match.impactSummary ?? null,
    confidence: match.confidence ?? null,
    priorityBand: match.priorityBand ?? null,
    matchLifecycleStatus: match.lifecycleStatus,
    sourceFreshnessStatus: match.sourceFreshnessStatus,
    isSourceStale: match.sourceFreshnessStatus === 'stale',
    isMaterialUpdate: match.isMaterialUpdate,
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
    confidence: match.confidence ?? null,
    priorityBand: match.priorityBand ?? null,
    priorityVersion: match.priorityVersion ?? null,
    priorityEvaluatedAt: match.priorityEvaluatedAt
      ? (
          match.priorityEvaluatedAt instanceof Date
            ? match.priorityEvaluatedAt.toISOString()
            : match.priorityEvaluatedAt
        )
      : null,
    matchLifecycleStatus: match.lifecycleStatus,
    lifecycleReason: match.lifecycleReason ?? null,
    lifecycleVersion: match.lifecycleVersion ?? null,
    sourceFreshnessStatus: match.sourceFreshnessStatus,
    sourceFreshnessReason: match.sourceFreshnessReason ?? null,
    isSourceStale: match.sourceFreshnessStatus === 'stale',
    isMaterialUpdate: match.isMaterialUpdate,
    materialUpdatedAt: match.materialUpdatedAt
      ? (
          match.materialUpdatedAt instanceof Date
            ? match.materialUpdatedAt.toISOString()
            : match.materialUpdatedAt
        )
      : null,
    noLongerApplicableAt: match.noLongerApplicableAt
      ? (
          match.noLongerApplicableAt instanceof Date
            ? match.noLongerApplicableAt.toISOString()
            : match.noLongerApplicableAt
        )
      : null,
    matchExplanation: match.matchExplanationJson ?? null,
    matcherVersion: match.matcherVersion ?? null,
    lastEvaluatedAt: match.lastEvaluatedAt
      ? (
          match.lastEvaluatedAt instanceof Date
            ? match.lastEvaluatedAt.toISOString()
            : match.lastEvaluatedAt
        )
      : null,
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

const RADAR_ACTION_RESPONSIBILITY: Record<string, keyof Pick<
  ReturnType<typeof import('./protection/applicabilityPolicy').evaluateProtectionContext>,
  'roofActions' | 'exteriorActions' | 'plumbingActions' | 'hvacActions' | 'commonSafetyActions'
>> = {
  INSPECT_ROOF: 'roofActions',
  DOCUMENT_ROOF: 'roofActions',
  CHECK_GUTTERS: 'exteriorActions',
  SHUT_OFF_IRRIGATION: 'exteriorActions',
  SECURE_OUTDOOR_ITEMS: 'exteriorActions',
  CLEAR_DRAINS: 'exteriorActions',
  CHECK_FENCING: 'exteriorActions',
  SERVICE_HVAC: 'hvacActions',
  CHECK_AIR_FILTERS: 'hvacActions',
  PREPARE_BACKUP_HEAT: 'hvacActions',
  GET_COOLING: 'hvacActions',
  PROTECT_PIPES: 'plumbingActions',
  INSPECT_SUMP_PUMP: 'plumbingActions',
};

function applyResponsibilityToRadarDetail(
  detail: Record<string, unknown>,
  decisions: ReturnType<typeof import('./protection/applicabilityPolicy').evaluateProtectionContext>,
): Record<string, unknown> {
  const recommended = detail.recommendedActionsJson as { actions?: Array<Record<string, unknown>> } | null;
  if (!recommended?.actions) return detail;
  const actions = recommended.actions.map((action) => {
    const decisionKey = RADAR_ACTION_RESPONSIBILITY[String(action.code ?? '')];
    if (!decisionKey) return action;
    const decision = decisions[decisionKey];
    const delegated = decision.status === 'NOT_APPLICABLE';
    const delegate = decision.reasonCodes.includes('ASSOCIATION_RESPONSIBILITY') ? 'association' : 'landlord';
    return {
      ...action,
      label: delegated ? `Coordinate with your ${delegate}: ${String(action.label ?? '')}` : action.label,
      responsibility: decision,
    };
  });
  return { ...detail, recommendedActionsJson: { ...recommended, actions } };
}

const CLOSED_INCIDENT_STATUSES = new Set([
  'RESOLVED',
  'SUPPRESSED',
  'EXPIRED',
]);

function hasActiveRadarIncident(incident: { status?: string } | null | undefined): boolean {
  return Boolean(
    incident?.status
    && !CLOSED_INCIDENT_STATUSES.has(String(incident.status)),
  );
}

type RankedRadarFeedEntry = {
  item: Record<string, unknown>;
  priority: RadarPriorityResult & RadarPriorityTieBreakers;
};

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
  ): Promise<{
    items: Record<string, unknown>[];
    hasMore: boolean;
    nextCursor: string | null;
    propertyContext: {
      propertyId: string;
      contextVersion: string;
      decision: FeatureDecision;
    };
  }> {
    const limit = Math.min(query.limit ?? 40, 100);
    const now = new Date();

    const where: Record<string, unknown> = {
      propertyId,
      isVisible: true,
      AND: [
        { OR: [{ visibleFrom: null }, { visibleFrom: { lte: now } }] },
        { OR: [{ visibleUntil: null }, { visibleUntil: { gt: now } }] },
      ],
    };

    if (!query.includeResolved) {
      where.radarEvent = {
        status: { in: ['active', 'updated'] },
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
        { priorityScore: 'desc' },
        { visibleFrom: 'asc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: limit + 1,
      include: {
        radarEvent: {
          include: {
            sourceDefinition: {
              select: {
                isEnabled: true,
                freshnessSeconds: true,
                health: {
                  select: {
                    status: true,
                    lastSuccessAt: true,
                    dataFreshThrough: true,
                  },
                },
              },
            },
            sourceRun: {
              select: {
                status: true,
                finishedAt: true,
                dataFreshThrough: true,
              },
            },
          },
        },
        incident: {
          select: {
            status: true,
          },
        },
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

    const rankedEntries: RankedRadarFeedEntry[] = page
      .map((match: any): RankedRadarFeedEntry => {
        const state = stateMap.get(match.id) ?? null;
        const sourceFreshness = evaluateRadarSourceFreshness(
          match.radarEvent,
          now,
        );
        const priority = computeRadarPriority(
          {
            severity: match.radarEvent.severity,
            impactLevel: match.impactLevel,
            confidence: match.confidence,
            effectiveAt: match.radarEvent.startAt,
            expiresAt: match.radarEvent.endAt,
            lifecycleStatus: match.radarEvent.status,
            isMaterialUpdate: match.isMaterialUpdate,
            materiallyUpdatedAt: match.materialUpdatedAt,
            hasActiveIncident: hasActiveRadarIncident(match.incident),
            userState: (state?.state ?? 'new') as RadarPriorityUserState,
          },
          now,
        );
        return {
          item: {
            ...serializeMatchFeedItem(
              {
                ...match,
                priorityBand: priority.band,
                sourceFreshnessStatus: sourceFreshness.status,
                sourceFreshnessReason: sourceFreshness.reason,
              },
              state,
            ),
            priorityBand: priority.band,
          },
          priority: {
            ...priority,
            effectiveAt: match.radarEvent.startAt instanceof Date
              ? match.radarEvent.startAt.toISOString()
              : String(match.radarEvent.startAt),
            createdAt: match.createdAt instanceof Date
              ? match.createdAt.toISOString()
              : String(match.createdAt),
            matchId: String(match.id),
          },
        };
      });
    const prioritizedItems = rankedEntries
      .sort((left, right) => compareRadarPriority(left.priority, right.priority))
      .map(({ item }) => item);

    const nextCursor = hasMore ? String(page[page.length - 1].id) : null;

    const protectionContext = await getProtectionContextDecisions(propertyId, userId, 'EVENT_RADAR');

    return {
      items: prioritizedItems,
      hasMore,
      nextCursor,
      propertyContext: {
        propertyId,
        contextVersion: protectionContext.contextVersion,
        decision: protectionContext.decisions.eventRadar,
      },
    };
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
      include: {
        radarEvent: {
          include: {
            sourceDefinition: {
              select: {
                isEnabled: true,
                freshnessSeconds: true,
                health: {
                  select: {
                    status: true,
                    lastSuccessAt: true,
                    dataFreshThrough: true,
                  },
                },
              },
            },
            sourceRun: {
              select: {
                status: true,
                finishedAt: true,
                dataFreshThrough: true,
              },
            },
          },
        },
      },
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

    const protectionContext = await getProtectionContextDecisions(propertyId, userId, 'EVENT_RADAR');
    const sourceFreshness = evaluateRadarSourceFreshness(
      match.radarEvent,
      new Date(),
    );
    const detail = applyResponsibilityToRadarDetail(
      serializeMatchDetail({
        ...match,
        sourceFreshnessStatus: sourceFreshness.status,
        sourceFreshnessReason: sourceFreshness.reason,
      }, refreshedState),
      protectionContext.decisions,
    );
    return {
      ...detail,
      propertyContext: {
        propertyId,
        contextVersion: protectionContext.contextVersion,
        decision: protectionContext.decisions.eventRadar,
      },
    };
  }

  // --------------------------------------------------------------------------
  // 5. Get a canonical radar event by ID (utility for admin/debug)
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
