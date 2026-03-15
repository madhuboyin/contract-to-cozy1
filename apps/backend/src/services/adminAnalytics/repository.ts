// apps/backend/src/services/adminAnalytics/repository.ts
//
// Raw Prisma queries against product_analytics_events for admin metrics.
//
// ADMIN EVENT EXCLUSION:
//   Events with module_key = 'admin_analytics' are excluded from all interaction
//   counts (WAH, MAH, totalEvents, eventsPerProperty). This prevents admin users
//   loading the analytics dashboard from inflating engagement metrics.
//
// BACKFILL / REPLAY SAFETY:
//   All metrics queries are read-only and idempotent — safe to run repeatedly.
//   If historical events are backfilled, WAH/MAH and interaction counts will
//   update automatically on the next query. No stale caches or counters exist.
//   The one exception is countActivatedProperties() which reads Property.activationStatus,
//   a durable field that is written idempotently by maybeMarkPropertyActivated().

import { prisma } from '../../lib/prisma';
import { DateRange } from './types';

// Module key to exclude from user-facing metrics (admin's own usage)
const ADMIN_MODULE_KEY = 'admin_analytics';

// ============================================================================
// ACTIVATION METRICS
// ============================================================================

export async function countTotalProperties(): Promise<number> {
  return prisma.property.count();
}

export async function countActivatedProperties(): Promise<number> {
  return prisma.property.count({
    where: { activationStatus: 'ACTIVATED' },
  });
}

export async function countNewActivationsInPeriod(range: DateRange): Promise<number> {
  return prisma.property.count({
    where: {
      activationStatus: 'ACTIVATED',
      activatedAt: { gte: range.from, lte: range.to },
    },
  });
}

// ============================================================================
// ACTIVE HOMES (WAH / MAH)
// ============================================================================

export async function countDistinctActiveProperties(since: Date): Promise<number> {
  const result = await prisma.productAnalyticsEvent.findMany({
    where: {
      propertyId: { not: null },
      occurredAt: { gte: since },
      // Exclude admin's own analytics dashboard activity from engagement counts
      NOT: { moduleKey: ADMIN_MODULE_KEY },
    },
    select: { propertyId: true },
    distinct: ['propertyId'],
  });
  return result.length;
}

// ============================================================================
// INTERACTION COUNTS
// ============================================================================

export async function countTotalEvents(range: DateRange): Promise<number> {
  return prisma.productAnalyticsEvent.count({
    where: {
      occurredAt: { gte: range.from, lte: range.to },
      // Exclude admin analytics dashboard events from interaction totals
      NOT: { moduleKey: ADMIN_MODULE_KEY },
    },
  });
}

export async function countEventsPerProperty(
  range: DateRange,
): Promise<Array<{ propertyId: string; count: bigint }>> {
  // SAFETY: LIMIT 50000 prevents this query from returning an unbounded result
  // set on large tables. The median calculation in metricsService.ts processes
  // all returned rows in memory, so this caps memory usage too.
  return prisma.$queryRaw<Array<{ propertyId: string; count: bigint }>>`
    SELECT "property_id" AS "propertyId", COUNT(*)::bigint AS count
    FROM "product_analytics_events"
    WHERE "property_id" IS NOT NULL
      AND "occurred_at" >= ${range.from}
      AND "occurred_at" <= ${range.to}
      AND "module_key" != ${ADMIN_MODULE_KEY}
    GROUP BY "property_id"
    LIMIT 50000
  `;
}

// ============================================================================
// DECISIONS GUIDED
// ============================================================================

export async function countDecisionsGuided(
  range: DateRange,
): Promise<Array<{ moduleKey: string | null; count: bigint }>> {
  return prisma.$queryRaw<Array<{ moduleKey: string | null; count: bigint }>>`
    SELECT "module_key" AS "moduleKey", COUNT(*)::bigint AS count
    FROM "product_analytics_events"
    WHERE "event_type" = 'DECISION_GUIDED'
      AND "occurred_at" >= ${range.from}
      AND "occurred_at" <= ${range.to}
    GROUP BY "module_key"
    ORDER BY count DESC
  `;
}

// ============================================================================
// DAILY TRENDS
// ============================================================================

export interface DailyEventRow {
  day: Date;
  eventCount: bigint;
  activeProperties: bigint;
}

export async function getDailyEventCounts(range: DateRange): Promise<DailyEventRow[]> {
  return prisma.$queryRaw<DailyEventRow[]>`
    SELECT
      DATE_TRUNC('day', "occurred_at") AS day,
      COUNT(*) ::bigint AS "eventCount",
      COUNT(DISTINCT "property_id") ::bigint AS "activeProperties"
    FROM "product_analytics_events"
    WHERE "occurred_at" >= ${range.from}
      AND "occurred_at" <= ${range.to}
      AND "module_key" != ${ADMIN_MODULE_KEY}
    GROUP BY DATE_TRUNC('day', "occurred_at")
    ORDER BY day ASC
  `;
}

// ============================================================================
// FEATURE ADOPTION
// ============================================================================

export interface FeatureUsageRow {
  moduleKey: string | null;
  featureKey: string | null;
  uniqueHomes: bigint;
  totalEvents: bigint;
}

export async function getFeatureUsage(
  range: DateRange,
  moduleKey?: string,
): Promise<FeatureUsageRow[]> {
  if (moduleKey) {
    return prisma.$queryRaw<FeatureUsageRow[]>`
      SELECT
        "module_key"   AS "moduleKey",
        "feature_key"  AS "featureKey",
        COUNT(DISTINCT "property_id") ::bigint AS "uniqueHomes",
        COUNT(*) ::bigint AS "totalEvents"
      FROM "product_analytics_events"
      WHERE "occurred_at" >= ${range.from}
        AND "occurred_at" <= ${range.to}
        AND "feature_key" IS NOT NULL
        AND "module_key" = ${moduleKey}
      GROUP BY "module_key", "feature_key"
      ORDER BY "uniqueHomes" DESC
    `;
  }

  return prisma.$queryRaw<FeatureUsageRow[]>`
    SELECT
      "module_key"   AS "moduleKey",
      "feature_key"  AS "featureKey",
      COUNT(DISTINCT "property_id") ::bigint AS "uniqueHomes",
      COUNT(*) ::bigint AS "totalEvents"
    FROM "product_analytics_events"
    WHERE "occurred_at" >= ${range.from}
      AND "occurred_at" <= ${range.to}
      AND "feature_key" IS NOT NULL
    GROUP BY "module_key", "feature_key"
    ORDER BY "uniqueHomes" DESC
  `;
}

// ============================================================================
// FUNNEL — property activation stages
// ============================================================================

export interface FunnelCountRow {
  stage: string;
  count: bigint;
}

export async function getFunnelCounts(range: DateRange): Promise<FunnelCountRow[]> {
  // FUNNEL DEFINITION:
  //   Stage 1 (properties_created):     All properties that existed as of range.to
  //                                     (cumulative baseline — gives funnel a denominator)
  //   Stage 2 (has_analytics_activity): Properties with ANY analytics event in range
  //                                     (proxy for "instrumented and active")
  //   Stage 3 (first_feature_opened):   Properties that opened at least one feature
  //   Stage 4 (decision_guided):        Properties that received at least one guided decision
  //   Stage 5 (property_activated):     Properties marked ACTIVATED in range
  //
  // Note: Stage 1 is an all-time count (not range-filtered from), so "conversion"
  // from Stage 1 to Stage 2 reflects adoption within the period, not a pure cohort
  // funnel. Admin UI should make this denominator distinction clear.
  return prisma.$queryRaw<FunnelCountRow[]>`
    SELECT stage, COUNT(*) ::bigint AS count FROM (
      SELECT DISTINCT p.id, 'properties_created' AS stage
      FROM "properties" p
      WHERE p."created_at" <= ${range.to}

      UNION ALL

      -- Stage 2: properties with ANY analytics activity in range (excluding admin module)
      SELECT DISTINCT e."property_id", 'has_analytics_activity' AS stage
      FROM "product_analytics_events" e
      WHERE e."occurred_at" >= ${range.from}
        AND e."occurred_at" <= ${range.to}
        AND e."property_id" IS NOT NULL
        AND e."module_key" != ${ADMIN_MODULE_KEY}

      UNION ALL

      SELECT DISTINCT e."property_id", 'first_feature_opened' AS stage
      FROM "product_analytics_events" e
      WHERE e."event_type" = 'FEATURE_OPENED'
        AND e."occurred_at" >= ${range.from}
        AND e."occurred_at" <= ${range.to}
        AND e."property_id" IS NOT NULL

      UNION ALL

      SELECT DISTINCT e."property_id", 'decision_guided' AS stage
      FROM "product_analytics_events" e
      WHERE e."event_type" = 'DECISION_GUIDED'
        AND e."occurred_at" >= ${range.from}
        AND e."occurred_at" <= ${range.to}
        AND e."property_id" IS NOT NULL

      UNION ALL

      SELECT DISTINCT p.id, 'property_activated' AS stage
      FROM "properties" p
      WHERE p."activation_status" = 'ACTIVATED'
        AND (p."activated_at" IS NULL OR (p."activated_at" >= ${range.from} AND p."activated_at" <= ${range.to}))
    ) stages
    GROUP BY stage
  `;
}

// ============================================================================
// COHORT RETENTION
// ============================================================================

export interface CohortWeekRow {
  cohortKey: string;
  cohortSize: bigint;
  weekOffset: number;
  activeCount: bigint;
}

export async function getMonthlyCohortRetention(limitCohorts: number): Promise<CohortWeekRow[]> {
  return prisma.$queryRaw<CohortWeekRow[]>`
    WITH cohorts AS (
      SELECT
        TO_CHAR(p."created_at", 'YYYY-MM') AS "cohortKey",
        p.id AS "propertyId",
        DATE_TRUNC('month', p."created_at") AS "cohortStart"
      FROM "properties" p
      WHERE p."created_at" >= (NOW() - INTERVAL '1 month' * ${limitCohorts})
    ),
    activity AS (
      SELECT
        e."property_id",
        DATE_TRUNC('week', e."occurred_at") AS "activityWeek"
      FROM "product_analytics_events" e
      WHERE e."property_id" IS NOT NULL
      GROUP BY e."property_id", DATE_TRUNC('week', e."occurred_at")
    )
    SELECT
      c."cohortKey",
      COUNT(DISTINCT c."propertyId") ::bigint AS "cohortSize",
      FLOOR(
        EXTRACT(EPOCH FROM (a."activityWeek" - c."cohortStart")) / 604800
      )::int AS "weekOffset",
      COUNT(DISTINCT a."property_id") ::bigint AS "activeCount"
    FROM cohorts c
    JOIN activity a ON a."property_id" = c."propertyId"
    WHERE a."activityWeek" >= c."cohortStart"
      AND a."activityWeek" <= c."cohortStart" + INTERVAL '12 weeks'
    GROUP BY c."cohortKey", c."cohortStart", a."activityWeek"
    ORDER BY c."cohortKey" ASC, "weekOffset" ASC
  `;
}

export async function getWeeklyCohortRetention(limitCohorts: number): Promise<CohortWeekRow[]> {
  return prisma.$queryRaw<CohortWeekRow[]>`
    WITH cohorts AS (
      SELECT
        TO_CHAR(DATE_TRUNC('week', p."created_at"), 'IYYY-"W"IW') AS "cohortKey",
        p.id AS "propertyId",
        DATE_TRUNC('week', p."created_at") AS "cohortStart"
      FROM "properties" p
      WHERE p."created_at" >= (NOW() - INTERVAL '1 week' * ${limitCohorts})
    ),
    activity AS (
      SELECT
        e."property_id",
        DATE_TRUNC('week', e."occurred_at") AS "activityWeek"
      FROM "product_analytics_events" e
      WHERE e."property_id" IS NOT NULL
      GROUP BY e."property_id", DATE_TRUNC('week', e."occurred_at")
    )
    SELECT
      c."cohortKey",
      COUNT(DISTINCT c."propertyId") ::bigint AS "cohortSize",
      FLOOR(
        EXTRACT(EPOCH FROM (a."activityWeek" - c."cohortStart")) / 604800
      )::int AS "weekOffset",
      COUNT(DISTINCT a."property_id") ::bigint AS "activeCount"
    FROM cohorts c
    JOIN activity a ON a."property_id" = c."propertyId"
    WHERE a."activityWeek" >= c."cohortStart"
      AND a."activityWeek" <= c."cohortStart" + INTERVAL '8 weeks'
    GROUP BY c."cohortKey", c."cohortStart", a."activityWeek"
    ORDER BY c."cohortKey" ASC, "weekOffset" ASC
  `;
}

// ============================================================================
// TOP TOOLS
// ============================================================================

export interface TopToolRow {
  moduleKey: string | null;
  featureKey: string | null;
  uniqueHomes: bigint;
  totalEvents: bigint;
}

export async function getTopTools(range: DateRange, topN: number): Promise<TopToolRow[]> {
  return prisma.$queryRaw<TopToolRow[]>`
    SELECT
      "module_key"  AS "moduleKey",
      "feature_key" AS "featureKey",
      COUNT(DISTINCT "property_id") ::bigint AS "uniqueHomes",
      COUNT(*) ::bigint AS "totalEvents"
    FROM "product_analytics_events"
    WHERE "occurred_at" >= ${range.from}
      AND "occurred_at" <= ${range.to}
      AND "feature_key" IS NOT NULL
      AND "property_id" IS NOT NULL
    GROUP BY "module_key", "feature_key"
    ORDER BY "uniqueHomes" DESC, "totalEvents" DESC
    LIMIT ${topN}
  `;
}
