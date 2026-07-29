import type { ProposedWorkItem } from '../domain/sourceAdapter';
import { resolveWorkKey } from '../domain/workKey';
import { canRefreshFromSource } from '../domain/transitions';
import {
  createWorkItem,
  findWorkItemByWorkKey,
  recordWorkEvent,
  refreshWorkItemPresentation,
  upsertWorkSource,
} from '../infrastructure/workItemRepository';

/**
 * The identity resolver (parent plan section 7.5, rule 2: "an identity
 * resolver merges or links candidates before presentation").
 *
 * - No existing item for this workKey: create it (CANDIDATE/PROPOSED),
 *   link the proposing source, and record WORK_CANDIDATE_DETECTED.
 * - An item already exists: always reconcile the source link (so a source
 *   whose copy/version changed is visible), but only refresh the item's
 *   homeowner-visible presentation fields while it is still CANDIDATE
 *   (canRefreshFromSource) — once accepted, recalculation must stop
 *   silently rewriting it.
 *
 * This is what makes "source copy changes do not create duplicate work"
 * and "one obligation resolves to one work item across recalculation" true
 * by construction, not by convention.
 */
export async function resolveAndUpsertWorkItem(proposal: ProposedWorkItem) {
  const workKey = resolveWorkKey({
    propertyId: proposal.propertyId,
    subject: proposal.subject,
    obligationType: proposal.obligationType,
    occurrence: proposal.occurrence,
  });

  const existing = await findWorkItemByWorkKey(proposal.propertyId, workKey);

  let workItem = existing;
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
    });
    await recordWorkEvent({
      workItemId: workItem.id,
      eventType: 'WORK_CANDIDATE_DETECTED',
      actorType: 'SYSTEM',
      idempotencyKey: `created:${workKey}`,
      payload: { sourceType: proposal.source.sourceType, sourceEntityId: proposal.source.sourceEntityId },
    });
  } else if (canRefreshFromSource(workItem.state)) {
    workItem = await refreshWorkItemPresentation(workItem.id, {
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
    });
  }

  await upsertWorkSource({
    workItemId: workItem.id,
    sourceType: proposal.source.sourceType,
    sourceEntityId: proposal.source.sourceEntityId,
    sourceVersion: proposal.source.sourceVersion,
    sourceRole: proposal.source.sourceRole,
  });

  // Idempotent per (source, version): re-resolving the same source at the
  // same version is a no-op event; a genuine version change is a new one.
  await recordWorkEvent({
    workItemId: workItem.id,
    eventType: 'SOURCE_RECONCILED',
    actorType: 'SYSTEM',
    idempotencyKey: `source-reconciled:${proposal.source.sourceType}:${proposal.source.sourceEntityId}:${proposal.source.sourceVersion ?? 'none'}`,
    payload: { sourceType: proposal.source.sourceType, sourceEntityId: proposal.source.sourceEntityId, sourceRole: proposal.source.sourceRole },
  });

  return workItem;
}
