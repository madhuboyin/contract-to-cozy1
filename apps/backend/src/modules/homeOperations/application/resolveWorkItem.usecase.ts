import type { ProposedWorkItem } from '../domain/sourceAdapter';
import { resolveWorkKey } from '../domain/workKey';
import { canRefreshPresentationFromSource, canRefreshDueFieldsFromSource } from '../domain/transitions';
import {
  createWorkItem,
  findWorkSource,
  findWorkItemByWorkKey,
  recordWorkEvent,
  refreshWorkItemPresentation,
  updateWorkItemDueFields,
  upsertWorkSource,
  type WorkItemDb,
} from '../infrastructure/workItemRepository';
import { emitWorkItemLifecycleChangeWithTransaction, type WorkItemLifecycleEventCallback } from '../infrastructure/workItemChangeEmitter';
import { transitionWorkItem } from './transitionWorkItem.usecase';
import { prisma } from '../../../lib/prisma';

/**
 * The identity resolver (parent plan section 7.5, rule 2: "an identity
 * resolver merges or links candidates before presentation").
 *
 * - No existing item for this workKey: create it (CANDIDATE/PROPOSED),
 *   link the proposing source, and record WORK_CANDIDATE_DETECTED.
 * - An item already exists: always reconcile the source link (so a source
 *   whose copy/version changed is visible). Presentation fields (title/
 *   reason/priority/etc.) and due-window fields refresh on two independent
 *   gates (Item #19 §5.15 Slice 2): presentation only refreshes while still
 *   CANDIDATE (canRefreshPresentationFromSource — once accepted,
 *   recalculation must stop silently rewriting homeowner-visible state),
 *   but due-window fields keep refreshing after acceptance
 *   (canRefreshDueFieldsFromSource) — a due date going stale relative to
 *   its source is a correctness bug, not a rug-pull.
 *
 * This is what makes "source copy changes do not create duplicate work"
 * and "one obligation resolves to one work item across recalculation" true
 * by construction, not by convention.
 */
export async function resolveAndUpsertWorkItem(
  proposal: ProposedWorkItem,
  db: WorkItemDb = prisma,
  onLifecycleEvent?: WorkItemLifecycleEventCallback,
) {
  if (db === prisma) {
    return prisma.$transaction((tx) => resolveAndUpsertWorkItemInTransaction(proposal, tx, onLifecycleEvent));
  }
  return resolveAndUpsertWorkItemInTransaction(proposal, db, onLifecycleEvent);
}

async function resolveAndUpsertWorkItemInTransaction(
  proposal: ProposedWorkItem,
  db: Exclude<WorkItemDb, typeof prisma>,
  onLifecycleEvent?: WorkItemLifecycleEventCallback,
) {
  const workKey = resolveWorkKey({
    propertyId: proposal.propertyId,
    subject: proposal.subject,
    obligationType: proposal.obligationType,
    occurrence: proposal.occurrence,
  });

  const existing = await findWorkItemByWorkKey(proposal.propertyId, workKey, db);

  let workItem = existing;
  let sourceRemainsActive = true;
  if (!workItem) {
    workItem = await createWorkItem({
      propertyId: proposal.propertyId,
      workKey,
      subjectType: proposal.subject.type,
      subjectId: proposal.subject.id,
      obligationType: proposal.obligationType,
      priority: proposal.priority,
      safetyTier: proposal.safetyTier,
      title: proposal.title,
      homeownerReason: proposal.homeownerReason,
      expectedOutcome: proposal.expectedOutcome,
      dueWindowStart: proposal.dueWindowStart,
      dueAt: proposal.dueAt,
      dueWindowEnd: proposal.dueWindowEnd,
      confidence: proposal.confidence,
      missingContext: proposal.missingContext,
      sourceVersion: proposal.source.sourceVersion,
      recurrenceTemplateKey: proposal.occurrence.occurrenceKey ? proposal.occurrence.obligationSlug : null,
      occurrenceKey: proposal.occurrence.occurrenceKey ?? null,
    }, db);
    const event = await recordWorkEvent({
      workItemId: workItem.id,
      eventType: 'WORK_CANDIDATE_DETECTED',
      actorType: 'SYSTEM',
      idempotencyKey: `created:${workKey}`,
      payload: { sourceType: proposal.source.sourceType, sourceEntityId: proposal.source.sourceEntityId },
    }, db);
    // Item #20 (Slice 8: "digest limited to changed or due work"). Only the brand-new-item
    // branch emits; a source-driven due-field refresh (Item #19 Slice 2) on
    // an existing item is not a household-visible lifecycle event.
    // The PropertyChange and recompute request share this command's
    // transaction; the callback is supplementary caller bookkeeping.
    if (event) {
      await emitWorkItemLifecycleChangeWithTransaction(db, workItem, event);
      if (onLifecycleEvent) await onLifecycleEvent(workItem, event);
    }
  } else {
    if (workItem.state === 'CLOSED') sourceRemainsActive = false;
    // A previously verified occurrence becoming observable again is new live
    // work, not a passive source refresh. Reopen it before reconciling the
    // source so the item and its active source cannot disagree.
    const priorSource = workItem.state === 'VERIFIED'
      ? await findWorkSource({
          workItemId: workItem.id,
          sourceType: proposal.source.sourceType,
          sourceEntityId: proposal.source.sourceEntityId,
          sourceRole: proposal.source.sourceRole,
        }, db)
      : null;
    const sourceChanged = priorSource == null || (proposal.source.sourceVersion != null &&
      priorSource.sourceVersion !== proposal.source.sourceVersion);
    if (workItem.state === 'VERIFIED' && sourceChanged) {
      workItem = await transitionWorkItem({
        workItemId: workItem.id,
        to: 'REOPENED',
        actorType: 'SYSTEM',
        idempotencyKey: `source-reopened:${proposal.source.sourceType}:${proposal.source.sourceEntityId}:${proposal.source.sourceVersion ?? 'none'}`,
        payload: { reason: 'source_condition_observed_again' },
      }, db, onLifecycleEvent);
    } else if (workItem.state === 'VERIFIED') {
      // An idempotent retry of the same already-reconciled observation must
      // not silently reactivate the source beneath a verified item.
      sourceRemainsActive = false;
    }
    if (canRefreshPresentationFromSource(workItem.state)) {
      workItem = await refreshWorkItemPresentation(workItem.id, {
        priority: proposal.priority,
        safetyTier: proposal.safetyTier,
        title: proposal.title,
        homeownerReason: proposal.homeownerReason,
        expectedOutcome: proposal.expectedOutcome,
        confidence: proposal.confidence,
        missingContext: proposal.missingContext,
        sourceVersion: proposal.source.sourceVersion,
      }, db);
    }
    // An explicit homeowner reschedule owns the current occurrence timing.
    // Source recalculation may refresh dates again after completion clears
    // the override, but never silently reverses the homeowner's commitment.
    if (!workItem.scheduleOverrideAt && canRefreshDueFieldsFromSource(workItem.state)) {
      workItem = await updateWorkItemDueFields(workItem.id, {
        dueWindowStart: proposal.dueWindowStart ?? null,
        dueAt: proposal.dueAt ?? null,
        dueWindowEnd: proposal.dueWindowEnd ?? null,
      }, {}, db);
    }
  }

  await upsertWorkSource({
    workItemId: workItem.id,
    sourceType: proposal.source.sourceType,
    sourceEntityId: proposal.source.sourceEntityId,
    sourceVersion: proposal.source.sourceVersion,
    sourceRole: proposal.source.sourceRole,
    active: sourceRemainsActive,
  }, db);

  // Idempotent per (source, version): re-resolving the same source at the
  // same version is a no-op event; a genuine version change is a new one.
  await recordWorkEvent({
    workItemId: workItem.id,
    eventType: 'SOURCE_RECONCILED',
    actorType: 'SYSTEM',
    idempotencyKey: `source-reconciled:${proposal.source.sourceType}:${proposal.source.sourceEntityId}:${proposal.source.sourceVersion ?? 'none'}`,
    payload: { sourceType: proposal.source.sourceType, sourceEntityId: proposal.source.sourceEntityId, sourceRole: proposal.source.sourceRole },
  }, db);

  return workItem;
}
