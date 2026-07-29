import { recordWorkEvent, setSupersededBy } from '../infrastructure/workItemRepository';

/**
 * Durable, reversible duplicate/supersession decision (parent plan section
 * 7.5, rule 7: "deduplication decisions are durable and reversible").
 * Superseding does not delete or close the losing item — later slices
 * decide how a superseded item is presented (e.g. hidden but reopenable if
 * the merge turns out wrong).
 */
export async function recordDuplicateDecision(input: {
  workItemId: string;
  supersededByWorkItemId: string;
  actorUserId?: string | null;
  idempotencyKey: string;
}) {
  const updated = await setSupersededBy(input.workItemId, input.supersededByWorkItemId);
  await recordWorkEvent({
    workItemId: input.workItemId,
    eventType: 'SOURCE_RECONCILED',
    actorType: input.actorUserId ? 'USER' : 'SYSTEM',
    actorUserId: input.actorUserId,
    idempotencyKey: input.idempotencyKey,
    payload: { supersededByWorkItemId: input.supersededByWorkItemId, decision: 'DUPLICATE' },
  });
  return updated;
}

export async function reverseDuplicateDecision(input: {
  workItemId: string;
  actorUserId?: string | null;
  idempotencyKey: string;
}) {
  const updated = await setSupersededBy(input.workItemId, null);
  await recordWorkEvent({
    workItemId: input.workItemId,
    eventType: 'SOURCE_RECONCILED',
    actorType: input.actorUserId ? 'USER' : 'SYSTEM',
    actorUserId: input.actorUserId,
    idempotencyKey: input.idempotencyKey,
    payload: { decision: 'DUPLICATE_REVERSED' },
  });
  return updated;
}
