import { recordWorkEvent, setWorkItemOwner } from '../infrastructure/workItemRepository';

export async function assignWorkItemOwner(input: {
  workItemId: string;
  ownerUserId: string | null;
  actorUserId: string;
  idempotencyKey: string;
}) {
  const updated = await setWorkItemOwner(input.workItemId, input.ownerUserId);
  await recordWorkEvent({
    workItemId: input.workItemId,
    eventType: 'WORK_ASSIGNED',
    actorType: 'USER',
    actorUserId: input.actorUserId,
    idempotencyKey: input.idempotencyKey,
    payload: { ownerUserId: input.ownerUserId },
  });
  return updated;
}
