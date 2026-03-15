// apps/backend/src/services/adminAnalytics/cohortService.ts
//
// Retention / cohort computation for the admin analytics dashboard.

import { getMonthlyCohortRetention, getWeeklyCohortRetention } from './repository';
import type { AdminCohortResponse, CohortRetentionRow } from './types';

export async function getCohortMetrics(
  cohortType: 'weekly' | 'monthly',
  limitCohorts: number,
): Promise<AdminCohortResponse> {
  const rows =
    cohortType === 'monthly'
      ? await getMonthlyCohortRetention(limitCohorts)
      : await getWeeklyCohortRetention(limitCohorts);

  // Group by cohortKey
  const cohortMap = new Map<
    string,
    { cohortSize: number; byWeek: Map<number, number> }
  >();

  for (const row of rows) {
    const key = row.cohortKey;
    if (!cohortMap.has(key)) {
      cohortMap.set(key, {
        cohortSize: Number(row.cohortSize),
        byWeek: new Map(),
      });
    }
    const entry = cohortMap.get(key)!;
    // cohortSize may vary across rows if multiple weeks; take the max (all rows
    // should have the same value, but guard against query edge cases)
    if (Number(row.cohortSize) > entry.cohortSize) {
      entry.cohortSize = Number(row.cohortSize);
    }
    entry.byWeek.set(row.weekOffset, Number(row.activeCount));
  }

  const cohorts: CohortRetentionRow[] = Array.from(cohortMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cohortKey, { cohortSize, byWeek }]) => {
      const maxWeek = Math.max(...Array.from(byWeek.keys()), 0);
      const retentionByWeek = Array.from({ length: maxWeek + 1 }, (_, w) => {
        const activeCount = byWeek.get(w) ?? 0;
        return {
          weekOffset: w,
          activeCount,
          retentionRate: cohortSize > 0 ? activeCount / cohortSize : 0,
        };
      });

      return { cohortKey, cohortSize, retentionByWeek };
    });

  return { cohortType, cohorts };
}
