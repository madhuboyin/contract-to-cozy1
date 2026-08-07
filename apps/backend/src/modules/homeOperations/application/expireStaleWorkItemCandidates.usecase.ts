import { prisma } from '../../../lib/prisma';
import { transitionWorkItem } from './transitionWorkItem.usecase';
import { logger } from '../../../lib/logger';

// A CANDIDATE work item whose only active source(s) are TRIGGER-role (never
// accepted, never backed by a real execution record) is a proposed
// recommendation, not durable homeowner-tracked work. The only work-item-
// eligible source that produces MAINTENANCE_TASK candidates this way is a
// forecast-anchored environment insight (homeActionSourcePromotion.service
// .ts's adaptEnvironmentInsightsToHomeActions — "Heavy rain expected
// Monday, Aug 3," freeze/snow/heat risk, etc). Those insights are
// recomputed fresh from a live forecast on every request and simply stop
// being generated once their date rolls out of range — nothing then
// revisits the durable OperationalWorkItem it already created, so it sits
// in CANDIDATE with a static, ever-more-stale dueAt forever. This mirrors
// expireGuidanceSignals.job.ts's sibling cleanup for GuidanceSignal.
//
// A grace period (rather than expiring exactly at dueAt) gives the
// homeowner a couple of days to still act on a just-missed forecast window
// before it's swept away.
const GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

export interface ExpireStaleWorkItemCandidatesResult {
  examined: number;
  updated: number;
  skipped: number;
  failed: number;
}

export async function expireStaleWorkItemCandidates(
  opts: { propertyId?: string; dryRun?: boolean } = {},
): Promise<ExpireStaleWorkItemCandidatesResult> {
  const cutoff = new Date(Date.now() - GRACE_PERIOD_MS);

  const candidates = await prisma.operationalWorkItem.findMany({
    where: {
      state: 'CANDIDATE',
      obligationType: 'MAINTENANCE_TASK',
      dueAt: { lt: cutoff },
      ...(opts.propertyId ? { propertyId: opts.propertyId } : {}),
      sources: { none: { sourceRole: 'EXECUTION', active: true } },
    },
    select: { id: true, dueAt: true },
  });

  if (opts.dryRun) {
    return { examined: candidates.length, updated: 0, skipped: candidates.length, failed: 0 };
  }

  let updated = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      await transitionWorkItem({
        workItemId: candidate.id,
        to: 'CLOSED',
        disposition: 'EXPIRED',
        actorType: 'SYSTEM',
        idempotencyKey: `expire-stale-candidate:${candidate.id}`,
        payload: { reason: 'source_no_longer_live', dueAt: candidate.dueAt?.toISOString() ?? null },
      });
      updated += 1;
    } catch (err) {
      failed += 1;
      logger.error({ err, workItemId: candidate.id }, '[expire-stale-work-item-candidates] failed to expire candidate');
    }
  }

  return { examined: candidates.length, updated, skipped: 0, failed };
}
