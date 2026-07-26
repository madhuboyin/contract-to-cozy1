import { radarValueFingerprint } from './radarObservationIdentity';
import {
  radarMatchVisibleFrom,
  radarMatchVisibleUntil,
  radarTimingGroup,
  type RadarTimingGroup,
} from './radarVisibility';

export const RADAR_MATCH_LIFECYCLE_VERSION = 'match-lifecycle-v1';

export type RadarMatchLifecycleStatus =
  | RadarTimingGroup
  | 'no_longer_applicable';
export type RadarSourceFreshnessStatus = 'fresh' | 'stale' | 'unknown';

export interface RadarMatchLifecycleEventInput {
  status: string;
  startAt: Date | string;
  endAt?: Date | string | null;
  observedAt?: Date | string | null;
  resolvedAt?: Date | string | null;
  expiredAt?: Date | string | null;
  retractedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  sourceDefinition?: {
    isEnabled: boolean;
    freshnessSeconds: number;
    health?: {
      status: string;
      lastSuccessAt?: Date | string | null;
      dataFreshThrough?: Date | string | null;
    } | null;
  } | null;
  sourceRun?: {
    status: string;
    finishedAt?: Date | string | null;
    dataFreshThrough?: Date | string | null;
  } | null;
}

export interface RadarMaterialRevisionSnapshot {
  id: string;
  lifecycleStatus: string;
  eventType: string;
  severity: string;
  effectiveAt: Date | string;
  expiresAt?: Date | string | null;
  title: string;
  summary?: string | null;
  geography: unknown;
}

export interface RadarExistingMatchLifecycleInput {
  exists: boolean;
  lastEventRevisionId?: string | null;
  isMaterialUpdate?: boolean;
  materialUpdatedAt?: Date | string | null;
  visibleFrom?: Date | string | null;
}

export interface RadarMaterialUpdateResult {
  isMaterialUpdate: boolean;
  reasonCodes: string[];
}

export interface RadarMatchLifecycleResult {
  version: typeof RADAR_MATCH_LIFECYCLE_VERSION;
  status: RadarMatchLifecycleStatus;
  reasonCode: string;
  isVisible: boolean;
  visibleFrom: Date;
  visibleUntil: Date | null;
  isMaterialUpdate: boolean;
  materialUpdatedAt: Date | null;
  materialReasonCodes: string[];
  sourceFreshnessStatus: RadarSourceFreshnessStatus;
  sourceFreshnessReason: string;
  noLongerApplicableAt: Date | null;
  evaluatedAt: Date;
}

function validDate(
  value: Date | string | null | undefined,
  field: string,
): Date | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new TypeError(`Radar match lifecycle ${field} must be valid`);
  }
  return parsed;
}

function requiredDate(value: Date | string, field: string): Date {
  const parsed = validDate(value, field);
  if (!parsed) throw new TypeError(`Radar match lifecycle ${field} is required`);
  return parsed;
}

function normalizedText(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, ' ') ?? '';
}

function materialLifecycle(value: string): string {
  return value === 'active' || value === 'updated' ? 'open' : value;
}

function sameTimestamp(
  left: Date | string | null | undefined,
  right: Date | string | null | undefined,
): boolean {
  return validDate(left, 'revision timestamp')?.getTime()
    === validDate(right, 'revision timestamp')?.getTime();
}

/**
 * Materiality is deliberately narrower than revision identity. Provider
 * metadata/raw evidence can create an immutable revision without re-alerting
 * a homeowner. Only lifecycle, severity, timing, geography, event family, or
 * homeowner-facing meaning changes are material.
 */
export function detectRadarMaterialUpdate(
  previous: RadarMaterialRevisionSnapshot,
  current: RadarMaterialRevisionSnapshot,
): RadarMaterialUpdateResult {
  const reasonCodes: string[] = [];
  if (
    materialLifecycle(previous.lifecycleStatus)
    !== materialLifecycle(current.lifecycleStatus)
  ) {
    reasonCodes.push('LIFECYCLE_CHANGED');
  }
  if (previous.eventType !== current.eventType) {
    reasonCodes.push('EVENT_TYPE_CHANGED');
  }
  if (previous.severity !== current.severity) {
    reasonCodes.push('SEVERITY_CHANGED');
  }
  if (!sameTimestamp(previous.effectiveAt, current.effectiveAt)) {
    reasonCodes.push('EFFECTIVE_TIME_CHANGED');
  }
  if (!sameTimestamp(previous.expiresAt, current.expiresAt)) {
    reasonCodes.push('EXPIRATION_CHANGED');
  }
  if (normalizedText(previous.title) !== normalizedText(current.title)) {
    reasonCodes.push('TITLE_CHANGED');
  }
  if (normalizedText(previous.summary) !== normalizedText(current.summary)) {
    reasonCodes.push('SUMMARY_CHANGED');
  }
  if (
    radarValueFingerprint(previous.geography)
    !== radarValueFingerprint(current.geography)
  ) {
    reasonCodes.push('GEOGRAPHY_CHANGED');
  }
  return {
    isMaterialUpdate: reasonCodes.length > 0,
    reasonCodes,
  };
}

export function evaluateRadarSourceFreshness(
  event: RadarMatchLifecycleEventInput,
  evaluatedAt: Date,
): {
  status: RadarSourceFreshnessStatus;
  reason: string;
} {
  const definition = event.sourceDefinition;
  if (!definition) {
    return {
      status: 'unknown',
      reason: 'SOURCE_DEFINITION_UNKNOWN',
    };
  }
  if (!definition.isEnabled || definition.health?.status === 'disabled') {
    return {
      status: 'stale',
      reason: 'SOURCE_DISABLED',
    };
  }
  if (definition.health?.status === 'stale') {
    return {
      status: 'stale',
      reason: 'SOURCE_HEALTH_STALE',
    };
  }
  const freshnessSeconds = definition.freshnessSeconds;
  if (!Number.isFinite(freshnessSeconds) || freshnessSeconds <= 0) {
    return {
      status: 'unknown',
      reason: 'SOURCE_FRESHNESS_WINDOW_UNKNOWN',
    };
  }
  const anchors = [
    event.observedAt,
    definition.health?.lastSuccessAt,
    definition.health?.dataFreshThrough,
    event.sourceRun?.finishedAt,
    event.sourceRun?.dataFreshThrough,
  ]
    .map((value) => validDate(value, 'source freshness anchor'))
    .filter((value): value is Date => value !== null);
  if (anchors.length === 0) {
    return {
      status: 'unknown',
      reason: 'SOURCE_FRESHNESS_ANCHOR_UNKNOWN',
    };
  }
  const freshestAt = Math.max(...anchors.map((anchor) => anchor.getTime()));
  const ageMs = Math.max(0, evaluatedAt.getTime() - freshestAt);
  if (ageMs > freshnessSeconds * 1_000) {
    return {
      status: 'stale',
      reason: 'SOURCE_FRESHNESS_WINDOW_EXCEEDED',
    };
  }
  return {
    status: 'fresh',
    reason: definition.health?.status === 'failed'
      ? 'SOURCE_LAST_SUCCESS_STILL_FRESH'
      : 'SOURCE_WITHIN_FRESHNESS_WINDOW',
  };
}

function materialUpdate(
  existing: RadarExistingMatchLifecycleInput,
  currentRevision: RadarMaterialRevisionSnapshot | null,
  previousRevision: RadarMaterialRevisionSnapshot | null,
  evaluatedAt: Date,
): {
  isMaterialUpdate: boolean;
  materialUpdatedAt: Date | null;
  materialReasonCodes: string[];
} {
  if (!existing.exists) {
    return {
      isMaterialUpdate: false,
      materialUpdatedAt: null,
      materialReasonCodes: ['INITIAL_MATCH'],
    };
  }
  if (!currentRevision) {
    return {
      isMaterialUpdate: false,
      materialUpdatedAt: null,
      materialReasonCodes: ['CURRENT_REVISION_UNKNOWN'],
    };
  }
  if (existing.lastEventRevisionId === currentRevision.id) {
    return {
      isMaterialUpdate: existing.isMaterialUpdate === true,
      materialUpdatedAt: validDate(
        existing.materialUpdatedAt,
        'materialUpdatedAt',
      ),
      materialReasonCodes: ['REVISION_ALREADY_EVALUATED'],
    };
  }
  if (!previousRevision) {
    return {
      isMaterialUpdate: false,
      materialUpdatedAt: null,
      materialReasonCodes: ['MATERIAL_BASELINE_UNKNOWN'],
    };
  }
  const detected = detectRadarMaterialUpdate(previousRevision, currentRevision);
  return {
    isMaterialUpdate: detected.isMaterialUpdate,
    materialUpdatedAt: detected.isMaterialUpdate ? evaluatedAt : null,
    materialReasonCodes: detected.reasonCodes.length > 0
      ? detected.reasonCodes
      : ['NON_MATERIAL_REVISION'],
  };
}

export function evaluateRadarMatchLifecycle(
  input: {
    event: RadarMatchLifecycleEventInput;
    geographicallyApplicable: boolean;
    existing: RadarExistingMatchLifecycleInput;
    currentRevision?: RadarMaterialRevisionSnapshot | null;
    previousRevision?: RadarMaterialRevisionSnapshot | null;
  },
  evaluatedAt: Date,
): RadarMatchLifecycleResult {
  if (!Number.isFinite(evaluatedAt.getTime())) {
    throw new TypeError('Radar match lifecycle evaluation time must be valid');
  }
  const event = {
    ...input.event,
    startAt: requiredDate(input.event.startAt, 'startAt'),
    endAt: validDate(input.event.endAt, 'endAt'),
    observedAt: validDate(input.event.observedAt, 'observedAt'),
    resolvedAt: validDate(input.event.resolvedAt, 'resolvedAt'),
    expiredAt: validDate(input.event.expiredAt, 'expiredAt'),
    retractedAt: validDate(input.event.retractedAt, 'retractedAt'),
    updatedAt: validDate(input.event.updatedAt, 'updatedAt'),
  };
  const freshness = evaluateRadarSourceFreshness(event, evaluatedAt);
  const material = materialUpdate(
    input.existing,
    input.currentRevision ?? null,
    input.previousRevision ?? null,
    evaluatedAt,
  );
  const priorVisibleFrom = validDate(
    input.existing.visibleFrom,
    'existing visibleFrom',
  );
  const visibleFrom = priorVisibleFrom ?? radarMatchVisibleFrom(event);

  if (!input.geographicallyApplicable) {
    return {
      version: RADAR_MATCH_LIFECYCLE_VERSION,
      status: 'no_longer_applicable',
      reasonCode: 'GEOGRAPHY_NO_LONGER_APPLIES',
      isVisible: false,
      visibleFrom,
      visibleUntil: evaluatedAt,
      ...material,
      sourceFreshnessStatus: freshness.status,
      sourceFreshnessReason: freshness.reason,
      noLongerApplicableAt: evaluatedAt,
      evaluatedAt,
    };
  }

  const status = radarTimingGroup(event, evaluatedAt);
  const visibleUntil = radarMatchVisibleUntil(event);
  return {
    version: RADAR_MATCH_LIFECYCLE_VERSION,
    status,
    reasonCode: status === 'recently_ended'
      ? `EVENT_${event.status.toUpperCase()}`
      : status === 'upcoming'
        ? 'EVENT_STARTS_IN_FUTURE'
        : 'EVENT_ACTIVE_NOW',
    isVisible: visibleUntil === null || visibleUntil > evaluatedAt,
    visibleFrom,
    visibleUntil,
    ...material,
    sourceFreshnessStatus: freshness.status,
    sourceFreshnessReason: freshness.reason,
    noLongerApplicableAt: null,
    evaluatedAt,
  };
}
