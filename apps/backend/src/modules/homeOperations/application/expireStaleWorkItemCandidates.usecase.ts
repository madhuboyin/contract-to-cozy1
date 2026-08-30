import type { OperationalObligationType } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { transitionWorkItem } from './transitionWorkItem.usecase';
import { logger } from '../../../lib/logger';

// A CANDIDATE work item whose only active source(s) are TRIGGER-role (never
// accepted, never backed by a real execution record) is a proposed
// recommendation, not durable homeowner-tracked work. Two source families
// produce these and then silently stop regenerating once their forecast /
// season window rolls past, leaving the durable OperationalWorkItem stranded:
//
//   - MAINTENANCE_TASK — a forecast-anchored environment insight
//     (homeActionSourcePromotion.service.ts's
//     adaptEnvironmentInsightsToHomeActions: "Heavy rain expected Monday,
//     Aug 3," "Multi-day heat risk ahead," freeze/snow risk, etc). These are
//     recomputed fresh from a live forecast on every request and simply stop
//     being generated once their date rolls out of range.
//   - INCIDENT_RESPONSE — a WEATHER_PREPARATION incident's promoted checklist
//     ("Multi-day heat risk ahead preparation") or a weather-alert incident.
//     loadIncidentActions stops emitting the HomeAction once the recorded
//     weather window (details.effectiveTo) has passed, but the CANDIDATE work
//     item it already spawned is never revisited.
//
// Nothing then transitions the item, so it sits in CANDIDATE with a static,
// ever-more-stale due window forever — visible in Home Operations' Today tab
// as if it were still actionable. This mirrors expireGuidanceSignals.job.ts's
// sibling cleanup for GuidanceSignal, and complements
// expireStaleWeatherPreparations (which resolves the INCIDENT side; closing
// the work item here is terminal — resolveWorkItem.usecase.ts refuses to
// refresh or reopen a CLOSED item from a source, so a still-live incident
// cannot resurrect it).
//
// The staleness test keys off dueWindowEnd (the end of the scheduling
// window), falling back to dueAt only when no window end was recorded. An
// earlier version keyed off dueAt alone — for a multi-day event that is the
// window *start*, so it could expire an item while its window was still open.
//
// A grace period (rather than expiring the moment the window ends) gives the
// homeowner a couple of days to still act on a just-missed window before it
// is swept away.
const GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

// Obligation types whose CANDIDATE items are genuinely ephemeral — a passed
// window means the reason for the recommendation is gone. Deliberately
// excludes FINDING_RESOLUTION, COVERAGE_ACTION, RECORD_REVIEW, DECISION,
// SALE_PREP_TASK, etc: those do not stop mattering because a date passed.
const EPHEMERAL_OBLIGATION_TYPES: OperationalObligationType[] = ['MAINTENANCE_TASK', 'INCIDENT_RESPONSE'];

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
      // CANDIDATE already implies never-accepted (no transition returns to
      // CANDIDATE), but assert it explicitly so a future lifecycle change
      // cannot silently expire committed work.
      acceptedAt: null,
      obligationType: { in: EPHEMERAL_OBLIGATION_TYPES },
      ...(opts.propertyId ? { propertyId: opts.propertyId } : {}),
      sources: { none: { sourceRole: 'EXECUTION', active: true } },
      OR: [
        { dueWindowEnd: { not: null, lt: cutoff } },
        { dueWindowEnd: null, dueAt: { lt: cutoff } },
      ],
    },
    select: { id: true, dueAt: true, dueWindowEnd: true },
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
        payload: {
          reason: 'source_no_longer_live',
          dueAt: candidate.dueAt?.toISOString() ?? null,
          dueWindowEnd: candidate.dueWindowEnd?.toISOString() ?? null,
        },
      });
      updated += 1;
    } catch (err) {
      failed += 1;
      logger.error({ err, workItemId: candidate.id }, '[expire-stale-work-item-candidates] failed to expire candidate');
    }
  }

  return { examined: candidates.length, updated, skipped: 0, failed };
}
