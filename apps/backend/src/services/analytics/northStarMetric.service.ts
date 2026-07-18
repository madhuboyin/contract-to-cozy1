import { ProductAnalyticsEventType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { NORTH_STAR_METRIC_DEFINITION } from '../../productFramework/outcomeLineage.contract';
import { NorthStarAnalyticsEvent } from './taxonomy';

type NorthStarEventRow = {
  eventType: ProductAnalyticsEventType;
  occurredAt: Date;
  propertyId: string | null;
  metadataJson: unknown;
};

type ActionMeasurement = {
  key: string;
  important: boolean;
  eligible: boolean;
  identifiedAt: Date;
  actionWindowClosesAt: Date | null;
  surfacedAt: Date | null;
  successfullyResolved: boolean;
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function toOptionalDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function actionKey(row: NorthStarEventRow, metadata: Record<string, unknown>): string | null {
  const actionId = typeof metadata.actionId === 'string' ? metadata.actionId : null;
  const version = typeof metadata.recommendationVersion === 'string'
    ? metadata.recommendationVersion
    : null;
  if (!row.propertyId || !actionId || !version) return null;
  return `${row.propertyId}:${actionId}:${version}`;
}

export type NorthStarMetricReport = {
  metricId: typeof NORTH_STAR_METRIC_DEFINITION.id;
  dataOwner: typeof NORTH_STAR_METRIC_DEFINITION.dataOwner;
  businessOwner: typeof NORTH_STAR_METRIC_DEFINITION.businessOwner;
  from: string;
  to: string;
  numerator: number;
  denominator: number;
  percentage: number | null;
  excluded: number;
};

export function aggregateNorthStarEvents(
  rows: NorthStarEventRow[],
  from: Date,
  to: Date,
): NorthStarMetricReport {
  const actions = new Map<string, ActionMeasurement>();

  for (const row of [...rows].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())) {
    const metadata = toRecord(row.metadataJson);
    const key = actionKey(row, metadata);
    if (!key) continue;

    if (row.eventType === NorthStarAnalyticsEvent.HOME_ACTION_IDENTIFIED) {
      const importantReasons = Array.isArray(metadata.importantReasons) ? metadata.importantReasons : [];
      const existing = actions.get(key);
      if (existing) {
        existing.important = existing.important || importantReasons.length > 0;
        existing.eligible = existing.eligible && metadata.metricEligibility !== 'INELIGIBLE';
        if (row.occurredAt < existing.identifiedAt) existing.identifiedAt = row.occurredAt;
        const actionWindowClosesAt = toOptionalDate(metadata.actionWindowClosesAt);
        if (actionWindowClosesAt &&
          (!existing.actionWindowClosesAt || actionWindowClosesAt < existing.actionWindowClosesAt)) {
          existing.actionWindowClosesAt = actionWindowClosesAt;
        }
        continue;
      }
      actions.set(key, {
        key,
        important: importantReasons.length > 0,
        eligible: metadata.metricEligibility !== 'INELIGIBLE',
        identifiedAt: row.occurredAt,
        actionWindowClosesAt: toOptionalDate(metadata.actionWindowClosesAt),
        surfacedAt: null,
        successfullyResolved: false,
      });
      continue;
    }

    const action = actions.get(key);
    if (!action) continue;
    if (row.eventType === NorthStarAnalyticsEvent.HOME_ACTION_SURFACED) {
      if (!action.surfacedAt || row.occurredAt < action.surfacedAt) action.surfacedAt = row.occurredAt;
    }
    if (row.eventType === NorthStarAnalyticsEvent.HOME_ACTION_OUTCOME_VERIFIED) {
      action.successfullyResolved = metadata.verificationStatus === 'VERIFIED' ||
        metadata.verificationStatus === 'NOT_REQUIRED';
    }
  }

  const cohort = [...actions.values()].filter((action) =>
    action.identifiedAt >= from && action.identifiedAt < to,
  );
  const eligible = cohort.filter((action) => action.important && action.eligible);
  const numerator = eligible.filter((action) => {
    const identifiedEarly = action.surfacedAt != null &&
      (action.actionWindowClosesAt == null || action.surfacedAt <= action.actionWindowClosesAt);
    return identifiedEarly && action.successfullyResolved;
  }).length;
  const denominator = eligible.length;

  return {
    metricId: NORTH_STAR_METRIC_DEFINITION.id,
    dataOwner: NORTH_STAR_METRIC_DEFINITION.dataOwner,
    businessOwner: NORTH_STAR_METRIC_DEFINITION.businessOwner,
    from: from.toISOString(),
    to: to.toISOString(),
    numerator,
    denominator,
    percentage: denominator === 0 ? null : Number(((numerator / denominator) * 100).toFixed(2)),
    excluded: cohort.length - denominator,
  };
}

export async function getNorthStarMetricReport(from: Date, to: Date): Promise<NorthStarMetricReport> {
  const eventTypes = Object.values(NorthStarAnalyticsEvent);
  const rows = await prisma.productAnalyticsEvent.findMany({
    where: {
      eventType: { in: eventTypes },
      occurredAt: { gte: from, lt: to },
    },
    select: {
      eventType: true,
      occurredAt: true,
      propertyId: true,
      metadataJson: true,
    },
    orderBy: { occurredAt: 'asc' },
  });
  return aggregateNorthStarEvents(rows, from, to);
}
