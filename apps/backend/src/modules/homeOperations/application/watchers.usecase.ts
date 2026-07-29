import { addWorkItemWatcher, recordWorkEvent, removeWorkItemWatcher } from '../infrastructure/workItemRepository';

// Usecase functions only — no HTTP route yet. Slice 8 owns watcher UX; this
// slice ships the identity-level hook so that later slice doesn't need a
// schema change to display owner/watchers (parent plan section 12, Slice 1
// deliverable "household owner/watchers").

export async function addWatcher(input: {
  workItemId: string;
  userId: string;
  addedByUserId: string;
  idempotencyKey: string;
}) {
  const watcher = await addWorkItemWatcher(input.workItemId, input.userId, input.addedByUserId);
  await recordWorkEvent({
    workItemId: input.workItemId,
    eventType: 'WATCHER_ADDED',
    actorType: 'USER',
    actorUserId: input.addedByUserId,
    idempotencyKey: input.idempotencyKey,
    payload: { userId: input.userId },
  });
  return watcher;
}

export async function removeWatcher(input: {
  workItemId: string;
  userId: string;
  actorUserId: string;
  idempotencyKey: string;
}) {
  const result = await removeWorkItemWatcher(input.workItemId, input.userId);
  await recordWorkEvent({
    workItemId: input.workItemId,
    eventType: 'WATCHER_REMOVED',
    actorType: 'USER',
    actorUserId: input.actorUserId,
    idempotencyKey: input.idempotencyKey,
    payload: { userId: input.userId },
  });
  return result;
}
