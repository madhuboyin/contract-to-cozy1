import type { Prisma } from '@prisma/client';

export const RADAR_FEED_CURSOR_VERSION = 2 as const;

export const RADAR_FEED_LIFECYCLE_ORDER = [
  'now',
  'upcoming',
  'recently_ended',
] as const;

export const RADAR_FEED_PRIORITY_ORDER = [
  'urgent',
  'high',
  'medium',
  'low',
] as const;

export const RADAR_FEED_ORDER_BY = [
  { lifecycleStatus: 'asc' },
  { priorityBand: 'desc' },
  { priorityScore: 'desc' },
  { radarEvent: { startAt: 'desc' } },
  { id: 'desc' },
] satisfies Prisma.PropertyRadarMatchOrderByWithRelationInput[];

export type RadarFeedLifecycle = (typeof RADAR_FEED_LIFECYCLE_ORDER)[number];
export type RadarFeedPriorityBand = (typeof RADAR_FEED_PRIORITY_ORDER)[number];

export type RadarFeedCursorScope = {
  propertyId: string;
  filterKey: string;
};

export type RadarFeedOrderingTuple = {
  lifecycleStatus: RadarFeedLifecycle;
  priorityBand: RadarFeedPriorityBand;
  priorityScore: string;
  effectiveAt: string;
  id: string;
};

export type RadarFeedCursor = RadarFeedOrderingTuple & RadarFeedCursorScope & {
  version: typeof RADAR_FEED_CURSOR_VERSION;
  snapshotAt: string;
};

export class RadarFeedCursorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RadarFeedCursorError';
  }
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 20 || value.length > 40) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function normalizeScore(value: unknown): string {
  const score = typeof value === 'string' ? value : String(value);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(score)) {
    throw new RadarFeedCursorError('Cursor priority score is invalid');
  }
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > 100) {
    throw new RadarFeedCursorError('Cursor priority score is out of range');
  }
  return score;
}

function parsePayload(value: unknown): RadarFeedCursor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RadarFeedCursorError('Cursor payload must be an object');
  }
  const payload = value as Record<string, unknown>;
  if (payload.v !== RADAR_FEED_CURSOR_VERSION) {
    throw new RadarFeedCursorError('Cursor version is unsupported');
  }
  if (!RADAR_FEED_LIFECYCLE_ORDER.includes(payload.l as RadarFeedLifecycle)) {
    throw new RadarFeedCursorError('Cursor lifecycle is invalid');
  }
  if (!RADAR_FEED_PRIORITY_ORDER.includes(payload.b as RadarFeedPriorityBand)) {
    throw new RadarFeedCursorError('Cursor priority band is invalid');
  }
  if (!isIsoDate(payload.e) || !isIsoDate(payload.a)) {
    throw new RadarFeedCursorError('Cursor timestamp is invalid');
  }
  if (typeof payload.i !== 'string' || payload.i.length < 1 || payload.i.length > 128) {
    throw new RadarFeedCursorError('Cursor match ID is invalid');
  }
  if (typeof payload.r !== 'string' || payload.r.length < 1 || payload.r.length > 128) {
    throw new RadarFeedCursorError('Cursor property scope is invalid');
  }
  if (typeof payload.q !== 'string' || payload.q.length > 1_024) {
    throw new RadarFeedCursorError('Cursor filter scope is invalid');
  }

  return {
    version: RADAR_FEED_CURSOR_VERSION,
    propertyId: payload.r,
    filterKey: payload.q,
    snapshotAt: payload.a,
    lifecycleStatus: payload.l as RadarFeedLifecycle,
    priorityBand: payload.b as RadarFeedPriorityBand,
    priorityScore: normalizeScore(payload.p),
    effectiveAt: payload.e,
    id: payload.i,
  };
}

export function encodeRadarFeedCursor(
  tuple: RadarFeedOrderingTuple,
  scope: RadarFeedCursorScope,
  snapshotAt: string,
): string {
  const cursor = parsePayload({
    v: RADAR_FEED_CURSOR_VERSION,
    r: scope.propertyId,
    q: scope.filterKey,
    a: snapshotAt,
    l: tuple.lifecycleStatus,
    b: tuple.priorityBand,
    p: tuple.priorityScore,
    e: tuple.effectiveAt,
    i: tuple.id,
  });
  const payload = {
    v: cursor.version,
    r: cursor.propertyId,
    q: cursor.filterKey,
    a: cursor.snapshotAt,
    l: cursor.lifecycleStatus,
    b: cursor.priorityBand,
    p: cursor.priorityScore,
    e: cursor.effectiveAt,
    i: cursor.id,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeRadarFeedCursor(
  encoded: string,
  expectedScope: RadarFeedCursorScope,
): RadarFeedCursor {
  if (
    typeof encoded !== 'string'
    || encoded.length < 1
    || encoded.length > 2_048
    || !/^[A-Za-z0-9_-]+$/.test(encoded)
  ) {
    throw new RadarFeedCursorError('Cursor encoding is invalid');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new RadarFeedCursorError('Cursor payload is invalid');
  }
  const cursor = parsePayload(decoded);
  if (
    cursor.propertyId !== expectedScope.propertyId
    || cursor.filterKey !== expectedScope.filterKey
  ) {
    throw new RadarFeedCursorError('Cursor does not belong to this feed');
  }
  return cursor;
}

function valuesAfter<T extends string>(values: readonly T[], value: T): T[] {
  return values.slice(values.indexOf(value) + 1);
}

/**
 * Prisma keyset predicate matching the exact Radar feed ordering. Enum
 * precedence is expanded to explicit `in` sets so correctness does not depend
 * on database enum collation.
 */
export function buildRadarFeedCursorWhere(
  cursor: RadarFeedCursor,
): Prisma.PropertyRadarMatchWhereInput {
  const laterLifecycle = valuesAfter(RADAR_FEED_LIFECYCLE_ORDER, cursor.lifecycleStatus);
  const lowerPriorityBands = valuesAfter(RADAR_FEED_PRIORITY_ORDER, cursor.priorityBand);
  const sameLifecycle = { lifecycleStatus: cursor.lifecycleStatus };
  const sameBand = { ...sameLifecycle, priorityBand: cursor.priorityBand };
  const sameScore = { ...sameBand, priorityScore: cursor.priorityScore };
  const effectiveAt = new Date(cursor.effectiveAt);

  return {
    OR: [
      ...(laterLifecycle.length
        ? [{ lifecycleStatus: { in: laterLifecycle } }]
        : []),
      ...(lowerPriorityBands.length
        ? [{ ...sameLifecycle, priorityBand: { in: lowerPriorityBands } }]
        : []),
      { ...sameBand, priorityScore: { lt: cursor.priorityScore } },
      {
        ...sameScore,
        radarEvent: { is: { startAt: { lt: effectiveAt } } },
      },
      {
        ...sameScore,
        radarEvent: { is: { startAt: effectiveAt } },
        id: { lt: cursor.id },
      },
    ],
  };
}

export function radarFeedOrderingTuple(match: {
  id: unknown;
  lifecycleStatus: unknown;
  priorityBand: unknown;
  priorityScore: unknown;
  radarEvent?: { startAt?: Date | string | null } | null;
}): RadarFeedOrderingTuple {
  const lifecycleStatus = match.lifecycleStatus as RadarFeedLifecycle;
  const priorityBand = match.priorityBand as RadarFeedPriorityBand;
  const effectiveAtValue = match.radarEvent?.startAt;
  const effectiveAt = effectiveAtValue instanceof Date
    ? effectiveAtValue.toISOString()
    : typeof effectiveAtValue === 'string'
      ? new Date(effectiveAtValue).toISOString()
      : '';

  return parsePayload({
    v: RADAR_FEED_CURSOR_VERSION,
    r: 'tuple-validation',
    q: '',
    a: '2000-01-01T00:00:00.000Z',
    l: lifecycleStatus,
    b: priorityBand,
    p: match.priorityScore,
    e: effectiveAt,
    i: String(match.id),
  });
}

export function compareRadarFeedOrdering(
  left: RadarFeedOrderingTuple,
  right: RadarFeedOrderingTuple,
): number {
  const lifecycle =
    RADAR_FEED_LIFECYCLE_ORDER.indexOf(left.lifecycleStatus)
    - RADAR_FEED_LIFECYCLE_ORDER.indexOf(right.lifecycleStatus);
  if (lifecycle !== 0) return lifecycle;

  const priority =
    RADAR_FEED_PRIORITY_ORDER.indexOf(left.priorityBand)
    - RADAR_FEED_PRIORITY_ORDER.indexOf(right.priorityBand);
  if (priority !== 0) return priority;

  const score = Number(right.priorityScore) - Number(left.priorityScore);
  if (score !== 0) return score;

  const effectiveAt = Date.parse(right.effectiveAt) - Date.parse(left.effectiveAt);
  if (effectiveAt !== 0) return effectiveAt;

  return right.id.localeCompare(left.id);
}

export function isRadarFeedTupleAfter(
  candidate: RadarFeedOrderingTuple,
  cursor: RadarFeedOrderingTuple,
): boolean {
  return compareRadarFeedOrdering(candidate, cursor) > 0;
}
