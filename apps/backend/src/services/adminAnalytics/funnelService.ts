// apps/backend/src/services/adminAnalytics/funnelService.ts
//
// Funnel stage calculation for the admin analytics dashboard.

import { getFunnelCounts } from './repository';
import { resolveDateRange } from './schemas';
import type { AdminFunnelResponse, FunnelStage } from './types';

// Ordered funnel stages — must match the stage keys in repository.getFunnelCounts
const FUNNEL_STAGES: Array<{ stage: string; label: string }> = [
  { stage: 'properties_created',      label: 'Properties Created' },
  { stage: 'property_profile_viewed', label: 'Profile Viewed' },
  { stage: 'first_feature_opened',    label: 'First Feature Opened' },
  { stage: 'decision_guided',         label: 'Decision Guided' },
  { stage: 'property_activated',      label: 'Fully Activated' },
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
