// Deterministic context versions shared between a domain handler and the Suggested Next Action entity validators. They live in this
// leaf module (no handler or execution imports) so a validator can compute the same version a handler stamps without importing the
// handler, which would create an executeOperation -> finalizer -> validator -> handler -> executeOperation load cycle.
import { createHash } from 'node:crypto';

export function inventoryItemContextVersion(item: { id: string; updatedAt: Date }): string {
  return createHash('sha256').update(`${item.id}:${item.updatedAt.toISOString()}`).digest('hex');
}
