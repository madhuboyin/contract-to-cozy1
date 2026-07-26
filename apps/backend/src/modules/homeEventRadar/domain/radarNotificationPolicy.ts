import type {
  RadarNotificationPreferenceProjection,
  RadarNotificationChannel,
} from './radarNotificationPreferences';

export const RADAR_NOTIFICATION_POLICY_VERSION = 'radar-notification-policy-v1';

export const RADAR_NOTIFICATION_REASON_CODES = [
  'TEST_OR_SYNTHETIC_SOURCE',
  'PREFERENCES_DISABLED',
  'CATEGORY_DISABLED',
  'TERMINAL_NON_INTERRUPTIVE',
  'NOT_MATERIAL_REVISION',
  'CONFIDENCE_BELOW_FLOOR',
  'BELOW_MINIMUM_SEVERITY',
  'BELOW_MINIMUM_IMPACT',
  'CHANNEL_UNAVAILABLE',
  'NO_MATERIAL_ESCALATION',
  'ELIGIBLE_INITIAL_MATCH',
  'ELIGIBLE_MATERIAL_ESCALATION',
  'USER_IMMEDIATE_MODE',
  'USER_DIGEST_MODE',
  'FUTURE_EVENT_DIGEST',
  'QUIET_HOURS_DEFERRED',
  'CRITICAL_SAFETY_OVERRIDE',
] as const;

export type RadarNotificationReasonCode =
  (typeof RADAR_NOTIFICATION_REASON_CODES)[number];
export type RadarNotificationDecisionOutcome =
  | 'immediate'
  | 'digest'
  | 'deferred'
  | 'suppressed';
export type RadarNotificationTiming = 'active' | 'imminent' | 'future' | 'ended';

export type RadarNotificationPolicyEvent = {
  sourceFamily: string;
  severity: string;
  impact: string;
  confidence: string | null;
  lifecycleStatus: string;
  effectiveAt: Date | string;
  expiresAt?: Date | string | null;
  providerUrgency?: string | null;
  certainty?: string | null;
  isSynthetic: boolean;
};

export type RadarNotificationPreviousDecision = {
  outcome: RadarNotificationDecisionOutcome;
  severity: string;
  impact: string;
  timing: RadarNotificationTiming;
} | null;

export type RadarNotificationPolicyInput = {
  preference: RadarNotificationPreferenceProjection;
  availableChannels: RadarNotificationChannel[];
  event: RadarNotificationPolicyEvent;
  isInitialMatch: boolean;
  isMaterialRevision: boolean;
  previousDecision: RadarNotificationPreviousDecision;
  evaluatedAt: Date;
};

export type RadarNotificationPolicyDecision = {
  policyVersion: typeof RADAR_NOTIFICATION_POLICY_VERSION;
  outcome: RadarNotificationDecisionOutcome;
  reasonCodes: RadarNotificationReasonCode[];
  eligibleChannels: RadarNotificationChannel[];
  deferredUntil: Date | null;
  criticalOverrideApplied: boolean;
  normalized: {
    severity: 'info' | 'low' | 'moderate' | 'high' | 'severe' | 'extreme';
    impact: 'none' | 'low' | 'moderate' | 'high' | 'critical';
    confidence: 'low' | 'medium' | 'high' | 'verified';
    timing: RadarNotificationTiming;
  };
};

const SEVERITY_RANK = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  severe: 4,
  extreme: 5,
} as const;
const IMPACT_RANK = {
  none: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
} as const;
const CONFIDENCE_RANK = {
  low: 0,
  medium: 1,
  high: 2,
  verified: 3,
} as const;
const TIMING_RANK: Record<RadarNotificationTiming, number> = {
  ended: 0,
  future: 1,
  imminent: 2,
  active: 3,
};

function normalizeSeverity(
  value: string,
): RadarNotificationPolicyDecision['normalized']['severity'] {
  if (value === 'medium') return 'moderate';
  if (value === 'critical') return 'severe';
  if (value in SEVERITY_RANK) {
    return value as RadarNotificationPolicyDecision['normalized']['severity'];
  }
  return 'info';
}

function normalizeImpact(
  value: string,
): RadarNotificationPolicyDecision['normalized']['impact'] {
  if (value === 'watch') return 'low';
  if (value in IMPACT_RANK) {
    return value as RadarNotificationPolicyDecision['normalized']['impact'];
  }
  return 'none';
}

function normalizeConfidence(
  value: string | null,
): RadarNotificationPolicyDecision['normalized']['confidence'] {
  if (value && value in CONFIDENCE_RANK) {
    return value as RadarNotificationPolicyDecision['normalized']['confidence'];
  }
  return 'low';
}

function validDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function classifyRadarNotificationTiming(
  event: Pick<RadarNotificationPolicyEvent, 'lifecycleStatus' | 'effectiveAt' | 'expiresAt'>,
  evaluatedAt: Date,
): RadarNotificationTiming {
  if (
    [
      'resolved',
      'expired',
      'retracted',
      'archived',
      'recently_ended',
      'no_longer_applicable',
    ].includes(event.lifecycleStatus)
  ) {
    return 'ended';
  }
  const expiresAt = validDate(event.expiresAt);
  if (expiresAt && expiresAt.getTime() <= evaluatedAt.getTime()) return 'ended';
  const effectiveAt = validDate(event.effectiveAt);
  if (!effectiveAt || effectiveAt.getTime() <= evaluatedAt.getTime()) return 'active';
  return effectiveAt.getTime() - evaluatedAt.getTime() <= 24 * 60 * 60 * 1_000
    ? 'imminent'
    : 'future';
}

function localMinuteOfDay(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return (hour * 60) + minute;
}

export function isRadarQuietHours(
  at: Date,
  timezone: string,
  start: string,
  end: string,
): boolean {
  const current = localMinuteOfDay(at, timezone);
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  const startAt = (startHour * 60) + startMinute;
  const endAt = (endHour * 60) + endMinute;
  if (startAt < endAt) return current >= startAt && current < endAt;
  return current >= startAt || current < endAt;
}

function expectedQuietEndDelta(
  current: number,
  start: number,
  end: number,
): number {
  if (start < end) {
    return current >= start ? (1_440 - current) + end : end - current;
  }
  return current >= start ? (1_440 - current) + end : end - current;
}

export function radarQuietHoursEnd(
  at: Date,
  timezone: string,
  start: string,
  end: string,
): Date {
  const current = localMinuteOfDay(at, timezone);
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  const expectedDelta = expectedQuietEndDelta(
    current,
    (startHour * 60) + startMinute,
    (endHour * 60) + endMinute,
  );
  // Search around the wall-clock estimate so DST boundaries resolve to the
  // first real instant outside quiet hours.
  const searchStart = Math.max(1, expectedDelta - 180);
  const searchEnd = Math.min(1_620, expectedDelta + 180);
  for (let delta = searchStart; delta <= searchEnd; delta += 1) {
    const candidate = new Date(at.getTime() + (delta * 60 * 1_000));
    if (!isRadarQuietHours(candidate, timezone, start, end)) return candidate;
  }
  return new Date(at.getTime() + (expectedDelta * 60 * 1_000));
}

function reviewedCriticalSafetyOverride(
  input: RadarNotificationPolicyInput,
  normalized: RadarNotificationPolicyDecision['normalized'],
): boolean {
  return input.preference.criticalSafetyOverrideEnabled
    && ['weather', 'air_quality', 'disaster'].includes(input.event.sourceFamily)
    && normalized.severity === 'extreme'
    && ['high', 'critical'].includes(normalized.impact)
    && normalized.confidence === 'verified'
    && ['active', 'imminent'].includes(normalized.timing)
    && input.event.providerUrgency === 'immediate'
    && input.event.certainty === 'observed'
    && !input.event.isSynthetic;
}

function suppressed(
  code: RadarNotificationReasonCode,
  normalized: RadarNotificationPolicyDecision['normalized'],
): RadarNotificationPolicyDecision {
  return {
    policyVersion: RADAR_NOTIFICATION_POLICY_VERSION,
    outcome: 'suppressed',
    reasonCodes: [code],
    eligibleChannels: [],
    deferredUntil: null,
    criticalOverrideApplied: false,
    normalized,
  };
}

function isPriorNotificationEligible(
  previous: RadarNotificationPreviousDecision,
): previous is Exclude<RadarNotificationPreviousDecision, null> {
  return Boolean(previous && previous.outcome !== 'suppressed');
}

export function evaluateRadarNotificationPolicy(
  input: RadarNotificationPolicyInput,
): RadarNotificationPolicyDecision {
  if (!Number.isFinite(input.evaluatedAt.getTime())) {
    throw new TypeError('Radar notification evaluation time must be valid');
  }
  const normalized = {
    severity: normalizeSeverity(input.event.severity),
    impact: normalizeImpact(input.event.impact),
    confidence: normalizeConfidence(input.event.confidence),
    timing: classifyRadarNotificationTiming(input.event, input.evaluatedAt),
  };
  if (input.event.isSynthetic) {
    return suppressed('TEST_OR_SYNTHETIC_SOURCE', normalized);
  }
  if (!input.preference.isEnabled) {
    return suppressed('PREFERENCES_DISABLED', normalized);
  }
  if (!input.preference.enabledCategories.includes(
    input.event.sourceFamily as never,
  )) {
    return suppressed('CATEGORY_DISABLED', normalized);
  }
  if (normalized.timing === 'ended') {
    return suppressed('TERMINAL_NON_INTERRUPTIVE', normalized);
  }
  if (!input.isInitialMatch && !input.isMaterialRevision) {
    return suppressed('NOT_MATERIAL_REVISION', normalized);
  }
  if (CONFIDENCE_RANK[normalized.confidence] < CONFIDENCE_RANK.medium) {
    return suppressed('CONFIDENCE_BELOW_FLOOR', normalized);
  }
  if (
    SEVERITY_RANK[normalized.severity]
    < SEVERITY_RANK[input.preference.minimumSeverity]
  ) {
    return suppressed('BELOW_MINIMUM_SEVERITY', normalized);
  }
  if (
    IMPACT_RANK[normalized.impact]
    < IMPACT_RANK[input.preference.minimumImpact]
  ) {
    return suppressed('BELOW_MINIMUM_IMPACT', normalized);
  }
  const available = new Set(input.availableChannels);
  const eligibleChannels = input.preference.channels.filter((channel) =>
    available.has(channel)
  );
  if (!eligibleChannels.length) {
    return suppressed('CHANNEL_UNAVAILABLE', normalized);
  }
  if (isPriorNotificationEligible(input.previousDecision)) {
    const previousSeverity = normalizeSeverity(input.previousDecision.severity);
    const previousImpact = normalizeImpact(input.previousDecision.impact);
    const escalated = (
      SEVERITY_RANK[normalized.severity] > SEVERITY_RANK[previousSeverity]
      || IMPACT_RANK[normalized.impact] > IMPACT_RANK[previousImpact]
      || TIMING_RANK[normalized.timing] > TIMING_RANK[input.previousDecision.timing]
    );
    if (!escalated) return suppressed('NO_MATERIAL_ESCALATION', normalized);
  }

  const eligibilityReason: RadarNotificationReasonCode = input.isInitialMatch
    ? 'ELIGIBLE_INITIAL_MATCH'
    : 'ELIGIBLE_MATERIAL_ESCALATION';
  const criticalOverrideApplied = reviewedCriticalSafetyOverride(input, normalized);
  if (criticalOverrideApplied) {
    return {
      policyVersion: RADAR_NOTIFICATION_POLICY_VERSION,
      outcome: 'immediate',
      reasonCodes: [eligibilityReason, 'CRITICAL_SAFETY_OVERRIDE'],
      eligibleChannels,
      deferredUntil: null,
      criticalOverrideApplied: true,
      normalized,
    };
  }
  if (input.preference.deliveryMode === 'digest' || normalized.timing === 'future') {
    return {
      policyVersion: RADAR_NOTIFICATION_POLICY_VERSION,
      outcome: 'digest',
      reasonCodes: [
        eligibilityReason,
        input.preference.deliveryMode === 'digest'
          ? 'USER_DIGEST_MODE'
          : 'FUTURE_EVENT_DIGEST',
      ],
      eligibleChannels,
      deferredUntil: null,
      criticalOverrideApplied: false,
      normalized,
    };
  }
  if (
    input.preference.quietHours
    && isRadarQuietHours(
      input.evaluatedAt,
      input.preference.timezone,
      input.preference.quietHours.start,
      input.preference.quietHours.end,
    )
  ) {
    return {
      policyVersion: RADAR_NOTIFICATION_POLICY_VERSION,
      outcome: 'deferred',
      reasonCodes: [eligibilityReason, 'QUIET_HOURS_DEFERRED'],
      eligibleChannels,
      deferredUntil: radarQuietHoursEnd(
        input.evaluatedAt,
        input.preference.timezone,
        input.preference.quietHours.start,
        input.preference.quietHours.end,
      ),
      criticalOverrideApplied: false,
      normalized,
    };
  }
  return {
    policyVersion: RADAR_NOTIFICATION_POLICY_VERSION,
    outcome: 'immediate',
    reasonCodes: [eligibilityReason, 'USER_IMMEDIATE_MODE'],
    eligibleChannels,
    deferredUntil: null,
    criticalOverrideApplied: false,
    normalized,
  };
}
