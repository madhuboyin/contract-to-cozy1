// Deterministic context versions shared between a domain handler and the Suggested Next Action entity validators. They live in this
// leaf module (no handler or execution imports) so a validator can compute the same version a handler stamps without importing the
// handler, which would create an executeOperation -> finalizer -> validator -> handler -> executeOperation load cycle.
import { createHash } from 'node:crypto';

export function inventoryItemContextVersion(item: { id: string; updatedAt: Date }): string {
  return createHash('sha256').update(`${item.id}:${item.updatedAt.toISOString()}`).digest('hex');
}

export function roomContextVersion(room: { id: string; updatedAt: Date }): string {
  return createHash('sha256').update(`${room.id}:${room.updatedAt.toISOString()}`).digest('hex');
}

export function maintenanceTaskVersion(task: { id: string; status: string; updatedAt: Date; snoozedUntil?: Date | null }): string {
  return createHash('sha256').update(JSON.stringify({ id: task.id, status: task.status, updatedAt: task.updatedAt, snoozedUntil: task.snoozedUntil ?? null })).digest('hex');
}

export function warrantyContextVersion(warranty: { id: string; updatedAt: Date }): string {
  return createHash('sha256').update(`${warranty.id}:${warranty.updatedAt.toISOString()}`).digest('hex');
}

export function homeEventContextVersion(event: { id: string; revision: number }): string {
  return createHash('sha256').update(`${event.id}:${event.revision}`).digest('hex');
}
