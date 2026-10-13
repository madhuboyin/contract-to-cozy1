// Managing the proposals of a quote comparison inside Ask (register P0 "Quote Comparison": add, select, reject/restore, remove; FRD v1.309).
// Pure: the declared messages and action ids, the add-a-proposal form's fields and validation, and the input the canonical createQuoteProposal takes.
// The handler, the capture path and the registries share it.
//
// Declared-action only: reached from a row or summary action on the Quote Comparison review, never by fuzzy retrieval. A row action carries its message
// and the row's entity (the quote), so the message is what tells the actions apart.
import { z } from 'zod';

export const QUOTE_WORKSPACE_ENTITY_TYPE = 'QUOTE_COMPARISON_WORKSPACE';
export const QUOTE_ENTITY_TYPE = 'QUOTE_COMPARISON_QUOTE';

export const QUOTE_COMMAND_MESSAGES = {
  ADD: 'Add a proposal to this quote comparison.',
  IMPORT: 'Add a proposal from a document on file.',
  SELECT: 'Select this proposal for the decision.',
  REJECT: 'Reject this proposal.',
  RESTORE: 'Return this proposal to consideration.',
  REMOVE: 'Remove this proposal.',
  EDIT: 'Change the details of this proposal.',
  CONFIRM: 'Confirm the facts of this proposal.',
  CLARIFY: 'Ask the provider a question about this proposal.',
  RESOLVE: 'Record the provider answer to a question.',
  CLOSE: 'Close this quote decision.',
} as const;
export type QuoteCommandKind = keyof typeof QUOTE_COMMAND_MESSAGES;

export const QUOTE_COMMAND_ACTION_IDS = {
  ADD: 'quote-comparison-add-quote',
  IMPORT: 'quote-comparison-import-quote',
  SELECT: 'quote-comparison-select-quote',
  REJECT: 'quote-comparison-reject-quote',
  RESTORE: 'quote-comparison-restore-quote',
  REMOVE: 'quote-comparison-remove-quote',
  EDIT: 'quote-comparison-edit-quote',
  CONFIRM: 'quote-comparison-confirm-quote',
  CLARIFY: 'quote-comparison-clarify-quote',
  RESOLVE: 'quote-comparison-resolve-clarification',
  CLOSE: 'quote-comparison-close-decision',
} as const;

/** The decision itself is the target of Add and Close; every other command targets one proposal. */
export const quoteCommandTargetsWorkspace = (kind: QuoteCommandKind): boolean => kind === 'ADD' || kind === 'CLOSE' || kind === 'IMPORT';

export function quoteCommandKindFromMessage(message: string): QuoteCommandKind | null {
  const found = (Object.entries(QUOTE_COMMAND_MESSAGES) as Array<[QuoteCommandKind, string]>).find(([, value]) => value === message);
  return found ? found[0] : null;
}

export const QUOTE_ADD_CAPTURE_KEY = 'QUOTE_COMPARISON_ADD_QUOTE';
/** Every command that opens a form, and the capture key its form carries. */
export const QUOTE_FORM_CAPTURE_KEYS = {
  ADD: QUOTE_ADD_CAPTURE_KEY,
  IMPORT: 'QUOTE_COMPARISON_IMPORT',
  EDIT: 'QUOTE_COMPARISON_EDIT_QUOTE',
  CLARIFY: 'QUOTE_COMPARISON_CLARIFY',
  RESOLVE: 'QUOTE_COMPARISON_RESOLVE',
  CLOSE: 'QUOTE_COMPARISON_CLOSE',
} as const;
export type QuoteFormKind = keyof typeof QUOTE_FORM_CAPTURE_KEYS;
export const quoteFormKindFromCaptureKey = (key: string): QuoteFormKind | null =>
  ((Object.entries(QUOTE_FORM_CAPTURE_KEYS) as Array<[QuoteFormKind, string]>).find(([, value]) => value === key)?.[0]) ?? null;

const blank = (value: unknown) => (value === '' || value === undefined || value === null ? null : value);
const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((value) => value.value),
]);

export const QuoteAddInputSchema = z.object({
  vendorName: z.string().trim().min(1).max(300),
  quoteAmount: z.coerce.number().nonnegative().max(100_000_000),
  scopeSummary: z.preprocess(blank, z.string().trim().max(4000).nullable()).optional(),
  quoteDate: z.preprocess(blank, exactDate.nullable()).optional(),
  expirationDate: z.preprocess(blank, exactDate.nullable()).optional(),
  warranty: z.preprocess(blank, z.string().trim().max(500).nullable()).optional(),
  notes: z.preprocess(blank, z.string().trim().max(2000).nullable()).optional(),
}).strict();

export interface QuoteAddInput {
  vendorName: string;
  quoteAmount: number;
  scopeSummary: string | null;
  quoteDate: string | null;
  expirationDate: string | null;
  warranty: string | null;
  notes: string | null;
}

/** Validates a submitted form (or a stored confirmation parameter). An expiry before the quote date is a validation failure. */
export function parseQuoteAddAnswer(answer: unknown): { success: true; data: QuoteAddInput } | { success: false; reason: 'INVALID' | 'DATES' } {
  const parsed = QuoteAddInputSchema.safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const value = parsed.data;
  const quoteDate = (value.quoteDate ?? null) as string | null;
  const expirationDate = (value.expirationDate ?? null) as string | null;
  if (quoteDate && expirationDate && expirationDate < quoteDate) return { success: false, reason: 'DATES' };
  return {
    success: true,
    data: {
      vendorName: value.vendorName, quoteAmount: value.quoteAmount,
      scopeSummary: (value.scopeSummary ?? null) as string | null,
      quoteDate, expirationDate,
      warranty: (value.warranty ?? null) as string | null,
      notes: (value.notes ?? null) as string | null,
    },
  };
}

const atNoon = (date: string) => `${date}T12:00:00.000Z`;

/** What the canonical createQuoteProposal takes: a manual proposal, USD, with the warranty as a WARRANTY term. */
export function quoteAddProposalInput(input: QuoteAddInput) {
  return {
    vendorName: input.vendorName,
    quoteAmount: input.quoteAmount,
    currency: 'USD',
    sourceType: 'MANUAL',
    ...(input.scopeSummary ? { scopeSummary: input.scopeSummary } : {}),
    ...(input.quoteDate ? { quoteDate: atNoon(input.quoteDate) } : {}),
    ...(input.expirationDate ? { expirationDate: atNoon(input.expirationDate) } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    ...(input.warranty ? { terms: [{ type: 'WARRANTY' as const, label: 'Warranty', value: input.warranty }] } : {}),
  };
}

export const QuoteClarifyInputSchema = z.object({ question: z.string().trim().min(3).max(2000) }).strict();
export const QuoteResolveInputSchema = z.object({ response: z.string().trim().min(1).max(4000) }).strict();
export const QUOTE_CLOSE_OUTCOMES = ['DECLINED', 'DEFERRED'] as const;
export const QUOTE_CLOSE_OUTCOME_LABELS: Record<string, string> = { DECLINED: 'I am not going ahead with any of these', DEFERRED: 'I will decide later' };
export const QuoteCloseInputSchema = z.object({
  outcome: z.enum(QUOTE_CLOSE_OUTCOMES),
  reason: z.preprocess(blank, z.string().trim().max(1000).nullable()).optional(),
}).strict();

export const QuoteImportInputSchema = z.object({
  recordId: z.string().trim().min(1).max(100),
  onNewerVersion: z.preprocess(blank, z.enum(['REPLACE', 'RETAIN_BOTH']).nullable()).optional(),
}).strict();
export interface QuoteImportInput { recordId: string; onNewerVersion: 'REPLACE' | 'RETAIN_BOTH' | null }

export type QuoteFormData = QuoteImportInput | QuoteAddInput | { question: string } | { response: string } | { outcome: 'DECLINED' | 'DEFERRED'; reason: string | null };

/** Validates a submitted form (or a stored confirmation parameter) for the command that opened it. */
export function parseQuoteFormAnswer(kind: QuoteFormKind, answer: unknown): { success: true; data: QuoteFormData } | { success: false; reason: 'INVALID' | 'DATES' } {
  if (kind === 'IMPORT') {
    const parsed = QuoteImportInputSchema.safeParse(answer);
    return parsed.success ? { success: true, data: { recordId: parsed.data.recordId, onNewerVersion: (parsed.data.onNewerVersion ?? null) as 'REPLACE' | 'RETAIN_BOTH' | null } } : { success: false, reason: 'INVALID' };
  }
  if (kind === 'ADD' || kind === 'EDIT') return parseQuoteAddAnswer(answer);
  if (kind === 'CLARIFY') {
    const parsed = QuoteClarifyInputSchema.safeParse(answer);
    return parsed.success ? { success: true, data: { question: parsed.data.question } } : { success: false, reason: 'INVALID' };
  }
  if (kind === 'RESOLVE') {
    const parsed = QuoteResolveInputSchema.safeParse(answer);
    return parsed.success ? { success: true, data: { response: parsed.data.response } } : { success: false, reason: 'INVALID' };
  }
  const parsed = QuoteCloseInputSchema.safeParse(answer);
  return parsed.success
    ? { success: true, data: { outcome: parsed.data.outcome, reason: (parsed.data.reason ?? null) as string | null } }
    : { success: false, reason: 'INVALID' };
}

/** The changes an edit makes, field by field, so the review shows exactly what changes. Only changed fields are sent to the canonical update. */
export interface QuoteCurrentValues {
  vendorName: string; quoteAmount: number; scopeSummary: string | null; quoteDate: string | null; expirationDate: string | null; warranty: string | null; notes: string | null;
}
export interface QuoteChange { field: keyof QuoteCurrentValues; label: string; before: string | null; after: string | null }
const QUOTE_FIELD_LABELS: Record<keyof QuoteCurrentValues, string> = {
  vendorName: 'Provider', quoteAmount: 'Total quoted', scopeSummary: 'Covers', quoteDate: 'Quote date', expirationDate: 'Expires', warranty: 'Warranty', notes: 'Notes',
};
export function quoteEditChanges(current: QuoteCurrentValues, next: QuoteAddInput): QuoteChange[] {
  const fields = Object.keys(QUOTE_FIELD_LABELS) as Array<keyof QuoteCurrentValues>;
  const changes: QuoteChange[] = [];
  for (const field of fields) {
    const before = current[field] ?? null;
    const after = (next[field] ?? null) as string | number | null;
    if (before !== after) changes.push({ field, label: QUOTE_FIELD_LABELS[field], before: before === null ? null : String(before), after: after === null ? null : String(after) });
  }
  return changes;
}
