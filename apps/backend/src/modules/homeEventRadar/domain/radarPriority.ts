export const RADAR_PRIORITY_VERSION = 'priority-v1';

export const RADAR_PRIORITY_WEIGHTS = {
  severity: 0.25,
  impact: 0.25,
  confidence: 0.15,
  timing: 0.15,
  materialUpdate: 0.05,
  activeIncident: 0.10,
  userState: 0.05,
} as const;

export type RadarPriorityBand = 'low' | 'medium' | 'high' | 'urgent';
export type RadarPriorityComponentName = keyof typeof RADAR_PRIORITY_WEIGHTS;
export type RadarPriorityUserState =
  | 'new'
  | 'seen'
  | 'saved'
  | 'dismissed'
  | 'acted_on';

export interface RadarPriorityInput {
  severity: string;
  impactLevel: string;
  confidence: string | null | undefined;
  effectiveAt: Date | string;
  expiresAt?: Date | string | null;
  lifecycleStatus: string;
  isMaterialUpdate: boolean;
  materiallyUpdatedAt?: Date | string | null;
  hasActiveIncident: boolean;
  userState: RadarPriorityUserState;
}

export interface RadarPriorityComponent {
  name: RadarPriorityComponentName;
  weight: number;
  score: number;
  weightedScore: number;
  reasonCode: string;
}

export interface RadarPriorityTieBreakers {
  effectiveAt: string;
  createdAt?: string;
  matchId?: string;
}

export interface RadarPriorityResult {
  version: typeof RADAR_PRIORITY_VERSION;
  score: number;
  band: RadarPriorityBand;
  components: RadarPriorityComponent[];
  evaluatedAt: string;
  orderingOnly: true;
}

type ComponentEvaluation = {
  score: number;
  reasonCode: string;
};

const TERMINAL_LIFECYCLE_STATUSES = new Set([
  'resolved',
  'expired',
  'retracted',
  'archived',
]);

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function rounded(value: number, precision = 4): number {
  return Number(clamp(value).toFixed(precision));
}

function timestamp(value: Date | string | null | undefined, field: string): number {
  if (!value) {
    throw new TypeError(`Radar priority ${field} must be provided`);
  }
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`Radar priority ${field} must be valid`);
  }
  return parsed;
}

function optionalTimestamp(
  value: Date | string | null | undefined,
  field: string,
): number | null {
  if (value === null || value === undefined) return null;
  return timestamp(value, field);
}

function severityComponent(severity: string): ComponentEvaluation {
  const normalized = severity.trim().toLowerCase();
  const values: Record<string, number> = {
    info: 0.05,
    low: 0.25,
    moderate: 0.5,
    medium: 0.5,
    high: 0.75,
    severe: 0.9,
    critical: 1,
    extreme: 1,
  };
  const score = values[normalized] ?? 0.05;
  return {
    score,
    reasonCode: values[normalized] === undefined
      ? 'SEVERITY_UNKNOWN'
      : `SEVERITY_${normalized.toUpperCase()}`,
  };
}

function impactComponent(impactLevel: string): ComponentEvaluation {
  const normalized = impactLevel.trim().toLowerCase();
  const values: Record<string, number> = {
    none: 0,
    watch: 0.3,
    low: 0.3,
    moderate: 0.7,
    high: 1,
    critical: 1,
  };
  const score = values[normalized] ?? 0;
  return {
    score,
    reasonCode: values[normalized] === undefined
      ? 'IMPACT_UNKNOWN'
      : `IMPACT_${normalized.toUpperCase()}`,
  };
}

function confidenceComponent(
  confidence: string | null | undefined,
): ComponentEvaluation {
  const normalized = confidence?.trim().toLowerCase() ?? 'unknown';
  const values: Record<string, number> = {
    low: 0.3,
    medium: 0.65,
    high: 0.9,
    verified: 1,
    unknown: 0.2,
  };
  const score = values[normalized] ?? values.unknown;
  return {
    score,
    reasonCode: values[normalized] === undefined || normalized === 'unknown'
      ? 'CONFIDENCE_UNKNOWN'
      : `CONFIDENCE_${normalized.toUpperCase()}`,
  };
}

function timingComponent(
  input: RadarPriorityInput,
  evaluatedAtMs: number,
): ComponentEvaluation {
  const lifecycle = input.lifecycleStatus.trim().toLowerCase();
  if (TERMINAL_LIFECYCLE_STATUSES.has(lifecycle)) {
    return { score: 0, reasonCode: 'TIMING_TERMINAL' };
  }

  const effectiveAtMs = timestamp(input.effectiveAt, 'effectiveAt');
  const expiresAtMs = optionalTimestamp(input.expiresAt, 'expiresAt');
  const hoursToOnset = (effectiveAtMs - evaluatedAtMs) / 3_600_000;
  if (hoursToOnset > 0) {
    if (hoursToOnset <= 6) return { score: 1, reasonCode: 'ONSET_WITHIN_6_HOURS' };
    if (hoursToOnset <= 24) return { score: 0.9, reasonCode: 'ONSET_WITHIN_24_HOURS' };
    if (hoursToOnset <= 72) return { score: 0.75, reasonCode: 'ONSET_WITHIN_72_HOURS' };
    if (hoursToOnset <= 168) return { score: 0.55, reasonCode: 'ONSET_WITHIN_7_DAYS' };
    if (hoursToOnset <= 720) return { score: 0.3, reasonCode: 'ONSET_WITHIN_30_DAYS' };
    return { score: 0.15, reasonCode: 'ONSET_BEYOND_30_DAYS' };
  }

  if (expiresAtMs === null) {
    return { score: 0.65, reasonCode: 'ACTIVE_EXPIRATION_UNKNOWN' };
  }
  const hoursToExpiration = (expiresAtMs - evaluatedAtMs) / 3_600_000;
  if (hoursToExpiration <= 0) {
    return { score: 0, reasonCode: 'EXPIRATION_REACHED' };
  }
  if (hoursToExpiration <= 6) {
    return { score: 0.45, reasonCode: 'ACTIVE_ENDING_WITHIN_6_HOURS' };
  }
  if (hoursToExpiration <= 24) {
    return { score: 0.65, reasonCode: 'ACTIVE_ENDING_WITHIN_24_HOURS' };
  }
  if (hoursToExpiration <= 72) {
    return { score: 0.85, reasonCode: 'ACTIVE_THROUGH_72_HOURS' };
  }
  return { score: 0.75, reasonCode: 'ACTIVE_LONGER_TERM' };
}

function materialUpdateComponent(
  input: RadarPriorityInput,
  evaluatedAtMs: number,
): ComponentEvaluation {
  if (!input.isMaterialUpdate) {
    return { score: 0, reasonCode: 'NO_MATERIAL_UPDATE' };
  }
  const updatedAtMs = optionalTimestamp(
    input.materiallyUpdatedAt,
    'materiallyUpdatedAt',
  );
  if (updatedAtMs === null) {
    return { score: 0, reasonCode: 'MATERIAL_UPDATE_TIME_UNKNOWN' };
  }
  const ageHours = Math.max(0, evaluatedAtMs - updatedAtMs) / 3_600_000;
  if (ageHours <= 24) {
    return { score: 1, reasonCode: 'MATERIAL_UPDATE_WITHIN_24_HOURS' };
  }
  if (ageHours <= 72) {
    return { score: 0.5, reasonCode: 'MATERIAL_UPDATE_WITHIN_72_HOURS' };
  }
  return { score: 0, reasonCode: 'MATERIAL_UPDATE_STALE' };
}

function activeIncidentComponent(hasActiveIncident: boolean): ComponentEvaluation {
  return hasActiveIncident
    ? { score: 1, reasonCode: 'ACTIVE_INCIDENT_LINKED' }
    : { score: 0, reasonCode: 'NO_ACTIVE_INCIDENT' };
}

function userStateComponent(userState: RadarPriorityUserState): ComponentEvaluation {
  const values: Record<RadarPriorityUserState, number> = {
    new: 0.6,
    seen: 0.3,
    saved: 1,
    dismissed: 0,
    acted_on: 0.1,
  };
  return {
    score: values[userState],
    reasonCode: `USER_STATE_${userState.toUpperCase()}`,
  };
}

export function radarPriorityBand(score: number): RadarPriorityBand {
  if (!Number.isFinite(score)) {
    throw new TypeError('Radar priority score must be finite');
  }
  if (score >= 80) return 'urgent';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

/**
 * Pure feed-ordering calculation. The output is bounded to 0–100 and is not
 * a probability, provider severity, property-impact claim, or notification
 * policy decision.
 */
export function computeRadarPriority(
  input: RadarPriorityInput,
  evaluatedAt: Date,
): RadarPriorityResult {
  const evaluatedAtMs = evaluatedAt.getTime();
  if (!Number.isFinite(evaluatedAtMs)) {
    throw new TypeError('Radar priority evaluation time must be valid');
  }

  const evaluations: Record<RadarPriorityComponentName, ComponentEvaluation> = {
    severity: severityComponent(input.severity),
    impact: impactComponent(input.impactLevel),
    confidence: confidenceComponent(input.confidence),
    timing: timingComponent(input, evaluatedAtMs),
    materialUpdate: materialUpdateComponent(input, evaluatedAtMs),
    activeIncident: activeIncidentComponent(input.hasActiveIncident),
    userState: userStateComponent(input.userState),
  };
  const components = (
    Object.keys(RADAR_PRIORITY_WEIGHTS) as RadarPriorityComponentName[]
  ).map((name) => {
    const weight = RADAR_PRIORITY_WEIGHTS[name];
    const score = rounded(evaluations[name].score);
    return {
      name,
      weight,
      score,
      weightedScore: rounded(score * weight),
      reasonCode: evaluations[name].reasonCode,
    };
  });
  const score = Number((
    components.reduce(
      (sum, component) => sum + component.score * component.weight,
      0,
    ) * 100
  ).toFixed(3));
  return {
    version: RADAR_PRIORITY_VERSION,
    score,
    band: radarPriorityBand(score),
    components,
    evaluatedAt: evaluatedAt.toISOString(),
    orderingOnly: true,
  };
}

function tieTimestamp(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Stable ordering: score descending, effective time ascending, creation time
 * descending, then match ID descending.
 */
export function compareRadarPriority(
  left: RadarPriorityResult & RadarPriorityTieBreakers,
  right: RadarPriorityResult & RadarPriorityTieBreakers,
): number {
  if (left.score !== right.score) return right.score - left.score;
  const effective = tieTimestamp(left.effectiveAt, Number.MAX_SAFE_INTEGER)
    - tieTimestamp(right.effectiveAt, Number.MAX_SAFE_INTEGER);
  if (effective !== 0) return effective;
  const created = tieTimestamp(right.createdAt, 0) - tieTimestamp(left.createdAt, 0);
  if (created !== 0) return created;
  return (right.matchId ?? '').localeCompare(left.matchId ?? '');
}
