import type { Prisma } from '@prisma/client';

export const RADAR_FILTER_LIFECYCLES = ['now', 'upcoming', 'recently_ended'] as const;
export const RADAR_FILTER_SOURCE_FAMILIES = [
  'weather',
  'air_quality',
  'disaster',
  'utility',
  'tax',
  'insurance',
  'other',
] as const;
export const RADAR_FILTER_SEVERITIES = ['info', 'low', 'moderate', 'high', 'severe'] as const;
export const RADAR_FILTER_IMPACTS = ['none', 'low', 'moderate', 'high'] as const;
export const RADAR_FILTER_CONFIDENCE = ['low', 'medium', 'high', 'verified'] as const;
export const RADAR_FILTER_USER_STATES = ['new', 'seen', 'saved', 'dismissed', 'acted_on'] as const;
export const RADAR_FILTER_ATTENTION = ['new', 'updated'] as const;

export type RadarFilterLifecycle = (typeof RADAR_FILTER_LIFECYCLES)[number];
export type RadarFilterSourceFamily = (typeof RADAR_FILTER_SOURCE_FAMILIES)[number];
export type RadarFilterSeverity = (typeof RADAR_FILTER_SEVERITIES)[number];
export type RadarFilterImpact = (typeof RADAR_FILTER_IMPACTS)[number];
export type RadarFilterConfidence = (typeof RADAR_FILTER_CONFIDENCE)[number];
export type RadarFilterUserState = (typeof RADAR_FILTER_USER_STATES)[number];
export type RadarFilterAttention = (typeof RADAR_FILTER_ATTENTION)[number];

export type RadarFeedFilters = {
  lifecycle?: RadarFilterLifecycle[];
  sourceFamily?: RadarFilterSourceFamily[];
  severity?: RadarFilterSeverity[];
  impact?: RadarFilterImpact[];
  confidence?: RadarFilterConfidence[];
  state?: RadarFilterUserState[];
  attention?: RadarFilterAttention[];
};

export type NormalizedRadarFeedFilters = {
  lifecycle: RadarFilterLifecycle[];
  sourceFamily: RadarFilterSourceFamily[];
  severity: RadarFilterSeverity[];
  impact: RadarFilterImpact[];
  confidence: RadarFilterConfidence[];
  state: RadarFilterUserState[];
  attention: RadarFilterAttention[];
};

function orderedUnique<T extends string>(values: T[] | undefined, order: readonly T[]): T[] {
  if (!values?.length) return [];
  const selected = new Set(values);
  return order.filter((value) => selected.has(value));
}

export function normalizeRadarFeedFilters(filters: RadarFeedFilters = {}): NormalizedRadarFeedFilters {
  return {
    lifecycle: orderedUnique(filters.lifecycle, RADAR_FILTER_LIFECYCLES),
    sourceFamily: orderedUnique(filters.sourceFamily, RADAR_FILTER_SOURCE_FAMILIES),
    severity: orderedUnique(filters.severity, RADAR_FILTER_SEVERITIES),
    impact: orderedUnique(filters.impact, RADAR_FILTER_IMPACTS),
    confidence: orderedUnique(filters.confidence, RADAR_FILTER_CONFIDENCE),
    state: orderedUnique(filters.state, RADAR_FILTER_USER_STATES),
    attention: orderedUnique(filters.attention, RADAR_FILTER_ATTENTION),
  };
}

export function radarFeedFilterKey(filters: NormalizedRadarFeedFilters): string {
  return JSON.stringify(filters);
}

function newStatePredicate(userId: string): Prisma.PropertyRadarMatchWhereInput {
  return {
    OR: [
      { states: { none: { userId } } },
      { states: { some: { userId, state: 'new' } } },
    ],
  };
}

function userStatePredicate(
  userId: string,
  states: RadarFilterUserState[],
): Prisma.PropertyRadarMatchWhereInput | null {
  if (!states.length) return null;
  const includesNew = states.includes('new');
  const persistedStates = states.filter((state) => state !== 'new');
  if (!includesNew) {
    return { states: { some: { userId, state: { in: persistedStates } } } };
  }
  if (!persistedStates.length) return newStatePredicate(userId);
  return {
    OR: [
      newStatePredicate(userId),
      { states: { some: { userId, state: { in: persistedStates } } } },
    ],
  };
}

export function buildRadarFeedFilterWhere(
  userId: string,
  filters: NormalizedRadarFeedFilters,
): Prisma.PropertyRadarMatchWhereInput | null {
  const clauses: Prisma.PropertyRadarMatchWhereInput[] = [];
  if (filters.lifecycle.length) {
    clauses.push({ lifecycleStatus: { in: filters.lifecycle } });
  }
  if (filters.impact.length) {
    clauses.push({
      impactLevel: {
        in: filters.impact.map((impact) => impact === 'low' ? 'watch' : impact),
      },
    });
  }
  if (filters.confidence.length) {
    clauses.push({ confidence: { in: filters.confidence } });
  }

  if (filters.sourceFamily.length || filters.severity.length) {
    const eventWhere: Prisma.RadarEventWhereInput = {};
    if (filters.severity.length) {
      eventWhere.severity = {
        in: filters.severity.map((severity) => {
          if (severity === 'moderate') return 'medium';
          if (severity === 'severe') return 'critical';
          return severity;
        }),
      };
    }
    if (filters.sourceFamily.length) {
      const includesOther = filters.sourceFamily.includes('other');
      if (includesOther) {
        eventWhere.OR = [
          { sourceDefinition: { is: { family: { in: filters.sourceFamily } } } },
          { sourceDefinition: { is: null } },
        ];
      } else {
        eventWhere.sourceDefinition = {
          is: { family: { in: filters.sourceFamily } },
        };
      }
    }
    clauses.push({ radarEvent: { is: eventWhere } });
  }

  const selectedState = userStatePredicate(userId, filters.state);
  if (selectedState) clauses.push(selectedState);

  if (filters.attention.length === 1 && filters.attention[0] === 'new') {
    clauses.push(newStatePredicate(userId));
  } else if (filters.attention.length === 1 && filters.attention[0] === 'updated') {
    clauses.push({ isMaterialUpdate: true });
  } else if (filters.attention.length === 2) {
    clauses.push({
      OR: [
        newStatePredicate(userId),
        { isMaterialUpdate: true },
      ],
    });
  }

  if (!clauses.length) return null;
  return clauses.length === 1 ? clauses[0] : { AND: clauses };
}
