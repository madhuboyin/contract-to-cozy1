import { recordWorkEvent, updateWorkItemSnooze } from '../infrastructure/workItemRepository';

/**
 * Item #19 (§5.15) Slice 1: snooze vs. reschedule vs. defer are three
 * distinct operations (see the item's plan). Snooze never touches state or
 * the due fields — it only suppresses reminders/visibility until
 * snoozedUntil passes, and is fully reversible by calling this again with
 * null.
 */
export async function snoozeWorkItem(input: {
  workItemId: string;
  snoozedUntil: Date | null;
  actorUserId: string;
  idempotencyKey: string;
}) {
  const updated = await updateWorkItemSnooze(input.workItemId, input.snoozedUntil);
  await recordWorkEvent({
    workItemId: input.workItemId,
    eventType: 'WORK_SNOOZED',
    actorType: 'USER',
    actorUserId: input.actorUserId,
    idempotencyKey: input.idempotencyKey,
    payload: { snoozedUntil: input.snoozedUntil ? input.snoozedUntil.toISOString() : null },
  });
  return updated;
}
