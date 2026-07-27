import { prisma } from '../../../config/database';
import { APIError } from '../../../middleware/error.middleware';
import { getProtectionContextDecisions } from '../../../services/protection/context';
import {
  buildRadarFeedCursorWhere,
  decodeRadarFeedCursor,
  encodeRadarFeedCursor,
  radarFeedOrderingTuple,
  RADAR_FEED_LIFECYCLE_ORDER,
  RADAR_FEED_ORDER_BY,
  RadarFeedCursorError,
} from '../domain/radarFeedCursor';
import {
  buildRadarFeedFilterWhere,
  normalizeRadarFeedFilters,
  radarFeedFilterKey,
  type RadarFeedFilters,
  type RadarFilterUserState,
} from '../domain/radarFeedFilters';
import {
  projectRadarActions,
  type RadarActionConfidence,
  type RadarActionEventFamily,
  type RadarActionImpact,
  type RadarStoredAction,
} from '../domain/radarActionRegistry';
import { serializeRadarFeedback } from './radarInteraction.service';
import { serializeRadarTaskLink } from './radarTaskIntegration.service';

export type RadarMonitoringState =
  | 'ACTIVE'
  | 'PARTIAL'
  | 'DEGRADED'
  | 'UNCOVERED'
  | 'SETUP_NEEDED';

export type RadarFeedState =
  | 'HAS_EVENTS'
  | 'CONFIRMED_CLEAR'
  | 'PARTIAL_COVERAGE'
  | 'DEGRADED'
  | 'UNCOVERED';

export type RadarUserState = RadarFilterUserState;

type RadarResolutionState =
  | 'not_started'
  | 'in_progress'
  | 'resolved'
  | 'closed';

type QueryDependencies = {
  db?: any;
  now?: () => Date;
  loadPropertyContext?: typeof getProtectionContextDecisions;
};

export type RadarFeedOptions = RadarFeedFilters & {
  limit?: number;
  cursor?: string;
};

const FAMILY_ORDER = [
  'weather',
  'air_quality',
  'disaster',
  'utility',
  'tax',
  'insurance',
  'other',
] as const;

const COVERAGE_STATUS_RANK: Record<string, number> = {
  failed: 6,
  stale: 5,
  covered: 4,
  unknown: 3,
  disabled: 2,
  not_covered: 1,
};

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function numeric(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSeverity(value: string): 'info' | 'low' | 'moderate' | 'high' | 'severe' | 'extreme' {
  if (value === 'medium') return 'moderate';
  if (value === 'critical') return 'severe';
  if (['info', 'low', 'moderate', 'high', 'severe', 'extreme'].includes(value)) {
    return value as 'info' | 'low' | 'moderate' | 'high' | 'severe' | 'extreme';
  }
  return 'info';
}

function normalizeImpact(value: string): 'none' | 'low' | 'moderate' | 'high' | 'critical' {
  if (value === 'watch') return 'low';
  if (['none', 'low', 'moderate', 'high', 'critical'].includes(value)) {
    return value as 'none' | 'low' | 'moderate' | 'high' | 'critical';
  }
  return 'none';
}

function normalizeEventLifecycle(value: string): 'active' | 'updated' | 'resolved' | 'expired' | 'retracted' {
  if (['active', 'updated', 'resolved', 'expired', 'retracted'].includes(value)) {
    return value as 'active' | 'updated' | 'resolved' | 'expired' | 'retracted';
  }
  return 'expired';
}

function normalizeSourceFamily(value: string | null | undefined): string {
  return FAMILY_ORDER.includes(value as (typeof FAMILY_ORDER)[number])
    ? String(value)
    : 'other';
}

function hasUsableGeography(property: any): boolean {
  const pointIsUsable =
    Number.isFinite(Number(property?.latitude)) && Number.isFinite(Number(property?.longitude));
  const postalIsUsable = Boolean(property?.state && (property?.normalizedZipCode || property?.zipCode));
  const administrativeAreaIsUsable = Boolean(
    property?.state && (property?.city || property?.countyFips || property?.county),
  );
  return pointIsUsable || postalIsUsable || administrativeAreaIsUsable;
}

function deriveMonitoringState(property: any, rows: any[]): RadarMonitoringState {
  if (!hasUsableGeography(property) || rows.length === 0) return 'SETUP_NEEDED';
  if (rows.some((row) => row.status === 'failed' || row.status === 'stale')) return 'DEGRADED';

  const covered = rows.filter((row) => row.status === 'covered').length;
  if (covered === rows.length) return 'ACTIVE';
  if (covered > 0) return 'PARTIAL';
  if (rows.every((row) => row.status === 'not_covered' || row.status === 'disabled')) {
    return 'UNCOVERED';
  }
  return 'PARTIAL';
}

function deriveFeedState(
  itemCount: number,
  monitoringState: RadarMonitoringState,
): RadarFeedState {
  if (itemCount > 0) return 'HAS_EVENTS';
  if (monitoringState === 'ACTIVE') return 'CONFIRMED_CLEAR';
  if (monitoringState === 'PARTIAL') return 'PARTIAL_COVERAGE';
  if (monitoringState === 'DEGRADED') return 'DEGRADED';
  return 'UNCOVERED';
}

function visibleMatchWhere(
  propertyId: string,
  now: Date,
  snapshotAt?: Date,
): Record<string, unknown> {
  return {
    propertyId,
    isVisible: true,
    lifecycleStatus: { in: RADAR_FEED_LIFECYCLE_ORDER },
    ...(snapshotAt ? { createdAt: { lte: snapshotAt } } : {}),
    AND: [
      { OR: [{ visibleFrom: null }, { visibleFrom: { lte: now } }] },
      { OR: [{ visibleUntil: null }, { visibleUntil: { gt: now } }] },
    ],
  };
}

function latestRevision(match: any): any | null {
  return match?.radarEvent?.revisions?.[0] ?? null;
}

function storedGeography(match: any): unknown | null {
  const revision = latestRevision(match);
  const normalized = revision?.normalizedJson;
  if (normalized && typeof normalized === 'object' && normalized.geography) {
    return normalized.geography;
  }
  if (match?.radarEvent?.locationType === 'property') {
    return { type: 'property', propertyId: match.propertyId };
  }
  if (match?.radarEvent?.locationType === 'zip') {
    return {
      type: 'postal_code',
      countryCode: 'US',
      postalCode: match.radarEvent.locationKey,
    };
  }
  return null;
}

function storedArray(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const nested = (value as Record<string, unknown>)[key];
    if (Array.isArray(nested)) return nested;
  }
  return [];
}

function storedRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function displayCode(value: unknown): string {
  return String(value ?? 'Missing property detail')
    .replace(/^property\./, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (character: string) => character.toUpperCase());
}

function incidentResolutionState(status: unknown): RadarResolutionState {
  if (status === 'RESOLVED') return 'resolved';
  if (status === 'SUPPRESSED' || status === 'EXPIRED') return 'closed';
  if (status === 'ACTIONED' || status === 'MITIGATED') return 'in_progress';
  return 'not_started';
}

function guidanceResolutionState(status: unknown): RadarResolutionState {
  if (status === 'COMPLETED') return 'resolved';
  if (status === 'ACTIVE') return 'in_progress';
  if (status === 'NOT_STARTED') return 'not_started';
  return 'closed';
}

function currentGuidanceStep(guidance: any): Record<string, unknown> | null {
  if (!guidance) return null;
  const steps = Array.isArray(guidance.steps) ? guidance.steps : [];
  const current = steps.find(
    (step: any) => step.stepKey === guidance.currentStepKey,
  ) ?? steps.find(
    (step: any) => ['IN_PROGRESS', 'PENDING', 'BLOCKED'].includes(String(step.status)),
  );
  if (!current) return null;
  return {
    key: String(current.stepKey),
    label: String(current.label),
    status: String(current.status),
    order: Number(current.stepOrder),
  };
}

function selectGuidanceContinuity(candidates: any[]): any | null {
  return candidates.find(
    (candidate) => candidate.status === 'ACTIVE' || candidate.status === 'NOT_STARTED',
  ) ?? candidates[0] ?? null;
}

function resolutionContinuity(
  propertyId: string,
  incident: any,
  guidance: any,
): Record<string, unknown> {
  const incidentState = incident
    ? incidentResolutionState(incident.status)
    : null;
  const guidanceState = guidance
    ? guidanceResolutionState(guidance.status)
    : null;
  const state = guidanceState ?? incidentState ?? 'not_started';
  const step = currentGuidanceStep(guidance);
  const canContinueGuidance = guidance
    && (guidance.status === 'ACTIVE' || guidance.status === 'NOT_STARTED');
  const href = canContinueGuidance
    ? `/dashboard/properties/${encodeURIComponent(propertyId)}/guidance/step?journeyId=${encodeURIComponent(guidance.id)}&guidanceJourneyId=${encodeURIComponent(guidance.id)}${step ? `&guidanceStepKey=${encodeURIComponent(String(step.key))}` : ''}`
    : null;
  return {
    state,
    incidentState,
    guidanceState,
    continueResolution: href ? {
      label: state === 'not_started' ? 'Start resolution' : 'Continue resolution',
      href,
    } : null,
  };
}

function detailMissingFacts(match: any): Array<Record<string, string>> {
  const factors = storedRecord(match.impactFactorsJson);
  const facts = Array.isArray(factors?.missingFacts) ? factors.missingFacts : [];
  const correctionPath = `/dashboard/properties/${encodeURIComponent(match.propertyId)}/edit`;
  return facts.flatMap((value) => {
    const fact = storedRecord(value);
    if (!fact?.factKey) return [];
    return [{
      factKey: String(fact.factKey),
      reasonCode: String(fact.reasonCode ?? 'PROPERTY_FACT_MISSING'),
      detail: `${displayCode(fact.factKey)} is missing or unverified.`,
      correctionPath,
    }];
  });
}

function detailActions(
  value: unknown,
  match: any,
  continuity: {
    incidentId?: string | null;
    guidanceJourneyId?: string | null;
    guidanceStepKey?: string | null;
  } = {},
) {
  const storedActions = storedArray(value, 'actions')
    .map(storedRecord)
    .filter((entry): entry is Record<string, unknown> => entry !== null);
  const actions = projectRadarActions({
    storedActions: storedActions as RadarStoredAction[],
    sourceFamily: normalizeSourceFamily(
      match.radarEvent.sourceDefinition?.family,
    ) as RadarActionEventFamily,
    impact: (
      ['none', 'watch', 'moderate', 'high'].includes(String(match.impactLevel))
        ? match.impactLevel
        : 'none'
    ) as RadarActionImpact,
    confidence: (
      ['low', 'medium', 'high'].includes(String(match.confidence))
        ? match.confidence
        : 'low'
    ) as RadarActionConfidence,
    propertyId: String(match.propertyId),
    matchId: String(match.id),
    eventId: String(match.radarEvent.id),
    officialSourceUrl: match.radarEvent.canonicalUrl ?? null,
    ...continuity,
  });
  return actions.map((action) => {
    const link = match.taskLinks?.find(
      (candidate: any) => candidate.actionCode === action.code,
    );
    return {
      ...action,
      taskLink: link ? serializeRadarTaskLink(link) : null,
    };
  });
}

function serializeFeedItem(match: any, state?: any): Record<string, unknown> {
  const event = match.radarEvent;
  const revision = latestRevision(match);
  return {
    id: String(match.id),
    propertyMatchId: String(match.id),
    eventId: String(event.id),
    eventType: String(event.eventType),
    sourceFamily: normalizeSourceFamily(event.sourceDefinition?.family),
    title: String(event.title),
    summary: String(event.summary || event.title),
    severity: normalizeSeverity(String(event.severity)),
    impact: normalizeImpact(String(match.impactLevel)),
    confidence: match.confidence ?? undefined,
    priorityBand: match.priorityBand,
    priorityScore: numeric(match.priorityScore),
    matchLifecycleStatus: match.lifecycleStatus,
    sourceFreshnessStatus: match.sourceFreshnessStatus,
    sourceFreshnessReason: match.sourceFreshnessReason ?? null,
    isSourceStale: match.sourceFreshnessStatus === 'stale',
    isMaterialUpdate: Boolean(match.isMaterialUpdate),
    lifecycleStatus: normalizeEventLifecycle(String(revision?.lifecycleStatus ?? event.status)),
    effectiveAt: iso(revision?.effectiveAt ?? event.startAt),
    expiresAt: iso(revision?.expiresAt ?? event.endAt),
    sourceName: String(event.sourceDefinition?.name ?? event.sourceType),
    provider: event.sourceDefinition?.provider ?? null,
    userState: state?.state ?? 'new',
  };
}

function serializeHomeSummaryMatch(match: any): Record<string, unknown> {
  const event = match.radarEvent;
  const revision = latestRevision(match);
  const family = normalizeSourceFamily(event.sourceDefinition?.family);
  const query = new URLSearchParams({
    view: 'now',
    family,
    matchId: String(match.id),
    launchSurface: 'unified_home',
  });
  return {
    propertyMatchId: String(match.id),
    eventId: String(event.id),
    title: String(event.title),
    explanation: String(match.impactSummary),
    sourceFamily: family,
    sourceName: String(event.sourceDefinition?.name ?? event.sourceType),
    severity: normalizeSeverity(String(event.severity)),
    impact: normalizeImpact(String(match.impactLevel)),
    confidence: match.confidence ?? null,
    priorityBand: String(match.priorityBand),
    effectiveAt: iso(revision?.effectiveAt ?? event.startAt),
    expiresAt: iso(revision?.expiresAt ?? event.endAt),
    href: `/dashboard/properties/${encodeURIComponent(match.propertyId)}/tools/home-event-radar?${query.toString()}`,
  };
}

export class RadarQueryService {
  private readonly db: any;
  private readonly clock: () => Date;
  private readonly loadPropertyContext: typeof getProtectionContextDecisions;

  constructor(dependencies: QueryDependencies = {}) {
    this.db = dependencies.db ?? prisma;
    this.clock = dependencies.now ?? (() => new Date());
    this.loadPropertyContext = dependencies.loadPropertyContext ?? getProtectionContextDecisions;
  }

  private async requireProperty(propertyId: string): Promise<any> {
    const property = await this.db.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        normalizedZipCode: true,
        latitude: true,
        longitude: true,
        county: true,
        countyFips: true,
        geocodingStatus: true,
        geographyVersion: true,
      },
    });
    if (!property) throw new APIError('Property not found', 404, 'PROPERTY_NOT_FOUND');
    return property;
  }

  async getCoverage(propertyId: string): Promise<Record<string, unknown>> {
    const [property, rows]: [any, any[]] = await Promise.all([
      this.requireProperty(propertyId),
      this.db.propertyRadarCoverage.findMany({
        where: { propertyId },
        include: {
          sourceDefinition: {
            select: {
              id: true,
              name: true,
              family: true,
              provider: true,
              isEnabled: true,
              health: {
                select: {
                  status: true,
                  lastAttemptAt: true,
                  lastSuccessAt: true,
                  dataFreshThrough: true,
                  message: true,
                },
              },
            },
          },
        },
        orderBy: [{ evaluatedAt: 'desc' }, { sourceDefinitionId: 'asc' }],
      }),
    ]);

    const monitoringState = deriveMonitoringState(property, rows);
    const familyRows = new Map<string, any[]>();
    for (const row of rows) {
      const family = normalizeSourceFamily(row.sourceDefinition?.family);
      familyRows.set(family, [...(familyRows.get(family) ?? []), row]);
    }

    const categories = FAMILY_ORDER
      .filter((family) => familyRows.has(family))
      .map((family) => {
        const candidates = familyRows.get(family) ?? [];
        const representative = [...candidates].sort(
          (left, right) =>
            (COVERAGE_STATUS_RANK[right.status] ?? 0) - (COVERAGE_STATUS_RANK[left.status] ?? 0),
        )[0];
        return {
          family,
          status: representative?.status ?? 'unknown',
          sourceDefinitionIds: candidates.map((row) => String(row.sourceDefinitionId)),
          sourceNames: candidates.map((row) => String(row.sourceDefinition?.name ?? row.sourceDefinitionId)),
          detail: String(representative?.detail ?? 'Coverage has not been evaluated.'),
          evaluatedAt: iso(representative?.evaluatedAt),
          dataFreshThrough: iso(representative?.dataFreshThrough),
        };
      });

    const latestEvaluatedAt = rows
      .map((row) => iso(row.evaluatedAt))
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
    const lastSuccessfulCheckAt = rows
      .map((row) => iso(row.sourceDefinition?.health?.lastSuccessAt))
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

    return {
      propertyId,
      monitoringState,
      evaluatedAt: latestEvaluatedAt,
      lastSuccessfulCheckAt,
      propertyGeographyVersion: property.geographyVersion,
      categories,
    };
  }

  async getCounts(propertyId: string, userId: string): Promise<Record<string, number>> {
    await this.requireProperty(propertyId);
    const base = visibleMatchWhere(propertyId, this.clock());
    const relation = { propertyRadarMatch: { is: base } };
    const [active, upcoming, recentlyEnded, total, nonNew, saved, dismissed] = await Promise.all([
      this.db.propertyRadarMatch.count({ where: { ...base, lifecycleStatus: 'now' } }),
      this.db.propertyRadarMatch.count({ where: { ...base, lifecycleStatus: 'upcoming' } }),
      this.db.propertyRadarMatch.count({ where: { ...base, lifecycleStatus: 'recently_ended' } }),
      this.db.propertyRadarMatch.count({ where: base }),
      this.db.propertyRadarState.count({
        where: { userId, state: { not: 'new' }, ...relation },
      }),
      this.db.propertyRadarState.count({ where: { userId, state: 'saved', ...relation } }),
      this.db.propertyRadarState.count({ where: { userId, state: 'dismissed', ...relation } }),
    ]);
    return {
      active,
      new: Math.max(0, total - nonNew),
      upcoming,
      recentlyEnded,
      saved,
      dismissed,
    };
  }

  async getOverview(propertyId: string, userId: string): Promise<Record<string, unknown>> {
    const now = this.clock();
    const materialWhere = {
      ...visibleMatchWhere(propertyId, now),
      lifecycleStatus: 'now',
      impactLevel: { in: ['watch', 'moderate', 'high'] },
    };
    const [coverage, counts, context, activeMaterialEventCount, mostUrgentMatch] = await Promise.all([
      this.getCoverage(propertyId),
      this.getCounts(propertyId, userId),
      this.loadPropertyContext(propertyId, userId, 'EVENT_RADAR'),
      this.db.propertyRadarMatch.count({ where: materialWhere }),
      this.db.propertyRadarMatch.findFirst({
        where: {
          ...materialWhere,
          impactSummary: { not: null },
        },
        include: {
          radarEvent: {
            include: {
              sourceDefinition: {
                select: { family: true, name: true, provider: true },
              },
              revisions: {
                orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
                take: 1,
              },
            },
          },
        },
        orderBy: RADAR_FEED_ORDER_BY,
      }),
    ]);
    return {
      propertyId,
      generatedAt: now.toISOString(),
      monitoringState: coverage.monitoringState,
      lastSuccessfulCheckAt: coverage.lastSuccessfulCheckAt,
      coverage: coverage.categories,
      counts,
      homeSummary: {
        activeMaterialEventCount,
        mostUrgentMatch: mostUrgentMatch
          ? serializeHomeSummaryMatch(mostUrgentMatch)
          : null,
      },
      propertyContext: {
        propertyId,
        contextVersion: context.contextVersion,
        decision: context.decisions.eventRadar,
      },
    };
  }

  async listFeed(
    propertyId: string,
    userId: string,
    options: RadarFeedOptions = {},
  ): Promise<Record<string, unknown>> {
    await this.requireProperty(propertyId);
    const limit = Math.min(Math.max(options.limit ?? 40, 1), 100);
    const filters = normalizeRadarFeedFilters(options);
    const scope = { propertyId, filterKey: radarFeedFilterKey(filters) };
    let cursor;
    try {
      cursor = options.cursor ? decodeRadarFeedCursor(options.cursor, scope) : null;
    } catch (error) {
      if (error instanceof RadarFeedCursorError) {
        throw new APIError(error.message, 400, 'RADAR_CURSOR_INVALID');
      }
      throw error;
    }
    const snapshotAt = cursor ? new Date(cursor.snapshotAt) : this.clock();
    const base = visibleMatchWhere(propertyId, snapshotAt, snapshotAt);
    const filterWhere = buildRadarFeedFilterWhere(userId, filters);
    const cursorWhere = cursor ? buildRadarFeedCursorWhere(cursor) : null;
    const where: Record<string, unknown> = {
      AND: [base, ...(filterWhere ? [filterWhere] : []), ...(cursorWhere ? [cursorWhere] : [])],
    };
    const countWhere: Record<string, unknown> = {
      AND: [base, ...(filterWhere ? [filterWhere] : [])],
    };

    const [matches, totalCount, overallVisibleCount, coverage] = await Promise.all([
      this.db.propertyRadarMatch.findMany({
        where,
        include: {
          radarEvent: {
            include: {
              sourceDefinition: {
                select: { family: true, name: true, provider: true },
              },
              revisions: {
                orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
                take: 1,
              },
            },
          },
          states: { where: { userId }, take: 1 },
        },
        orderBy: RADAR_FEED_ORDER_BY,
        take: limit + 1,
      }),
      this.db.propertyRadarMatch.count({ where: countWhere }),
      this.db.propertyRadarMatch.count({ where: base }),
      this.getCoverage(propertyId),
    ]);

    const hasNextPage = matches.length > limit;
    const page = hasNextPage ? matches.slice(0, limit) : matches;
    const items = page.map((match: any) => serializeFeedItem(match, match.states?.[0]));
    const lastMatch = page.at(-1);
    return {
      propertyId,
      items,
      pageInfo: {
        hasNextPage,
        endCursor: lastMatch
          ? encodeRadarFeedCursor(
              radarFeedOrderingTuple(lastMatch),
              scope,
              snapshotAt.toISOString(),
            )
          : null,
      },
      totalCount,
      appliedFilters: filters,
      feedState: deriveFeedState(
        overallVisibleCount,
        coverage.monitoringState as RadarMonitoringState,
      ),
      asOf: snapshotAt.toISOString(),
    };
  }

  async getStateView(
    propertyId: string,
    userId: string,
    state: RadarUserState,
    options: Omit<RadarFeedOptions, 'state'> = {},
  ): Promise<Record<string, unknown>> {
    return this.listFeed(propertyId, userId, { ...options, state: [state] });
  }

  async getDetail(
    propertyId: string,
    matchId: string,
    userId: string,
  ): Promise<Record<string, unknown>> {
    const now = this.clock();
    const match = await this.db.propertyRadarMatch.findFirst({
      where: { id: matchId, ...visibleMatchWhere(propertyId, now) },
      include: {
        radarEvent: {
          include: {
            sourceDefinition: {
              select: { family: true, name: true, provider: true },
            },
            revisions: {
              orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
              take: 1,
            },
          },
        },
        states: { where: { userId }, take: 1 },
        feedback: { where: { userId }, take: 1 },
        taskLinks: {
          include: { maintenanceTask: true },
        },
        incident: {
          select: {
            id: true,
            status: true,
            title: true,
            summary: true,
            resolvedAt: true,
            expiredAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!match) throw new APIError('Radar match not found', 404, 'RADAR_MATCH_NOT_FOUND');

    const revision = latestRevision(match);
    const incident = match.incident ?? null;
    const guidanceCandidates = incident && this.db.guidanceJourney?.findMany
      ? await this.db.guidanceJourney.findMany({
          where: {
            propertyId,
            primarySignal: {
              is: {
                sourceEntityType: 'INCIDENT',
                sourceEntityId: incident.id,
              },
            },
          },
          select: {
            id: true,
            status: true,
            currentStepKey: true,
            completedAt: true,
            updatedAt: true,
            steps: {
              select: {
                stepKey: true,
                label: true,
                status: true,
                stepOrder: true,
              },
              orderBy: { stepOrder: 'asc' },
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: 10,
        })
      : [];
    const guidance = selectGuidanceContinuity(guidanceCandidates);
    const guidanceStep = currentGuidanceStep(guidance);
    const continuity = resolutionContinuity(propertyId, incident, guidance);
    const observedAt = iso(revision?.observedAt ?? match.radarEvent.observedAt) as string;
    const receivedAt = iso(
      revision?.createdAt
      ?? revision?.observedAt
      ?? match.radarEvent.createdAt
      ?? match.radarEvent.observedAt,
    ) as string;
    return {
      ...serializeFeedItem(match, match.states?.[0]),
      geography: storedGeography(match),
      matchExplanation: match.matchExplanationJson ?? null,
      impactSummary: match.impactSummary ?? null,
      impactFactors: match.impactFactorsJson ?? null,
      matchedSystems: storedArray(match.matchedSystemsJson, 'systems'),
      recommendedActions: detailActions(match.recommendedActionsJson, match, {
        incidentId: incident?.id ? String(incident.id) : null,
        guidanceJourneyId: guidance?.id ? String(guidance.id) : null,
        guidanceStepKey: guidance?.currentStepKey ?? null,
      }),
      canonicalUrl: match.radarEvent.canonicalUrl ?? null,
      observedAt,
      revision: {
        observedAt,
        receivedAt,
        materialUpdatedAt: iso(match.materialUpdatedAt),
      },
      sourceEvidence: {
        providerEventId: match.radarEvent.providerEventId ?? null,
        providerRevision: revision?.providerRevision ?? match.radarEvent.providerRevision ?? null,
        revisionIdentity: revision?.revisionIdentity ?? null,
      },
      missingFacts: detailMissingFacts(match),
      propertyGeographyVersion: match.propertyGeographyVersion ?? null,
      matcherVersion: match.matcherVersion
        ?? storedRecord(match.matchExplanationJson)?.matcherVersion
        ?? null,
      relatedIncident: incident ? {
        id: String(incident.id),
        status: String(incident.status),
        resolutionState: incidentResolutionState(incident.status),
        title: String(incident.title),
        summary: incident.summary ?? null,
        resolvedAt: iso(incident.resolvedAt),
        expiredAt: iso(incident.expiredAt),
        updatedAt: iso(incident.updatedAt),
        href: `/dashboard/properties/${encodeURIComponent(propertyId)}/incidents/${encodeURIComponent(incident.id)}`,
      } : null,
      relatedGuidance: guidance ? {
        id: String(guidance.id),
        status: String(guidance.status),
        resolutionState: guidanceResolutionState(guidance.status),
        currentStepKey: guidance.currentStepKey ?? null,
        currentStep: guidanceStep,
        completedAt: iso(guidance.completedAt),
        updatedAt: iso(guidance.updatedAt),
        href: (continuity.continueResolution as Record<string, unknown> | null)?.href
          ?? `/dashboard/properties/${encodeURIComponent(propertyId)}/guidance/step?journeyId=${encodeURIComponent(guidance.id)}&guidanceJourneyId=${encodeURIComponent(guidance.id)}`,
      } : null,
      resolutionContinuity: continuity,
      userFeedback: serializeRadarFeedback(match.feedback?.[0]),
    };
  }
}

export const radarQueryService = new RadarQueryService();
