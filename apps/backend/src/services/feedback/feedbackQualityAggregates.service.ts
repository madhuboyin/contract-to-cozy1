import { prisma } from '../../lib/prisma';
import { isSafetySensitiveFeedback, type FeedbackReasonCode } from './feedbackContract';

/**
 * Home Intelligence Functional Completeness FRD Phase 7 (HI-FBK-005) —
 * admin quality aggregate, scoped to what the now-typed Feedback rows
 * (Phase 7 work item 1) can actually answer today: usefulness and
 * reason-code distribution by `targetType`. HI-FBK-005 additionally asks
 * for dismissal reasons, correction rates, completion conversion, verified
 * outcome rate, stale-output incidents, cross-surface inconsistencies, and
 * generated-content evaluation results — those live in other tables
 * (OperationalWorkItem, OutcomeObservation, etc.) this aggregate does not
 * join against yet. This is one real, usable slice, not the full metric
 * set — see the FRD Phase 7 status note for what remains.
 */
export interface FeedbackQualityRow {
  targetType: string | null;
  reasonCodes: string[];
}

export interface FeedbackTargetTypeQuality {
  targetType: string;
  totalCount: number;
  usefulCount: number;
  notUsefulCount: number;
  usefulRate: number | null;
  safetySensitiveCount: number;
  reasonCodeCounts: Record<string, number>;
}

export function aggregateFeedbackQualityByTargetType(rows: readonly FeedbackQualityRow[]): FeedbackTargetTypeQuality[] {
  const byTarget = new Map<string, FeedbackQualityRow[]>();
  for (const row of rows) {
    const targetType = row.targetType ?? 'UNTYPED';
    const bucket = byTarget.get(targetType) ?? [];
    bucket.push(row);
    byTarget.set(targetType, bucket);
  }

  return [...byTarget.entries()]
    .map(([targetType, bucket]) => {
      const reasonCodeCounts: Record<string, number> = {};
      let usefulCount = 0;
      let notUsefulCount = 0;
      let safetySensitiveCount = 0;
      for (const row of bucket) {
        const codes = row.reasonCodes as FeedbackReasonCode[];
        for (const code of codes) reasonCodeCounts[code] = (reasonCodeCounts[code] ?? 0) + 1;
        if (codes.includes('USEFUL')) usefulCount += 1;
        if (codes.includes('NOT_USEFUL')) notUsefulCount += 1;
        if (isSafetySensitiveFeedback(codes)) safetySensitiveCount += 1;
      }
      const rated = usefulCount + notUsefulCount;
      return {
        targetType,
        totalCount: bucket.length,
        usefulCount,
        notUsefulCount,
        usefulRate: rated > 0 ? usefulCount / rated : null,
        safetySensitiveCount,
        reasonCodeCounts,
      };
    })
    .sort((a, b) => b.totalCount - a.totalCount || a.targetType.localeCompare(b.targetType));
}

export async function getFeedbackQualityAggregates(input: { since?: Date } = {}): Promise<FeedbackTargetTypeQuality[]> {
  const rows = await prisma.feedback.findMany({
    where: input.since ? { createdAt: { gte: input.since } } : undefined,
    select: { targetType: true, reasonCodes: true },
  });
  return aggregateFeedbackQualityByTargetType(rows);
}
