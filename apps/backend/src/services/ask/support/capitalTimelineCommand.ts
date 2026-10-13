// Adjusting the Capital Timeline inside Ask (register P1 "Capital Timeline": window correction, inclusion / exclusion and planning assumptions; FRD v1.318).
// Pure: messages, action ids, the adjustment form and its per-type validation, and the canonical override payloads.
//
// The page lets a household correct what the timeline assumed about one item: a planned date, a planned window, a cost range, how many years are left,
// leaving the item out, or a note. Each is an "override" the next timeline run honours; saving one marks the latest timeline out of date. Ask adds and
// removes those overrides through the same service, after the same financial-context applicability check.
import { z } from 'zod';

export const CAPITAL_PROPERTY_ENTITY_TYPE = 'CAPITAL_TIMELINE_PROPERTY';
export const CAPITAL_OVERRIDE_ENTITY_TYPE = 'CAPITAL_TIMELINE_OVERRIDE';
export const CAPITAL_COMMAND_MESSAGES = {
  ADD: 'Adjust what the capital timeline assumes for an item.',
  REMOVE: 'Remove this capital timeline adjustment.',
} as const;
export type CapitalCommandKind = keyof typeof CAPITAL_COMMAND_MESSAGES;
export const CAPITAL_COMMAND_ACTION_IDS = { ADD: 'capital-timeline-adjust', REMOVE: 'capital-timeline-remove-adjustment' } as const;
export const capitalCommandKindFromMessage = (message: string): CapitalCommandKind | null =>
  ((Object.entries(CAPITAL_COMMAND_MESSAGES) as Array<[CapitalCommandKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export const CAPITAL_ADJUST_CAPTURE_KEY = 'CAPITAL_TIMELINE_ADJUST';

export const CAPITAL_OVERRIDE_TYPES = ['PLANNED_DATE', 'PLANNED_WINDOW', 'COST_OVERRIDE', 'ADJUST_REMAINING_LIFE', 'DISABLE_ITEM', 'NOTE'] as const;
export const CAPITAL_OVERRIDE_TYPE_LABELS: Record<string, string> = {
  PLANNED_DATE: 'I plan to replace it on a date', PLANNED_WINDOW: 'I plan to replace it in a window', COST_OVERRIDE: 'Use my own cost range',
  ADJUST_REMAINING_LIFE: 'Change how many years it has left', DISABLE_ITEM: 'Leave it off the timeline', NOTE: 'Add a note the timeline should consider',
};
export const CAPITAL_OVERRIDE_SHORT_LABELS: Record<string, string> = {
  PLANNED_DATE: 'Planned date', PLANNED_WINDOW: 'Planned window', COST_OVERRIDE: 'Cost range', ADJUST_REMAINING_LIFE: 'Remaining life', DISABLE_ITEM: 'Left off the timeline', NOTE: 'Note',
};

const blank = (value: unknown) => (value === '' || value === undefined || value === null ? null : value);
const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((value) => value.value),
]);
const optionalDate = z.preprocess(blank, exactDate.nullable()).optional();
const optionalAmount = z.preprocess(blank, z.coerce.number().nonnegative().max(100_000_000).nullable()).optional();

export const CapitalAdjustInputSchema = z.object({
  inventoryItemId: z.preprocess(blank, z.string().uuid().nullable()).optional(),
  type: z.enum(CAPITAL_OVERRIDE_TYPES),
  plannedDate: optionalDate, windowStart: optionalDate, windowEnd: optionalDate,
  minCost: optionalAmount, maxCost: optionalAmount,
  remainingYears: z.preprocess(blank, z.coerce.number().min(0).max(100).nullable()).optional(),
  note: z.preprocess(blank, z.string().trim().max(500).nullable()).optional(),
}).strict();

export interface CapitalAdjustInput {
  inventoryItemId: string | null; type: (typeof CAPITAL_OVERRIDE_TYPES)[number];
  payload: Record<string, unknown>; note: string | null;
}

/**
 * Validates a submitted form (or a stored confirmation parameter) and builds the canonical override: each type needs its own fields, and every type but
 * a plain note needs an item (an item-less override would apply to nothing the timeline can match).
 */
export function parseCapitalAdjustAnswer(answer: unknown): { success: true; data: CapitalAdjustInput } | { success: false; reason: 'INVALID' | 'ITEM_REQUIRED' | 'FIELDS_REQUIRED' | 'ORDER' } {
  const parsed = CapitalAdjustInputSchema.safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const v = parsed.data;
  const itemId = (v.inventoryItemId ?? null) as string | null;
  const note = (v.note ?? null) as string | null;
  if (v.type !== 'NOTE' && !itemId) return { success: false, reason: 'ITEM_REQUIRED' };
  const plannedDate = (v.plannedDate ?? null) as string | null;
  const windowStart = (v.windowStart ?? null) as string | null;
  const windowEnd = (v.windowEnd ?? null) as string | null;
  const minCost = (v.minCost ?? null) as number | null;
  const maxCost = (v.maxCost ?? null) as number | null;
  const years = (v.remainingYears ?? null) as number | null;
  let payload: Record<string, unknown> = {};
  if (v.type === 'PLANNED_DATE') {
    if (!plannedDate) return { success: false, reason: 'FIELDS_REQUIRED' };
    payload = { date: plannedDate };
  } else if (v.type === 'PLANNED_WINDOW') {
    if (!windowStart || !windowEnd) return { success: false, reason: 'FIELDS_REQUIRED' };
    if (windowEnd < windowStart) return { success: false, reason: 'ORDER' };
    payload = { start: windowStart, end: windowEnd };
  } else if (v.type === 'COST_OVERRIDE') {
    if (minCost === null && maxCost === null) return { success: false, reason: 'FIELDS_REQUIRED' };
    if (minCost !== null && maxCost !== null && maxCost < minCost) return { success: false, reason: 'ORDER' };
    payload = { ...(minCost !== null ? { minCents: Math.round(minCost * 100) } : {}), ...(maxCost !== null ? { maxCents: Math.round(maxCost * 100) } : {}) };
  } else if (v.type === 'ADJUST_REMAINING_LIFE') {
    if (years === null) return { success: false, reason: 'FIELDS_REQUIRED' };
    payload = { remainingYears: years };
  } else if (v.type === 'NOTE' && !note) {
    return { success: false, reason: 'FIELDS_REQUIRED' };
  }
  return { success: true, data: { inventoryItemId: itemId, type: v.type, payload, note } };
}

/** The form's own shape for a stored adjustment (dates, dollars), so a stored review re-validates through the same schema. */
export function capitalAdjustFormAnswer(input: CapitalAdjustInput): Record<string, unknown> {
  const p = input.payload as { date?: string; start?: string; end?: string; minCents?: number; maxCents?: number; remainingYears?: number };
  return {
    inventoryItemId: input.inventoryItemId, type: input.type, plannedDate: p.date ?? null, windowStart: p.start ?? null, windowEnd: p.end ?? null,
    minCost: p.minCents === undefined ? null : p.minCents / 100, maxCost: p.maxCents === undefined ? null : p.maxCents / 100, remainingYears: p.remainingYears ?? null, note: input.note,
  };
}
