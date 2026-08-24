import type { OperationalWorkItemState, OperationalWorkResponsibleParty } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { resolveGuidanceJourneyWorkKey, resolveProjectExecutionWorkKey } from '../modules/homeOperations/adapters/homeActionWorkItem.adapter';
import { transitionWorkItem } from '../modules/homeOperations/application/transitionWorkItem.usecase';
import {
  findAllWorkItemsLinkedToExecution,
  findWorkItemByWorkKey,
  linkWorkExecution,
} from '../modules/homeOperations/infrastructure/workItemRepository';
import { recordReconciliationFailure } from '../modules/homeOperations/infrastructure/reconciliationRepository';
import { recordOperationalWorkOutcome } from './decisionPlatform/outcomeObservationService';
import { resolveHomeActionDecisionLineage } from './decisionPlatform/homeActionDecisionLineage';

/**
 * Worker-safe project lifecycle projection into Home Operations.
 *
 * This module intentionally contains only the dependency-light reconciliation
 * boundary. The worker can replay failed projections without importing the
 * route-oriented projectTracker.service and its large HTTP/service graph.
 */
// Home Intelligence Functional Completeness FRD Phase 4 (HI-OUT-005/006) —
// mirrors guidanceCompletionHooks.service.ts's own outcome creation for a
// project that was handed off from a guidance journey's DECISION obligation.
// Best-effort: an outcome-recording failure must never block the project/
// work-item reconciliation that already succeeded above it.
async function recordProjectHandoffOutcome(
  propertyId: string,
  workItemId: string,
  guidanceJourneyId: string | null | undefined,
  actorUserId: string | null,
): Promise<void> {
  try {
    let recommendationSnapshotId: string | null = null;
    if (guidanceJourneyId) {
      const journey = await prisma.guidanceJourney.findUnique({
        where: { id: guidanceJourneyId },
        select: { inventoryItemId: true },
      });
      if (journey?.inventoryItemId) {
        const lineage = await resolveHomeActionDecisionLineage(propertyId, {
          decisionDefinitionId: 'HVAC_REPAIR_REPLACE',
          primaryEntityId: journey.inventoryItemId,
        }).catch(() => null);
        if (lineage?.status === 'LINKED') recommendationSnapshotId = lineage.thread.currentRecommendationSnapshotId;
      }
    }
    await recordOperationalWorkOutcome({
      propertyId,
      workItemId,
      userId: actorUserId,
      costCents: null,
      recommendationSnapshotId,
    });
  } catch (err) {
    logger.warn({ err, propertyId, workItemId }, 'Project handoff outcome recording failed; work item verification proceeds regardless');
  }
}

export async function resolveJourneyWorkKey(propertyId: string, journeyId: string): Promise<string> {
  const journey = await prisma.guidanceJourney.findUnique({
    where: { id: journeyId },
    select: { journeyTypeKey: true, inventoryItemId: true },
  });
  return resolveGuidanceJourneyWorkKey({
    propertyId,
    journeyId,
    journeyTypeKey: journey?.journeyTypeKey ?? null,
    inventoryItemId: journey?.inventoryItemId ?? null,
  });
}

export function responsiblePartyForFulfillmentMode(
  fulfillmentMode: 'PROVIDER' | 'DIY' | null | undefined,
): OperationalWorkResponsibleParty {
  if (fulfillmentMode === 'PROVIDER') return 'CONTRACTOR';
  if (fulfillmentMode === 'DIY') return 'HOUSEHOLD';
  return 'UNKNOWN';
}

export async function syncJourneyWorkItemForProjectEvent(
  propertyId: string,
  guidanceJourneyId: string | null | undefined,
  projectId: string,
  event: 'HANDOFF' | 'VERIFIED' | 'CANCELLED',
  actorUserId: string | null,
  responsibleParty?: OperationalWorkResponsibleParty,
  throwOnFailure: boolean = false,
): Promise<void> {
  if (!guidanceJourneyId) return;
  const actorType = actorUserId ? 'USER' : 'SYSTEM';
  try {
    const linkedJourneyItems = await findAllWorkItemsLinkedToExecution('GUIDANCE', guidanceJourneyId);
    const workKey = await resolveJourneyWorkKey(propertyId, guidanceJourneyId);
    const workItem = linkedJourneyItems.find((entry) => entry.workItem.propertyId === propertyId)?.workItem
      ?? await findWorkItemByWorkKey(propertyId, workKey);
    if (!workItem) return;

    if (event === 'HANDOFF') {
      if (['ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'IN_GUIDANCE'].includes(workItem.state)) {
        await transitionWorkItem({
          workItemId: workItem.id,
          to: 'IN_PROJECT',
          actorType,
          actorUserId,
          idempotencyKey: `project-handoff:${workItem.id}:${projectId}`,
        });
      }
      await linkWorkExecution({ workItemId: workItem.id, executionType: 'PROJECT', executionEntityId: projectId, responsibleParty });
      return;
    }

    if (event === 'VERIFIED') {
      let state: OperationalWorkItemState = workItem.state;
      if (state === 'CANDIDATE' || state === 'FOLLOW_UP_DUE') {
        const accepted = await transitionWorkItem({
          workItemId: workItem.id,
          to: 'ACCEPTED',
          actorType,
          actorUserId,
          idempotencyKey: `project-verified-accepted:${workItem.id}:${projectId}`,
        });
        state = accepted.state;
      }
      if (state === 'BLOCKED' || state === 'DEFERRED') {
        const progressing = await transitionWorkItem({
          workItemId: workItem.id,
          to: 'IN_PROGRESS',
          actorType,
          actorUserId,
          idempotencyKey: `project-verified-progress:${workItem.id}:${projectId}`,
        });
        state = progressing.state;
      }
      if (state !== 'REPORTED_COMPLETE' && state !== 'VERIFIED') {
        const reported = await transitionWorkItem({
          workItemId: workItem.id,
          to: 'REPORTED_COMPLETE',
          actorType,
          actorUserId,
          idempotencyKey: `project-verified-reported:${workItem.id}:${projectId}`,
        });
        state = reported.state;
      }
      if (state === 'REPORTED_COMPLETE') {
        await transitionWorkItem({
          workItemId: workItem.id,
          to: 'VERIFIED',
          actorType: 'SYSTEM',
          idempotencyKey: `project-verified:${workItem.id}:${projectId}`,
        });
        await recordProjectHandoffOutcome(propertyId, workItem.id, guidanceJourneyId, actorUserId);
      }
      const now = new Date();
      const completedJourney = await prisma.guidanceJourney.updateMany({
        where: { id: guidanceJourneyId, propertyId, status: { in: ['NOT_STARTED', 'ACTIVE'] } },
        data: { status: 'COMPLETED', completedAt: now, lastTransitionAt: now, version: { increment: 1 } },
      });
      if (completedJourney.count > 0) {
        await prisma.guidanceSignal.updateMany({
          where: { journeys: { some: { id: guidanceJourneyId } }, status: 'ACTIVE' },
          data: { status: 'RESOLVED', resolvedAt: now },
        });
      }
      return;
    }

    if (workItem.state === 'IN_PROJECT' || workItem.state === 'IN_PROGRESS') {
      await transitionWorkItem({
        workItemId: workItem.id,
        to: 'ACCEPTED',
        actorType,
        actorUserId,
        idempotencyKey: `project-cancelled-reconciled:${workItem.id}:${projectId}`,
      });
    }
  } catch (err) {
    await recordReconciliationFailure({
      propertyId,
      operation: 'PROJECT_JOURNEY_SYNC',
      sourceType: 'PROJECT',
      sourceEntityId: projectId,
      idempotencyKey: `project-journey-sync:${projectId}:${guidanceJourneyId}:${event}`,
      payload: { guidanceJourneyId, projectId, event, actorUserId, responsibleParty },
      error: err,
    }).catch(() => null);
    logger.warn({ err, propertyId, guidanceJourneyId, projectId, event }, 'Home Operations work item sync failed; project mutation proceeds regardless');
    if (throwOnFailure) throw err;
  }
}

export async function syncProjectExecutionWorkItemOnCompletion(
  propertyId: string,
  projectId: string,
  event: 'VERIFIED' | 'CANCELLED',
  throwOnFailure: boolean = false,
): Promise<void> {
  try {
    const workKey = resolveProjectExecutionWorkKey(propertyId, projectId);
    const workItem = await findWorkItemByWorkKey(propertyId, workKey);
    if (!workItem) return;

    if (event === 'VERIFIED') {
      let state: OperationalWorkItemState = workItem.state;
      if (state === 'CANDIDATE' || state === 'FOLLOW_UP_DUE') {
        const accepted = await transitionWorkItem({
          workItemId: workItem.id,
          to: 'ACCEPTED',
          actorType: 'SYSTEM',
          idempotencyKey: `project-execution-verified-accepted:${workItem.id}:${projectId}`,
        });
        state = accepted.state;
      }
      if (state === 'BLOCKED' || state === 'DEFERRED') {
        const progressing = await transitionWorkItem({
          workItemId: workItem.id,
          to: 'IN_PROGRESS',
          actorType: 'SYSTEM',
          idempotencyKey: `project-execution-verified-progress:${workItem.id}:${projectId}`,
        });
        state = progressing.state;
      }
      if (state !== 'REPORTED_COMPLETE' && state !== 'VERIFIED') {
        const reported = await transitionWorkItem({
          workItemId: workItem.id,
          to: 'REPORTED_COMPLETE',
          actorType: 'SYSTEM',
          idempotencyKey: `project-execution-verified-reported:${workItem.id}:${projectId}`,
        });
        state = reported.state;
      }
      if (state === 'REPORTED_COMPLETE') {
        await transitionWorkItem({
          workItemId: workItem.id,
          to: 'VERIFIED',
          actorType: 'SYSTEM',
          idempotencyKey: `project-execution-verified:${workItem.id}:${projectId}`,
        });
        await recordProjectHandoffOutcome(propertyId, workItem.id, null, null);
      }
      return;
    }

    if (workItem.state !== 'CLOSED') {
      await transitionWorkItem({
        workItemId: workItem.id,
        to: 'CLOSED',
        disposition: 'NOT_RELEVANT',
        actorType: 'SYSTEM',
        idempotencyKey: `project-execution-cancelled:${workItem.id}:${projectId}`,
      });
    }
  } catch (err) {
    await recordReconciliationFailure({
      propertyId,
      operation: 'PROJECT_EXECUTION_SYNC',
      sourceType: 'PROJECT',
      sourceEntityId: projectId,
      idempotencyKey: `project-execution-sync:${projectId}:${event}`,
      payload: { projectId, event },
      error: err,
    }).catch(() => null);
    logger.warn({ err, propertyId, projectId, event }, 'Home Operations project work item sync failed; project mutation proceeds regardless');
    if (throwOnFailure) throw err;
  }
}
