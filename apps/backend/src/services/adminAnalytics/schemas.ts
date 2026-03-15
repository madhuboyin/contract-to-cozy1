// apps/backend/src/services/adminAnalytics/schemas.ts
//
// Zod query-param validation schemas for admin analytics endpoints.
// These are wrapped in { query: ... } so they work with the `validate()` middleware.

import { z } from 'zod';

// ============================================================================
// HELPERS
// ============================================================================

// ISO date string "YYYY-MM-DD" coerced to Date
const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
  .transform((s) => new Date(s + 'T00:00:00.000Z'));

// Default window helpers (evaluated at call time)
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ============================================================================
// SHARED DATE-RANGE QUERY
// ============================================================================

export const DateRangeQuerySchema = z.object({
  query: z.object({
    from: isoDateString.optional(),
    to: isoDateString.optional(),
  }),
});

export type DateRangeQuery = z.infer<typeof DateRangeQuerySchema>['query'];

// ============================================================================
// OVERVIEW
// ============================================================================

export const OverviewQuerySchema = z.object({
  query: z.object({
    from: isoDateString.optional(),
    to: isoDateString.optional(),
  }),
});

// ============================================================================
// TRENDS
// ============================================================================

export const TrendsQuerySchema = z.object({
  query: z.object({
    from: isoDateString.optional(),
    to: isoDateString.optional(),
    // granularity reserved for future (weekly/monthly); currently always 'day'
  }),
});

// ============================================================================
// FEATURE ADOPTION
// ============================================================================

export const FeatureAdoptionQuerySchema = z.object({
  query: z.object({
    from: isoDateString.optional(),
    to: isoDateString.optional(),
    moduleKey: z.string().optional(),
  }),
});

// ============================================================================
// FUNNEL
// ============================================================================

export const FunnelQuerySchema = z.object({
  query: z.object({
    from: isoDateString.optional(),
    to: isoDateString.optional(),
  }),
});

// ============================================================================
// COHORTS
// ============================================================================

export const CohortQuerySchema = z.object({
  query: z.object({
    cohortType: z.enum(['weekly', 'monthly']).optional().default('monthly'),
    // Number of cohorts to return (most recent N)
    limit: z.coerce.number().int().min(1).max(24).optional().default(6),
  }),
});

// ============================================================================
// TOP TOOLS
// ============================================================================

export const TopToolsQuerySchema = z.object({
  query: z.object({
    from: isoDateString.optional(),
    to: isoDateString.optional(),
    topN: z.coerce.number().int().min(1).max(50).optional().default(10),
  }),
});

// ============================================================================
// HELPER — resolve optional from/to with sensible defaults
// ============================================================================

export function resolveDateRange(
  from: Date | undefined,
  to: Date | undefined,
  defaultDays = 30,
): { from: Date; to: Date } {
  const resolvedTo = to ?? new Date(todayStr() + 'T23:59:59.999Z');
  const resolvedFrom = from ?? new Date(daysAgo(defaultDays) + 'T00:00:00.000Z');
  return { from: resolvedFrom, to: resolvedTo };
}
