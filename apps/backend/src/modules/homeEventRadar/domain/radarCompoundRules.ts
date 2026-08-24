import { createHash } from 'node:crypto';
import type { RadarRecommendedAction } from './radarImpactRules';

export const RADAR_COMPOUND_RULE_VERSION = 'compound-v1' as const;

export const RADAR_COMPOUND_RULE_CODES = [
  'HEAVY_RAIN_OUTAGE_SUMP_BACKUP',
  'SMOKE_HVAC_FILTER',
  'FREEZE_OUTAGE_ELECTRIC_HEAT',
  'SEVERE_WEATHER_OPEN_ROOF_ISSUE',
  // Home Intelligence FRD Phase 5 work item 2, rule 2 of 7 (HI-CMP-002) —
  // "severe weather + unresolved maintenance or vulnerable home system."
  // The four rules above already are instances of this family (roof issue,
  // sump backup, electric heat on outage, HVAC filter); this is the fifth,
  // extending the "unresolved maintenance" side to gutter/drainage work,
  // the conventional water-intrusion vulnerability heavy rain or flood
  // risk exposes.
  'HEAVY_RAIN_UNRESOLVED_GUTTER_DRAINAGE',
] as const;

export type RadarCompoundRuleCode = typeof RADAR_COMPOUND_RULE_CODES[number];
export type RadarCompoundFactState = 'confirmed' | 'absent' | 'unknown' | 'current' | 'due';

export type RadarCompoundEventInput = {
  matchId: string;
  eventId: string;
  eventType: string;
  eventSubType?: string | null;
  severity: string;
  effectiveAt: Date | string;
  expiresAt?: Date | string | null;
  lifecycleStatus: string;
  sourceFreshnessStatus: string;
  sourceDefinitionId?: string | null;
  sourceName?: string | null;
  provider?: string | null;
  canonicalUrl?: string | null;
};

export type RadarCompoundPropertyFacts = {
  hasSumpPump: boolean | null;
  hasSumpPumpBackup: boolean | null;
  primaryHeatingFuel: string | null;
  hvacFilterState: 'current' | 'due' | 'unknown';
  unresolvedRoofIssue: boolean | null;
  unresolvedGutterOrDrainageIssue: boolean | null;
};

export type RadarCompoundSourceEvidence = {
  matchId: string;
  eventId: string;
  eventType: string;
  eventSubType: string | null;
  severity: string;
  effectiveAt: string;
  expiresAt: string | null;
  sourceDefinitionId: string | null;
  sourceName: string | null;
  provider: string | null;
  canonicalUrl: string | null;
};

export type RadarCompoundFactEvidence = {
  factKey: string;
  state: RadarCompoundFactState;
  value: string | boolean | null;
};

export type RadarCompoundInsight = {
  ruleCode: RadarCompoundRuleCode;
  ruleVersion: typeof RADAR_COMPOUND_RULE_VERSION;
  correlationKey: string;
  title: string;
  summary: string;
  sourceMatchIds: string[];
  sourceEventIds: string[];
  sourceEvidence: RadarCompoundSourceEvidence[];
  factEvidence: RadarCompoundFactEvidence[];
  recommendedActions: RadarRecommendedAction[];
  severityPolicy: 'preserve_constituent_severity';
  derivedSeverity: null;
};

const ACTIVE_MATCH_LIFECYCLES = new Set(['now', 'upcoming']);
const UPCOMING_HORIZON_MS = 72 * 60 * 60 * 1_000;
const WEATHER_ROOF_TYPES = new Set([
  'weather',
  'hail',
  'wind',
  'heavy_rain',
  'flood_risk',
]);
const SEVERE_PROVIDER_LEVELS = new Set(['high', 'critical', 'severe', 'extreme']);
// Water-intrusion weather types only — wind/hail are excluded because they
// bear on the roof's structural integrity (WEATHER_ROOF_TYPES), not on
// whether water is being carried away from the foundation.
const WATER_MANAGEMENT_WEATHER_TYPES = new Set(['heavy_rain', 'flood_risk']);

function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isEligible(event: RadarCompoundEventInput, evaluatedAt: Date): boolean {
  if (!ACTIVE_MATCH_LIFECYCLES.has(event.lifecycleStatus)) return false;
  if (event.sourceFreshnessStatus !== 'fresh') return false;
  const effectiveAt = asDate(event.effectiveAt);
  const expiresAt = asDate(event.expiresAt);
  if (!effectiveAt) return false;
  if (
    effectiveAt.getTime() > evaluatedAt.getTime()
    && (
      event.lifecycleStatus !== 'upcoming'
      || effectiveAt.getTime() - evaluatedAt.getTime() > UPCOMING_HORIZON_MS
    )
  ) {
    return false;
  }
  return !expiresAt || expiresAt.getTime() >= evaluatedAt.getTime();
}

function windowsOverlap(
  left: RadarCompoundEventInput,
  right: RadarCompoundEventInput,
): boolean {
  const leftStart = asDate(left.effectiveAt);
  const rightStart = asDate(right.effectiveAt);
  if (!leftStart || !rightStart) return false;
  const leftEnd = asDate(left.expiresAt)?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightEnd = asDate(right.expiresAt)?.getTime() ?? Number.POSITIVE_INFINITY;
  return leftStart.getTime() <= rightEnd && rightStart.getTime() <= leftEnd;
}

function sourceEvidence(event: RadarCompoundEventInput): RadarCompoundSourceEvidence {
  return {
    matchId: event.matchId,
    eventId: event.eventId,
    eventType: event.eventType,
    eventSubType: event.eventSubType ?? null,
    severity: event.severity,
    effectiveAt: asDate(event.effectiveAt)?.toISOString() ?? String(event.effectiveAt),
    expiresAt: asDate(event.expiresAt)?.toISOString() ?? null,
    sourceDefinitionId: event.sourceDefinitionId ?? null,
    sourceName: event.sourceName ?? null,
    provider: event.provider ?? null,
    canonicalUrl: event.canonicalUrl ?? null,
  };
}

function correlationKey(
  propertyId: string,
  ruleCode: RadarCompoundRuleCode,
  events: RadarCompoundEventInput[],
): string {
  const constituentKey = events.map((event) => event.matchId).sort().join('|');
  return createHash('sha256')
    .update(`${RADAR_COMPOUND_RULE_VERSION}|${propertyId}|${ruleCode}|${constituentKey}`)
    .digest('hex');
}

function insight(input: {
  propertyId: string;
  ruleCode: RadarCompoundRuleCode;
  title: string;
  summary: string;
  events: RadarCompoundEventInput[];
  facts: RadarCompoundFactEvidence[];
  actions: RadarRecommendedAction[];
}): RadarCompoundInsight {
  const events = [...input.events].sort((left, right) => left.matchId.localeCompare(right.matchId));
  return {
    ruleCode: input.ruleCode,
    ruleVersion: RADAR_COMPOUND_RULE_VERSION,
    correlationKey: correlationKey(input.propertyId, input.ruleCode, events),
    title: input.title,
    summary: input.summary,
    sourceMatchIds: events.map((event) => event.matchId),
    sourceEventIds: events.map((event) => event.eventId),
    sourceEvidence: events.map(sourceEvidence),
    factEvidence: input.facts,
    recommendedActions: input.actions,
    severityPolicy: 'preserve_constituent_severity',
    derivedSeverity: null,
  };
}

function action(
  code: string,
  label: string,
  priority: RadarRecommendedAction['priority'],
  responsibilityScope?: RadarRecommendedAction['responsibilityScope'],
): RadarRecommendedAction {
  return {
    code,
    label,
    priority,
    ...(responsibilityScope ? { responsibilityScope } : {}),
  };
}

function uniqueInsights(insights: RadarCompoundInsight[]): RadarCompoundInsight[] {
  return [...new Map(
    insights
      .sort((left, right) => left.correlationKey.localeCompare(right.correlationKey))
      .map((candidate) => [candidate.correlationKey, candidate]),
  ).values()];
}

export function evaluateRadarCompoundRules(input: {
  propertyId: string;
  events: RadarCompoundEventInput[];
  facts: RadarCompoundPropertyFacts;
  evaluatedAt: Date;
}): RadarCompoundInsight[] {
  if (!Number.isFinite(input.evaluatedAt.getTime())) {
    throw new TypeError('Compound Radar evaluation time must be valid');
  }
  const events = input.events.filter((event) => isEligible(event, input.evaluatedAt));
  const insights: RadarCompoundInsight[] = [];
  const rainEvents = events.filter((event) =>
    event.eventType === 'heavy_rain' || event.eventType === 'flood_risk');
  const outageEvents = events.filter((event) => event.eventType === 'utility_outage');
  const freezeEvents = events.filter((event) => event.eventType === 'freeze');
  const smokeEvents = events.filter((event) => event.eventType === 'wildfire_smoke');

  if (input.facts.hasSumpPump === true && input.facts.hasSumpPumpBackup !== true) {
    for (const rain of rainEvents) {
      for (const outage of outageEvents) {
        if (!windowsOverlap(rain, outage)) continue;
        const backupUnknown = input.facts.hasSumpPumpBackup === null;
        insights.push(insight({
          propertyId: input.propertyId,
          ruleCode: 'HEAVY_RAIN_OUTAGE_SUMP_BACKUP',
          title: 'Rain and outage may affect sump protection',
          summary: backupUnknown
            ? 'Heavy rain and a utility outage overlap, and a sump-pump backup is not confirmed for this home.'
            : 'Heavy rain and a utility outage overlap, and this home has a sump pump with no recorded backup.',
          events: [rain, outage],
          facts: [
            { factKey: 'property.hasSumpPump', state: 'confirmed', value: true },
            {
              factKey: 'property.hasSumpPumpBackup',
              state: backupUnknown ? 'unknown' : 'absent',
              value: input.facts.hasSumpPumpBackup,
            },
          ],
          actions: [
            action(
              'INSPECT_SUMP_PUMP',
              backupUnknown
                ? 'Verify the sump pump has a working battery or water-powered backup'
                : 'Test the sump pump and backup plan before power is interrupted',
              'high',
              'PLUMBING',
            ),
          ],
        }));
      }
    }
  }

  const electricHeat = ['electric', 'electricity']
    .includes(input.facts.primaryHeatingFuel?.trim().toLowerCase() ?? '');
  if (electricHeat) {
    for (const freeze of freezeEvents) {
      for (const outage of outageEvents) {
        if (!windowsOverlap(freeze, outage)) continue;
        insights.push(insight({
          propertyId: input.propertyId,
          ruleCode: 'FREEZE_OUTAGE_ELECTRIC_HEAT',
          title: 'Freeze and outage affect electric heat',
          summary: 'A freeze and utility outage overlap while this home records electric primary heat.',
          events: [freeze, outage],
          facts: [
            {
              factKey: 'property.primaryHeatingFuel',
              state: 'confirmed',
              value: input.facts.primaryHeatingFuel,
            },
          ],
          actions: [
            action(
              'PREPARE_BACKUP_HEAT',
              'Prepare a safe backup heat plan and follow official outage updates',
              'high',
              'HVAC',
            ),
          ],
        }));
      }
    }
  }

  if (input.facts.hvacFilterState !== 'current') {
    for (const smoke of smokeEvents) {
      insights.push(insight({
        propertyId: input.propertyId,
        ruleCode: 'SMOKE_HVAC_FILTER',
        title: 'Smoke conditions and HVAC filter readiness',
        summary: input.facts.hvacFilterState === 'due'
          ? 'Wildfire smoke is active and an HVAC filter task is due or unresolved.'
          : 'Wildfire smoke is active and recent HVAC filter maintenance is not confirmed.',
        events: [smoke],
        facts: [{
          factKey: 'maintenance.hvacFilterState',
          state: input.facts.hvacFilterState,
          value: input.facts.hvacFilterState,
        }],
        actions: [
          action(
            'CHECK_AIR_FILTERS',
            'Check the HVAC filter and replace it if dirty or overdue',
            'high',
            'HVAC',
          ),
        ],
      }));
    }
  }

  if (input.facts.unresolvedRoofIssue === true) {
    for (const weather of events) {
      if (
        !WEATHER_ROOF_TYPES.has(weather.eventType)
        || !SEVERE_PROVIDER_LEVELS.has(weather.severity)
      ) {
        continue;
      }
      insights.push(insight({
        propertyId: input.propertyId,
        ruleCode: 'SEVERE_WEATHER_OPEN_ROOF_ISSUE',
        title: 'Severe weather overlaps an open roof issue',
        summary: 'A provider-reported severe weather event overlaps an unresolved roof maintenance issue.',
        events: [weather],
        facts: [{
          factKey: 'maintenance.unresolvedRoofIssue',
          state: 'confirmed',
          value: true,
        }],
        actions: [
          action(
            'INSPECT_ROOF',
            'Review the open roof issue and inspect safely after conditions pass',
            'high',
            'ROOF',
          ),
        ],
      }));
    }
  }

  if (input.facts.unresolvedGutterOrDrainageIssue === true) {
    for (const weather of events) {
      if (
        !WATER_MANAGEMENT_WEATHER_TYPES.has(weather.eventType)
        || !SEVERE_PROVIDER_LEVELS.has(weather.severity)
      ) {
        continue;
      }
      insights.push(insight({
        propertyId: input.propertyId,
        ruleCode: 'HEAVY_RAIN_UNRESOLVED_GUTTER_DRAINAGE',
        title: 'Heavy rain overlaps an open gutter or drainage issue',
        summary: 'A provider-reported heavy rain or flood-risk event overlaps an unresolved gutter or drainage maintenance issue.',
        events: [weather],
        facts: [{
          factKey: 'maintenance.unresolvedGutterOrDrainageIssue',
          state: 'confirmed',
          value: true,
        }],
        actions: [
          action(
            'CLEAR_GUTTERS_AND_DRAINAGE',
            'Clear gutters and drainage paths, or route water away from the foundation, before rain accumulates',
            'high',
            'BUILDING_EXTERIOR',
          ),
        ],
      }));
    }
  }

  return uniqueInsights(insights);
}
