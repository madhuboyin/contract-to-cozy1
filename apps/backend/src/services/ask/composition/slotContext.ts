// Composition FRD §8: resolving an elliptical follow-up against the session's own recent answered turns. The database reads are injected so this is tested
// with fakes. Slots are read only from `parametersJson.slots` of the current user's executions in the SAME session and property, never from raw history.
import type { AskOperationId } from '../askOperationRegistry';
import {
  SLOT_TURN_WINDOW, carriedSlots, resolveElliptical, revalidateSlots, sanitizeSlots,
  type PriorTurn, type SlotRevalidation, type Slots,
} from './slots';

const ELLIPTICAL_SHAPE = /^\s*(?:(?:and\s+|what about\s+|how about\s+|and what about\s+)(?:my\s+|the\s+|a\s+)?[a-z][a-z /-]{2,30}?\s*\??|(?:make it|and if it(?:'s| is)|what if it(?:'s| is)|and in|how about in|what about in|and for|what about for)\s+.+?\s*\??|(?:and\s+)?(?:what would|how much would|how much is|what does|what will)\s+(?:it|that|this|one|a new one|a replacement)\s+(?:cost|be|run)\s*\??)\s*$/i;
/** A cheap check so an ordinary question never costs a database read. */
export const isEllipticalShape = (message: string): boolean => ELLIPTICAL_SHAPE.test(message);

export interface SlotDb {
  askExecution: {
    findMany(args: { where: Record<string, unknown>; orderBy: Record<string, string>; take: number; select: Record<string, boolean> }): Promise<Array<{ id: string; operationId: string | null; propertyId: string | null; parametersJson: unknown }>>;
  };
}

export type SlotFollowUp =
  | { kind: 'RESOLVED'; message: string; slots: Slots }
  | { kind: 'DECLINED'; reason: 'NEEDS_SLOT' | 'PROPERTY_NOT_ACCESSIBLE' | 'ITEM_NOT_FOUND'; detail: string };

const slotsOfRow = (parametersJson: unknown): Slots => {
  const raw = parametersJson && typeof parametersJson === 'object' && !Array.isArray(parametersJson) ? (parametersJson as Record<string, unknown>).slots : null;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? sanitizeSlots(raw as Slots) : {};
};

export async function priorTurnsOf(db: SlotDb, userId: string, sessionId: string, propertyId: string): Promise<PriorTurn[]> {
  const rows = await db.askExecution.findMany({
    // Component children are not turns the homeowner had (FR-PER-12); only answered, ordinary executions of this session carry slots.
    where: { sessionId, userId, propertyId, parentRole: null, status: { in: ['ANSWERED', 'COMPLETED', 'READY_WITH_LIMITATIONS'] } },
    orderBy: { createdAt: 'desc' }, take: SLOT_TURN_WINDOW, select: { id: true, operationId: true, propertyId: true, parametersJson: true },
  });
  return rows.map((row) => ({ executionId: row.id, operationId: row.operationId as AskOperationId | null, propertyId: row.propertyId, slots: slotsOfRow(row.parametersJson) }));
}

/** Null when the message is not elliptical (the ordinary router handles it). */
export async function resolveSlotFollowUp(input: {
  db: SlotDb; userId: string; sessionId: string; propertyId: string; message: string; revalidation: SlotRevalidation; now?: Date;
}): Promise<SlotFollowUp | null> {
  if (!isEllipticalShape(input.message)) return null;
  const carried = carriedSlots(await priorTurnsOf(input.db, input.userId, input.sessionId, input.propertyId), input.propertyId);
  const resolution = resolveElliptical(input.message, carried, input.now);
  if (resolution.kind === 'NOT_ELLIPTICAL') return null;
  if (resolution.kind === 'NEEDS_SLOT') return { kind: 'DECLINED', reason: 'NEEDS_SLOT', detail: `The earlier turns do not say which ${resolution.missing} you mean.` };
  // FR-SLT-3: authorization, then the entity, before a carried slot is reused; a failure never falls back to a default.
  const checked = await revalidateSlots(resolution.usedSlots, input.revalidation);
  if (!checked.ok) return { kind: 'DECLINED', reason: checked.reason, detail: checked.reason === 'ITEM_NOT_FOUND' ? 'That item is no longer on this home.' : 'This home is no longer available.' };
  return { kind: 'RESOLVED', message: resolution.message, slots: resolution.usedSlots };
}
