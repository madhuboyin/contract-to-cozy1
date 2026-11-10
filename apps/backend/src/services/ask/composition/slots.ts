// Composition FRD §8: typed conversational slots. A slot is read only from deterministic readers of the message (the shared date, item and amount
// readers) or from a validated result, never from free text. Slots live on the session's own executions (`parametersJson.slots`), are never persisted
// anywhere else, and are revalidated before reuse. An elliptical follow-up ("what about the water heater?", "make it 10 years", "what would it cost?")
// resolves against the most recent answered turn's slots. Pure: the database reads are injected.
import type { AskOperationId } from '../askOperationRegistry';
import { INVENTORY_ITEM_ALIASES } from '../support/inventoryItemAliases';
import { parseMonthlyBudget, parseMoneyAmounts } from '../support/moneyAmount';
import { parseTargetDate } from '../support/targetDate';

export const SLOT_TURN_WINDOW = 5;

export interface Slots {
  /** A canonical item word from the shared alias table ("roof", "water heater", "hvac"). */
  item?: string;
  /** The date as the parser labels it ("in 5 years"); no free text. */
  targetDate?: string;
  horizonYears?: number;
  /** Whole dollars. */
  amount?: number;
  /** Only when the homeowner stated it (D4); not inferred. */
  objective?: string;
  /** The answered execution these slots came from. */
  referencedExecutionId?: string;
  /** The operation that answered it, so a follow-up can ask the same thing about another item. */
  operationId?: AskOperationId;
}

const HVAC = /\b(?:hvac|furnace|heat pump|air conditioner|air conditioning|a\/?c(?: unit)?)\b/i;

export function itemSlotOf(message: string): string | undefined {
  const hvac = HVAC.exec(message);
  const alias = INVENTORY_ITEM_ALIASES.find((candidate) => candidate.test.test(message));
  if (alias && (!hvac || alias.test.exec(message)!.index <= hvac.index)) return alias.terms[0];
  return hvac ? 'hvac' : undefined;
}

/** Slots a message states by itself, from the shared readers only. */
export function extractSlots(message: string, now: Date = new Date()): Slots {
  const slots: Slots = {};
  const item = itemSlotOf(message);
  if (item) slots.item = item;
  const date = parseTargetDate(message, now);
  if (date) { slots.targetDate = date.label; slots.horizonYears = Math.max(1, Math.round(date.months / 12)); }
  const amount = parseMonthlyBudget(message) ?? parseMoneyAmounts(message)[0];
  if (amount) slots.amount = amount.dollars;
  return slots;
}

export interface PriorTurn {
  executionId: string;
  operationId: AskOperationId | null;
  propertyId: string | null;
  slots: Slots;
}

/** FR-SLT-1/2: the slots of the most recent answered turn that has any, within the turn window; a slot the newest turn states overrides an older one (FR-SLT-4). */
export function carriedSlots(priorTurns: readonly PriorTurn[], propertyId: string): Slots | null {
  const recent = priorTurns.slice(0, SLOT_TURN_WINDOW).filter((turn) => turn.propertyId === propertyId);
  const merged: Slots = {};
  for (const turn of [...recent].reverse()) Object.assign(merged, turn.slots);
  const newest = recent.find((turn) => Object.keys(turn.slots).length > 0);
  if (!newest) return null;
  merged.referencedExecutionId = newest.executionId;
  if (newest.operationId) merged.operationId = newest.operationId;
  return Object.keys(merged).length ? merged : null;
}

// ---- elliptical wording ----------------------------------------------------------------------------------------------------------------------------
type Template = (item: string, date: string | undefined) => string;
/** What each supported operation asks, rewritten for another item or date. Operations without a template are never rewritten. */
const TEMPLATES: Readonly<Partial<Record<AskOperationId, Template>>> = {
  ITEM_REPLACEMENT_COST: (item, date) => `how much does a new ${item} cost${date ? ` ${date}` : ''}`,
  CAPITAL_ITEM_FUNDING_GOAL: (item, date) => `how much should I save to replace my ${item}${date ? ` ${date}` : ''}`,
  INVENTORY_LOOKUP: (item) => `how old is my ${item}`,
  WARRANTY_LOOKUP: (item) => `what warranties cover my ${item}`,
};
const COST_TEMPLATE = TEMPLATES.ITEM_REPLACEMENT_COST!;

const ABOUT_ITEM = /^\s*(?:and\s+|what about\s+|how about\s+|and what about\s+)(?:my\s+|the\s+|a\s+)?([a-z][a-z /-]{2,30}?)\s*\??\s*$/i;
const CHANGE_DATE = /^\s*(?:make it|and if it(?:'s| is)|what if it(?:'s| is)|and in|how about in|what about in|and for|what about for)\s+(.+?)\s*\??\s*$/i;
const COST_OF_IT = /^\s*(?:and\s+)?(?:what would|how much would|how much is|what does|what will)\s+(?:it|that|this|one|a new one|a replacement)\s+(?:cost|be|run)\s*\??\s*$/i;

export type EllipticalResolution =
  | { kind: 'NOT_ELLIPTICAL' }
  | { kind: 'RESOLVED'; message: string; usedSlots: Slots }
  | { kind: 'NEEDS_SLOT'; missing: 'item' | 'operation' };

/**
 * FR-SLT-2/4: a short elliptical message resolves against the carried slots; a slot the message itself states overrides the carried one. Returns
 * NOT_ELLIPTICAL for anything else so the ordinary router handles it, and NEEDS_SLOT when the message is elliptical but the carried context lacks what it needs.
 */
export function resolveElliptical(message: string, carried: Slots | null, now: Date = new Date()): EllipticalResolution {
  const own = extractSlots(message, now);
  const about = ABOUT_ITEM.exec(message);
  if (about && own.item) {
    // "what about the water heater?": the same question as the last turn, about the item the homeowner just named.
    const template = carried?.operationId ? TEMPLATES[carried.operationId] : undefined;
    if (!template) return { kind: 'NEEDS_SLOT', missing: 'operation' };
    return { kind: 'RESOLVED', message: template(own.item, carried?.targetDate), usedSlots: { ...carried, item: own.item } };
  }
  const change = CHANGE_DATE.exec(message);
  const date = change ? parseTargetDate(`in ${change[1].replace(/^in\s+/i, '')}`, now) ?? parseTargetDate(change[1], now) : null;
  if (change && date) {
    const template = carried?.operationId ? TEMPLATES[carried.operationId] : undefined;
    if (!carried?.item) return { kind: 'NEEDS_SLOT', missing: 'item' };
    if (!template) return { kind: 'NEEDS_SLOT', missing: 'operation' };
    return { kind: 'RESOLVED', message: template(carried.item, date.label), usedSlots: { ...carried, targetDate: date.label } };
  }
  if (COST_OF_IT.test(message)) {
    if (!carried?.item) return { kind: 'NEEDS_SLOT', missing: 'item' };
    return { kind: 'RESOLVED', message: COST_TEMPLATE(carried.item, carried.targetDate), usedSlots: carried };
  }
  return { kind: 'NOT_ELLIPTICAL' };
}

// ---- revalidation (FR-SLT-3) -----------------------------------------------------------------------------------------------------------------------
export interface SlotRevalidation {
  /** The item still exists on this home. */
  itemExists: (item: string) => Promise<boolean>;
  /** The user may still reach the property. */
  propertyAccessible: () => Promise<boolean>;
}

export type Revalidated = { ok: true } | { ok: false; reason: 'PROPERTY_NOT_ACCESSIBLE' | 'ITEM_NOT_FOUND' };

/** Before a carried slot is reused: authorization, then the entity. A failure never silently falls back to a default; the caller asks one focused question. */
export async function revalidateSlots(slots: Slots, checks: SlotRevalidation): Promise<Revalidated> {
  if (!(await checks.propertyAccessible())) return { ok: false, reason: 'PROPERTY_NOT_ACCESSIBLE' };
  if (slots.item && !(await checks.itemExists(slots.item))) return { ok: false, reason: 'ITEM_NOT_FOUND' };
  return { ok: true };
}

/** A slot is persisted only as typed values; this keeps it so (no message text, bounded length). */
export function sanitizeSlots(slots: Slots): Slots {
  const out: Slots = {};
  if (slots.item && /^[a-z][a-z /-]{1,30}$/.test(slots.item)) out.item = slots.item;
  if (slots.targetDate && slots.targetDate.length <= 40) out.targetDate = slots.targetDate;
  if (Number.isFinite(slots.horizonYears)) out.horizonYears = slots.horizonYears;
  if (Number.isFinite(slots.amount)) out.amount = slots.amount;
  if (slots.objective && /^[A-Z_]{2,40}$/.test(slots.objective)) out.objective = slots.objective;
  return out;
}
