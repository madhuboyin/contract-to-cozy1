// apps/backend/src/services/adminAnalytics/repository.ts
//
// Raw Prisma queries against product_analytics_events for admin metrics.
//
// ADMIN EVENT EXCLUSION:
//   Events with moduleKey = 'admin_analytics' are excluded from all interaction
//   counts (WAH, MAH, totalEvents, eventsPerProperty). This prevents admin users
//   loading the analytics dashboard from inflating engagement metrics.
//
// SYSTEM/CRON EVENT EXCLUSION:
//   Several event sources are entirely automated with no human actor — severe
//   weather alerts, freeze-risk detection, coverage-lapse and provider-credential-
//   lapse scans all sweep every property on a schedule and emit with userId: null.
//   Those events are real and still recorded (operational visibility), but every
//   engagement/adoption/retention metric in this file filters them out via
//   `userId IS NOT NULL` — a property that's never had a real user open the app
//   must not count as "active"/"adopted"/"activated" just because it sat in a
//   storm's path. See docs/operations/PILOT_RAISE_READINESS_PLAN.md Section 2
//   (Feature Adoption briefly showed >1000% before this was added).
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
      userId: { not: null },
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
      userId: { not: null },
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
    SELECT "propertyId", COUNT(*)::bigint AS count
    FROM "product_analytics_events"
    WHERE "propertyId" IS NOT NULL
      AND "userId" IS NOT NULL
      AND "occurredAt" >= ${range.from}
      AND "occurredAt" <= ${range.to}
      AND "moduleKey" != ${ADMIN_MODULE_KEY}
    GROUP BY "propertyId"
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
    SELECT "moduleKey", COUNT(*)::bigint AS count
    FROM "product_analytics_events"
    WHERE "eventType" = 'DECISION_GUIDED'
      AND "occurredAt" >= ${range.from}
      AND "occurredAt" <= ${range.to}
      AND "userId" IS NOT NULL
    GROUP BY "moduleKey"
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
      DATE_TRUNC('day', "occurredAt") AS day,
      COUNT(*) ::bigint AS "eventCount",
      COUNT(DISTINCT "propertyId") ::bigint AS "activeProperties"
    FROM "product_analytics_events"
    WHERE "occurredAt" >= ${range.from}
      AND "occurredAt" <= ${range.to}
      AND "userId" IS NOT NULL
      AND "moduleKey" != ${ADMIN_MODULE_KEY}
    GROUP BY DATE_TRUNC('day', "occurredAt")
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
        "moduleKey",
        "featureKey",
        COUNT(DISTINCT "propertyId") ::bigint AS "uniqueHomes",
        COUNT(*) ::bigint AS "totalEvents"
      FROM "product_analytics_events"
      WHERE "occurredAt" >= ${range.from}
        AND "occurredAt" <= ${range.to}
        AND "featureKey" IS NOT NULL
        AND "userId" IS NOT NULL
        AND "moduleKey" = ${moduleKey}
      GROUP BY "moduleKey", "featureKey"
      ORDER BY "uniqueHomes" DESC
    `;
  }

  return prisma.$queryRaw<FeatureUsageRow[]>`
    SELECT
      "moduleKey",
      "featureKey",
      COUNT(DISTINCT "propertyId") ::bigint AS "uniqueHomes",
      COUNT(*) ::bigint AS "totalEvents"
    FROM "product_analytics_events"
    WHERE "occurredAt" >= ${range.from}
      AND "occurredAt" <= ${range.to}
      AND "featureKey" IS NOT NULL
      AND "userId" IS NOT NULL
    GROUP BY "moduleKey", "featureKey"
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
      WHERE p."createdAt" <= ${range.to}

      UNION ALL

      -- Stage 2: properties with ANY genuine (userId-backed) analytics activity in
      -- range, excluding admin module and system/cron-generated events
      SELECT DISTINCT e."propertyId", 'has_analytics_activity' AS stage
      FROM "product_analytics_events" e
      WHERE e."occurredAt" >= ${range.from}
        AND e."occurredAt" <= ${range.to}
        AND e."propertyId" IS NOT NULL
        AND e."userId" IS NOT NULL
        AND e."moduleKey" != ${ADMIN_MODULE_KEY}

      UNION ALL

      SELECT DISTINCT e."propertyId", 'first_feature_opened' AS stage
      FROM "product_analytics_events" e
      WHERE e."eventType" = 'FEATURE_OPENED'
        AND e."occurredAt" >= ${range.from}
        AND e."occurredAt" <= ${range.to}
        AND e."propertyId" IS NOT NULL
        AND e."userId" IS NOT NULL

      UNION ALL

      SELECT DISTINCT e."propertyId", 'decision_guided' AS stage
      FROM "product_analytics_events" e
      WHERE e."eventType" = 'DECISION_GUIDED'
        AND e."occurredAt" >= ${range.from}
        AND e."occurredAt" <= ${range.to}
        AND e."propertyId" IS NOT NULL
        AND e."userId" IS NOT NULL

      UNION ALL

      SELECT DISTINCT p.id, 'property_activated' AS stage
      FROM "properties" p
      WHERE p."activationStatus" = 'ACTIVATED'
        AND (p."activatedAt" IS NULL OR (p."activatedAt" >= ${range.from} AND p."activatedAt" <= ${range.to}))
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
        TO_CHAR(p."createdAt", 'YYYY-MM') AS "cohortKey",
        p.id AS "propertyId",
        DATE_TRUNC('month', p."createdAt") AS "cohortStart"
      FROM "properties" p
      WHERE p."createdAt" >= (NOW() - INTERVAL '1 month' * ${limitCohorts})
    ),
    activity AS (
      SELECT
        e."propertyId",
        DATE_TRUNC('week', e."occurredAt") AS "activityWeek"
      FROM "product_analytics_events" e
      WHERE e."propertyId" IS NOT NULL
        AND e."userId" IS NOT NULL
      GROUP BY e."propertyId", DATE_TRUNC('week', e."occurredAt")
    )
    SELECT
      c."cohortKey",
      COUNT(DISTINCT c."propertyId") ::bigint AS "cohortSize",
      FLOOR(
        EXTRACT(EPOCH FROM (a."activityWeek" - c."cohortStart")) / 604800
      )::int AS "weekOffset",
      COUNT(DISTINCT a."propertyId") ::bigint AS "activeCount"
    FROM cohorts c
    JOIN activity a ON a."propertyId" = c."propertyId"
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
        TO_CHAR(DATE_TRUNC('week', p."createdAt"), 'IYYY-"W"IW') AS "cohortKey",
        p.id AS "propertyId",
        DATE_TRUNC('week', p."createdAt") AS "cohortStart"
      FROM "properties" p
      WHERE p."createdAt" >= (NOW() - INTERVAL '1 week' * ${limitCohorts})
    ),
    activity AS (
      SELECT
        e."propertyId",
        DATE_TRUNC('week', e."occurredAt") AS "activityWeek"
      FROM "product_analytics_events" e
      WHERE e."propertyId" IS NOT NULL
        AND e."userId" IS NOT NULL
      GROUP BY e."propertyId", DATE_TRUNC('week', e."occurredAt")
    )
    SELECT
      c."cohortKey",
      COUNT(DISTINCT c."propertyId") ::bigint AS "cohortSize",
      FLOOR(
        EXTRACT(EPOCH FROM (a."activityWeek" - c."cohortStart")) / 604800
      )::int AS "weekOffset",
      COUNT(DISTINCT a."propertyId") ::bigint AS "activeCount"
    FROM cohorts c
    JOIN activity a ON a."propertyId" = c."propertyId"
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
      "moduleKey",
      "featureKey",
      COUNT(DISTINCT "propertyId") ::bigint AS "uniqueHomes",
      COUNT(*) ::bigint AS "totalEvents"
    FROM "product_analytics_events"
    WHERE "occurredAt" >= ${range.from}
      AND "occurredAt" <= ${range.to}
      AND "featureKey" IS NOT NULL
      AND "propertyId" IS NOT NULL
      AND "userId" IS NOT NULL
    GROUP BY "moduleKey", "featureKey"
    ORDER BY "uniqueHomes" DESC, "totalEvents" DESC
    LIMIT ${topN}
  `;
}
