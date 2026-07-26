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

export type RadarUserState = 'new' | 'seen' | 'saved' | 'dismissed' | 'acted_on';

type QueryDependencies = {
  db?: any;
  now?: () => Date;
  loadPropertyContext?: typeof getProtectionContextDecisions;
};

type FeedOptions = {
  limit?: number;
  cursor?: string;
  state?: RadarUserState;
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

function stateFilter(userId: string, state?: RadarUserState): Record<string, unknown> | null {
  if (!state) return null;
  if (state === 'new') {
    return {
      OR: [
        { states: { none: { userId } } },
        { states: { some: { userId, state: 'new' } } },
      ],
    };
  }
  return { states: { some: { userId, state } } };
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
    const [coverage, counts, context] = await Promise.all([
      this.getCoverage(propertyId),
      this.getCounts(propertyId, userId),
      this.loadPropertyContext(propertyId, userId, 'EVENT_RADAR'),
    ]);
    return {
      propertyId,
      generatedAt: this.clock().toISOString(),
      monitoringState: coverage.monitoringState,
      lastSuccessfulCheckAt: coverage.lastSuccessfulCheckAt,
      coverage: coverage.categories,
      counts,
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
    options: FeedOptions = {},
  ): Promise<Record<string, unknown>> {
    await this.requireProperty(propertyId);
    const limit = Math.min(Math.max(options.limit ?? 40, 1), 100);
    const scope = { propertyId, state: options.state ?? null };
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
    const selectedState = stateFilter(userId, options.state);
    const cursorWhere = cursor ? buildRadarFeedCursorWhere(cursor) : null;
    const where: Record<string, unknown> = {
      AND: [base, ...(selectedState ? [selectedState] : []), ...(cursorWhere ? [cursorWhere] : [])],
    };
    const countWhere: Record<string, unknown> = {
      AND: [base, ...(selectedState ? [selectedState] : [])],
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
      selectedState
        ? this.db.propertyRadarMatch.count({ where: base })
        : this.db.propertyRadarMatch.count({ where: base }),
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
    options: Omit<FeedOptions, 'state'> = {},
  ): Promise<Record<string, unknown>> {
    return this.listFeed(propertyId, userId, { ...options, state });
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
      },
    });
    if (!match) throw new APIError('Radar match not found', 404, 'RADAR_MATCH_NOT_FOUND');

    const revision = latestRevision(match);
    return {
      ...serializeFeedItem(match, match.states?.[0]),
      geography: storedGeography(match),
      matchExplanation: match.matchExplanationJson ?? null,
      impactSummary: match.impactSummary ?? null,
      impactFactors: match.impactFactorsJson ?? null,
      matchedSystems: storedArray(match.matchedSystemsJson, 'systems'),
      recommendedActions: storedArray(match.recommendedActionsJson, 'actions'),
      canonicalUrl: match.radarEvent.canonicalUrl ?? null,
      observedAt: iso(revision?.observedAt ?? match.radarEvent.observedAt),
      sourceEvidence: {
        providerEventId: match.radarEvent.providerEventId ?? null,
        providerRevision: revision?.providerRevision ?? match.radarEvent.providerRevision ?? null,
        revisionIdentity: revision?.revisionIdentity ?? null,
      },
    };
  }
}

export const radarQueryService = new RadarQueryService();
