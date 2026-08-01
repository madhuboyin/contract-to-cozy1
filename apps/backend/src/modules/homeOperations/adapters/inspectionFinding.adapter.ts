import type { InspectionFinding, OperationalWorkExecutionType, OperationalWorkItemPriority, RecommendationSafetyTier } from '@prisma/client';
import type { ProposedWorkItem, WorkItemSourceAdapter } from '../domain/sourceAdapter';
import { resolveWorkKey } from '../domain/workKey';
import { prisma } from '../../../lib/prisma';
import { logger } from '../../../lib/logger';
import { findWorkItemsLinkedToExecution } from '../infrastructure/workItemRepository';
import { transitionWorkItem } from '../application/transitionWorkItem.usecase';

/**
 * Home Operations Slice 5: a raw-record adapter (like maintenanceTask
 * .adapter.ts), not the HomeAction-level mapper — a finding needs its own
 * identity before it is ever promoted into the Home feed, since acceptance
 * (accept-as-work) is the gate that decides whether it becomes committed
 * work at all.
 *
 * propose() intentionally returns null for anything that is not yet a
 * reviewed, actionable obligation: an INFORMATIONAL finding never becomes
 * work, and a finding whose report has not reached CONFIRMED is unaccepted
 * extraction — the literal "unaccepted extraction does not become committed
 * work" exit criterion. Once RESOLVED/DISMISSED/ACCEPTED_AS_IS, the finding
 * is terminal and also proposes nothing (its work item, if any, is closed
 * separately by the caller — see inspectionHub.service.ts's dismissFinding
 * and the resolution-propagation hook).
 */

type FindingWithReportStatus = InspectionFinding & { report: { status: string } };

const PRIORITY_MAP: Record<InspectionFinding['severity'], OperationalWorkItemPriority> = {
  SAFETY: 'NOW',
  MAJOR: 'SOON',
  MINOR: 'PLAN',
  MONITOR: 'CONSIDER',
  INFORMATIONAL: 'CONSIDER',
};

// A high cost estimate is the same $1,500 threshold acceptFindingAsWork's
// resolveFindingWorkPolicy uses to route MAJOR findings to Project instead
// of Maintenance — kept here too since safetyTier should already reflect a
// material-cost finding even before the homeowner explicitly accepts it.
const MATERIAL_COST_THRESHOLD_CENTS = 150_000;

function resolveSafetyTier(finding: Pick<InspectionFinding, 'severity' | 'estimatedCostCentsHigh'>): RecommendationSafetyTier {
  if (finding.severity === 'SAFETY') return 'SAFETY_EMERGENCY';
  if (finding.severity === 'MAJOR' && (finding.estimatedCostCentsHigh ?? 0) >= MATERIAL_COST_THRESHOLD_CENTS) {
    return 'MATERIAL_FINANCIAL';
  }
  return 'LOW_CONSEQUENCE';
}

// A finding is its own subject — it does not share identity with the
// inventory item it may be attached to (multiple findings can point at the
// same item, each its own obligation).
const OBLIGATION_SLUG = 'finding-resolution';

/**
 * Exposed so callers (the accept-as-work flow, and the resolution-
 * propagation hook) can compute the same workKey without needing a full
 * propose()-eligible record on hand.
 */
export function resolveInspectionFindingWorkKey(findingId: string, propertyId: string): string {
  return resolveWorkKey({
    propertyId,
    subject: { type: 'FINDING', id: findingId },
    obligationType: 'FINDING_RESOLUTION',
    occurrence: { obligationSlug: OBLIGATION_SLUG },
  });
}

export const inspectionFindingSourceAdapter: WorkItemSourceAdapter<FindingWithReportStatus> = {
  sourceType: 'INSPECTION_FINDING',
  propose(finding, propertyId): ProposedWorkItem | null {
    if (finding.severity === 'INFORMATIONAL') return null;
    if (finding.report.status !== 'CONFIRMED') return null;
    if (finding.status !== 'OPEN') return null;

    const costRangeText = finding.estimatedCostCentsLow != null || finding.estimatedCostCentsHigh != null
      ? ` Estimated cost range: ${formatCentsRange(finding.estimatedCostCentsLow, finding.estimatedCostCentsHigh)}.`
      : '';

    return {
      propertyId,
      subject: { type: 'FINDING', id: finding.id },
      obligationType: 'FINDING_RESOLUTION',
      occurrence: { obligationSlug: OBLIGATION_SLUG },
      title: `${finding.homeSystem}: ${finding.inspectorRecommendation}`,
      homeownerReason: `${finding.inspectorDescription}${costRangeText}`,
      expectedOutcome: 'The finding is addressed and the inspection record reflects the verified outcome.',
      priority: PRIORITY_MAP[finding.severity],
      safetyTier: resolveSafetyTier(finding),
      // Item #19 (§5.15) Slice 2: intentionally no dueWindowStart/dueAt/
      // dueWindowEnd. InspectionFinding has no calendar-due-date concept —
      // urgency here is fully carried by severity (via priority/safetyTier
      // above), not a deadline. Per the target model's own principle, this
      // is a genuine "no due date" case, not a gap to fabricate a value for.
      confidence: null,
      missingContext: [],
      source: {
        sourceType: 'INSPECTION_FINDING',
        sourceEntityId: finding.id,
        sourceVersion: finding.updatedAt.toISOString(),
        sourceRole: 'TRIGGER',
      },
    };
  },
};

/**
 * Home Operations Slice 5 resolution propagation — "verified linked
 * execution resolves the finding". Called best-effort from the completion
 * hooks Slices 3/4 already built (PropertyMaintenanceTask.service.ts's
 * syncTaskWorkItem, and the guidance-journey VERIFIED path) whenever a
 * MAINTENANCE_TASK or GUIDANCE execution reaches VERIFIED. A no-op when
 * nothing links back to a FINDING-subject work item (the overwhelmingly
 * common case — most tasks/journeys have no inspection origin at all).
 * Lives here, not in inspectionHub.service.ts, to avoid a circular import
 * (inspectionHub.service.ts already imports PropertyMaintenanceTaskService
 * for the accept-as-work MAINTENANCE routing branch).
 */
export async function propagateFindingResolutionFromExecution(
  executionType: OperationalWorkExecutionType,
  executionEntityId: string,
): Promise<void> {
  try {
    if (executionType === 'GUIDANCE') {
      const outcomeSteps = await prisma.guidanceJourneyStep.findMany({
        where: {
          journeyId: executionEntityId,
          isRequired: true,
          stepType: { in: ['EXECUTION', 'VALIDATION'] },
        },
        select: { evidences: { select: { sourceType: true, status: true } } },
      });
      const outcomeVerified = outcomeSteps.length > 0 && outcomeSteps.every((step) =>
        step.evidences.some((evidence) => evidence.sourceType !== 'USER_INPUT' || evidence.status === 'VERIFIED'),
      );
      if (!outcomeVerified) return;
    }
    const links = await findWorkItemsLinkedToExecution(executionType, executionEntityId);
    for (const link of links) {
      const workItem = link.workItem;
      if (workItem.state === 'CLOSED') continue;

      let current = workItem;
      if (current.state === 'CANDIDATE' || current.state === 'FOLLOW_UP_DUE') {
        current = await transitionWorkItem({
          workItemId: current.id,
          to: 'ACCEPTED',
          actorType: 'SYSTEM',
          idempotencyKey: `finding-resolution-accepted:${current.id}:${executionType}:${executionEntityId}`,
        });
      }
      if (current.state === 'BLOCKED' || current.state === 'DEFERRED') {
        current = await transitionWorkItem({
          workItemId: current.id,
          to: 'IN_PROGRESS',
          actorType: 'SYSTEM',
          idempotencyKey: `finding-resolution-progress:${current.id}:${executionType}:${executionEntityId}`,
        });
      }
      if (current.state !== 'REPORTED_COMPLETE') {
        if (current.state !== 'VERIFIED') {
          current = await transitionWorkItem({
            workItemId: current.id,
            to: 'REPORTED_COMPLETE',
            actorType: 'SYSTEM',
            idempotencyKey: `finding-resolution-reported:${current.id}:${executionType}:${executionEntityId}`,
          });
        }
      }
      if (current.state === 'REPORTED_COMPLETE') {
        current = await transitionWorkItem({
          workItemId: current.id,
          to: 'VERIFIED',
          actorType: 'SYSTEM',
          idempotencyKey: `finding-resolution-verified:${current.id}:${executionType}:${executionEntityId}`,
        });
      }

      // workItem.subjectId IS the finding id (subjectType FINDING) — no join
      // needed. CONTRACTOR_WORK is the closest fit among the four resolution
      // methods for "resolved via tracked Home Operations work"; none is a
      // precise match, same class of imprecision Slice 4 already documented
      // for its own disposition mapping.
      if (current.state === 'VERIFIED') await prisma.inspectionFinding.updateMany({
        where: { id: workItem.subjectId, status: 'OPEN' },
        data: { status: 'RESOLVED', resolutionMethod: 'CONTRACTOR_WORK', resolvedAt: new Date() },
      });
    }
  } catch (err) {
    logger.warn({ err, executionType, executionEntityId }, 'Home Operations finding resolution propagation failed; execution mutation proceeds regardless');
  }
}

function formatCentsRange(low: number | null, high: number | null): string {
  const fmt = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;
  if (low != null && high != null) return `${fmt(low)}–${fmt(high)}`;
  if (high != null) return `up to ${fmt(high)}`;
  if (low != null) return `${fmt(low)}+`;
  return '';
}
