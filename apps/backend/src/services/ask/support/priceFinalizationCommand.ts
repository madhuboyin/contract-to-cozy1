// Recording, changing and finalizing an accepted price inside Ask (register P0 "Price Finalization"; FRD v1.311). Pure: the declared messages and
// action ids, the form's fields and validation, and the input the canonical price-finalization service takes. The handler, the capture path and the
// registries share it.
//
// Declared-action only. Three starting points reach the same record: a Negotiation Shield review, a Quote Comparison with a selected proposal, or a
// vendor entered by hand. A draft is changed (Change the accepted terms) and then finalized (Finalize this price record).
import { z } from 'zod';

export const PRICE_FINALIZATION_ENTITY_TYPE = 'PRICE_FINALIZATION';
/** The home itself, the target of a hand-entered start (the record does not exist yet). */
export const PRICE_FINALIZATION_PROPERTY_ENTITY_TYPE = 'PRICE_FINALIZATION_PROPERTY';

export const PRICE_COMMAND_MESSAGES = {
  START_NS: 'Record the accepted price for this negotiation review.',
  START_QUOTE: 'Record the final price from the selected proposal.',
  START_MANUAL: 'Record an accepted price for a vendor.',
  EDIT: 'Change the accepted terms of this price record.',
  FINALIZE: 'Finalize this price record.',
} as const;
export type PriceCommandKind = keyof typeof PRICE_COMMAND_MESSAGES;

export const PRICE_COMMAND_ACTION_IDS = {
  START_NS: 'price-finalization-start-negotiation',
  START_QUOTE: 'price-finalization-start-quote',
  START_MANUAL: 'price-finalization-start-manual',
  EDIT: 'price-finalization-edit',
  FINALIZE: 'price-finalization-finalize',
} as const;

export function priceCommandKindFromMessage(message: string): PriceCommandKind | null {
  const found = (Object.entries(PRICE_COMMAND_MESSAGES) as Array<[PriceCommandKind, string]>).find(([, value]) => value === message);
  return found ? found[0] : null;
}

/** The entity type each command's launch must carry: a record for Change and Finalize, the review, the comparison, or the home for a start. */
export function priceCommandEntityType(kind: PriceCommandKind, negotiationCaseEntityType: string, quoteWorkspaceEntityType: string): string {
  if (kind === 'START_NS') return negotiationCaseEntityType;
  if (kind === 'START_QUOTE') return quoteWorkspaceEntityType;
  if (kind === 'START_MANUAL') return PRICE_FINALIZATION_PROPERTY_ENTITY_TYPE;
  return PRICE_FINALIZATION_ENTITY_TYPE;
}

export const PRICE_FORM_CAPTURE_KEYS = {
  START: 'PRICE_FINALIZATION_START',
  EDIT: 'PRICE_FINALIZATION_EDIT',
  FINALIZE: 'PRICE_FINALIZATION_FINALIZE',
} as const;
export type PriceFormKind = keyof typeof PRICE_FORM_CAPTURE_KEYS;
export const priceFormKindFromCaptureKey = (key: string): PriceFormKind | null =>
  ((Object.entries(PRICE_FORM_CAPTURE_KEYS) as Array<[PriceFormKind, string]>).find(([, value]) => value === key)?.[0]) ?? null;
/** Which form a command opens. A quote-sourced start has no form: it is prepared from the selected proposal. */
export const priceFormKindForCommand = (kind: PriceCommandKind): PriceFormKind | null =>
  kind === 'START_NS' || kind === 'START_MANUAL' ? 'START' : kind === 'EDIT' ? 'EDIT' : kind === 'FINALIZE' ? 'FINALIZE' : null;

const blank = (value: unknown) => (value === '' || value === undefined || value === null ? null : value);
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max).nullable()).optional();
const amount = z.preprocess(blank, z.coerce.number().nonnegative().max(100_000_000).nullable()).optional();
const positiveAmount = z.preprocess(blank, z.coerce.number().positive().max(100_000_000).nullable()).optional();

export const PriceTermsInputSchema = z.object({
  vendorName: text(160),
  quotePrice: amount,
  acceptedPrice: positiveAmount,
  scopeSummary: text(2000),
  paymentTerms: text(2000),
  warrantyTerms: text(2000),
  timelineTerms: text(2000),
  notes: text(4000),
}).strict();

export const PriceFinalizeInputSchema = z.object({ acceptedPrice: z.coerce.number().positive().max(100_000_000) }).strict();

export interface PriceTermsInput {
  vendorName: string | null; quotePrice: number | null; acceptedPrice: number | null;
  scopeSummary: string | null; paymentTerms: string | null; warrantyTerms: string | null; timelineTerms: string | null; notes: string | null;
}
export type PriceFormData = PriceTermsInput | { acceptedPrice: number };

/** Validates a submitted form (or a stored confirmation parameter). A new record needs a vendor; a finalize needs a positive accepted price. */
export function parsePriceFormAnswer(kind: PriceFormKind, answer: unknown): { success: true; data: PriceFormData } | { success: false; reason: 'INVALID' | 'VENDOR_REQUIRED' } {
  if (kind === 'FINALIZE') {
    const parsed = PriceFinalizeInputSchema.safeParse(answer);
    return parsed.success ? { success: true, data: { acceptedPrice: Math.round(parsed.data.acceptedPrice * 100) / 100 } } : { success: false, reason: 'INVALID' };
  }
  const parsed = PriceTermsInputSchema.safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const value = parsed.data;
  const round = (n: number | null | undefined) => (n === null || n === undefined ? null : Math.round(n * 100) / 100);
  const data: PriceTermsInput = {
    vendorName: (value.vendorName ?? null) as string | null, quotePrice: round(value.quotePrice as number | null | undefined), acceptedPrice: round(value.acceptedPrice as number | null | undefined),
    scopeSummary: (value.scopeSummary ?? null) as string | null, paymentTerms: (value.paymentTerms ?? null) as string | null,
    warrantyTerms: (value.warrantyTerms ?? null) as string | null, timelineTerms: (value.timelineTerms ?? null) as string | null, notes: (value.notes ?? null) as string | null,
  };
  if (kind === 'START' && !data.vendorName) return { success: false, reason: 'VENDOR_REQUIRED' };
  return { success: true, data };
}

export interface PriceTermChange { field: keyof PriceTermsInput; label: string; before: string | null; after: string | null }
const LABELS: Record<keyof PriceTermsInput, string> = {
  vendorName: 'Vendor', quotePrice: 'Quoted price', acceptedPrice: 'Accepted price', scopeSummary: 'Scope', paymentTerms: 'Payment terms',
  warrantyTerms: 'Warranty', timelineTerms: 'Timeline', notes: 'Notes',
};
/** Field-by-field changes against what is recorded, so the review shows exactly what changes. */
export function priceTermChanges(current: PriceTermsInput, next: PriceTermsInput): PriceTermChange[] {
  const out: PriceTermChange[] = [];
  for (const field of Object.keys(LABELS) as Array<keyof PriceTermsInput>) {
    const before = current[field] ?? null; const after = next[field] ?? null;
    if (before !== after) out.push({ field, label: LABELS[field], before: before === null ? null : String(before), after: after === null ? null : String(after) });
  }
  return out;
}

/** What the canonical createDraft takes for a start from a Negotiation Shield review or by hand: USD, nothing left to the page's defaults. */
export function priceStartInput(kind: 'START_NS' | 'START_MANUAL', input: PriceTermsInput, negotiationShieldCaseId?: string) {
  return {
    sourceType: kind === 'START_NS' ? 'NEGOTIATION_SHIELD' : 'MANUAL',
    ...(negotiationShieldCaseId ? { negotiationShieldCaseId } : {}),
    currency: 'USD',
    ...(input.vendorName ? { vendorName: input.vendorName } : {}),
    ...(input.quotePrice !== null ? { quotePrice: input.quotePrice } : {}),
    ...(input.acceptedPrice !== null ? { acceptedPrice: input.acceptedPrice } : {}),
    ...(input.scopeSummary ? { scopeSummary: input.scopeSummary } : {}),
    ...(input.paymentTerms ? { paymentTerms: input.paymentTerms } : {}),
    ...(input.warrantyTerms ? { warrantyTerms: input.warrantyTerms } : {}),
    ...(input.timelineTerms ? { timelineTerms: input.timelineTerms } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  };
}
