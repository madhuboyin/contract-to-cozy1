import { findWorkItemById, recordWorkEvent, updateWorkItemDueFields } from '../infrastructure/workItemRepository';

/**
 * Item #19 (§5.15) Slice 1: reschedule deliberately overwrites the
 * commitment itself (dueAt/window) — unlike snooze, which never touches
 * these fields, and unlike defer, which changes state instead. Stays in
 * whatever state the item is already in. Audited via WORK_RESCHEDULED,
 * carrying the previous value so the change is traceable, matching this
 * module's existing best-effort/event-sourced conventions.
 */
export async function rescheduleWorkItem(input: {
  workItemId: string;
  dueWindowStart?: Date | null;
  dueAt?: Date | null;
  dueWindowEnd?: Date | null;
  actorUserId: string;
  idempotencyKey: string;
}) {
  const current = await findWorkItemById(input.workItemId);
  if (!current) throw new Error(`OperationalWorkItem ${input.workItemId} not found.`);

  const dueFields: { dueWindowStart?: Date | null; dueAt?: Date | null; dueWindowEnd?: Date | null } = {};
  if ('dueWindowStart' in input) dueFields.dueWindowStart = input.dueWindowStart;
  if ('dueAt' in input) dueFields.dueAt = input.dueAt;
  if ('dueWindowEnd' in input) dueFields.dueWindowEnd = input.dueWindowEnd;

  const updated = await updateWorkItemDueFields(input.workItemId, dueFields, { userOverride: true });
  await recordWorkEvent({
    workItemId: input.workItemId,
    eventType: 'WORK_RESCHEDULED',
    actorType: 'USER',
    actorUserId: input.actorUserId,
    idempotencyKey: input.idempotencyKey,
    payload: {
      previousDueAt: current.dueAt ? current.dueAt.toISOString() : null,
      newDueAt: updated.dueAt ? updated.dueAt.toISOString() : null,
      previousDueWindowStart: current.dueWindowStart ? current.dueWindowStart.toISOString() : null,
      newDueWindowStart: updated.dueWindowStart ? updated.dueWindowStart.toISOString() : null,
      previousDueWindowEnd: current.dueWindowEnd ? current.dueWindowEnd.toISOString() : null,
      newDueWindowEnd: updated.dueWindowEnd ? updated.dueWindowEnd.toISOString() : null,
    },
  });
  return updated;
}
