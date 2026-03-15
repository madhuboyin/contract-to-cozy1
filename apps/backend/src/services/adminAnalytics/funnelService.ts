// apps/backend/src/services/adminAnalytics/funnelService.ts
//
// Funnel stage calculation for the admin analytics dashboard.
//
// FUNNEL INTERPRETATION NOTE:
//   Stage 1 counts all properties that existed as of the period end date
//   (all-time denominator), while stages 2–5 filter to activity within the
//   selected date range. This means "conversion" from Stage 1 to Stage 2
//   reflects period-specific adoption against a cumulative base, NOT a pure
//   new-cohort funnel. The UI labels make this clear.

import { getFunnelCounts } from './repository';
import { resolveDateRange } from './schemas';
import type { AdminFunnelResponse, FunnelStage } from './types';

// Ordered funnel stages — stage keys MUST match repository.getFunnelCounts SQL aliases.
const FUNNEL_STAGES: Array<{ stage: string; label: string }> = [
  { stage: 'properties_created',     label: 'Total Properties (all-time)' },
  { stage: 'has_analytics_activity', label: 'Had Activity in Period' },
  { stage: 'first_feature_opened',   label: 'Opened a Feature' },
  { stage: 'decision_guided',        label: 'Received a Decision' },
  { stage: 'property_activated',     label: 'Fully Activated' },
];

export async function getFunnelMetrics(
  fromRaw: Date | undefined,
  toRaw: Date | undefined,
): Promise<AdminFunnelResponse> {
  const range = resolveDateRange(fromRaw, toRaw, 30);
  const rows = await getFunnelCounts(range);

  // Index raw counts by stage key
  const countByStage = new Map<string, number>();
  for (const row of rows) {
    countByStage.set(row.stage, Number(row.count));
  }

  // Build ordered stage list with drop-off calculations
  const stages: FunnelStage[] = [];
  let prevCount: number | null = null;

  for (const { stage, label } of FUNNEL_STAGES) {
    const count = countByStage.get(stage) ?? 0;
    const dropoffFromPrevious = prevCount !== null ? prevCount - count : null;
    const conversionFromPrevious =
      prevCount !== null && prevCount > 0 ? count / prevCount : null;

    stages.push({ stage, label, count, dropoffFromPrevious, conversionFromPrevious });
    prevCount = count;
  }

  return {
    period: { from: range.from.toISOString(), to: range.to.toISOString() },
    stages,
  };
}
