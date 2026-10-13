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
  SELECT: 'Select this proposal for the decision.',
  REJECT: 'Reject this proposal.',
  RESTORE: 'Return this proposal to consideration.',
  REMOVE: 'Remove this proposal.',
} as const;
export type QuoteCommandKind = keyof typeof QUOTE_COMMAND_MESSAGES;

export const QUOTE_COMMAND_ACTION_IDS = {
  ADD: 'quote-comparison-add-quote',
  SELECT: 'quote-comparison-select-quote',
  REJECT: 'quote-comparison-reject-quote',
  RESTORE: 'quote-comparison-restore-quote',
  REMOVE: 'quote-comparison-remove-quote',
} as const;

export function quoteCommandKindFromMessage(message: string): QuoteCommandKind | null {
  const found = (Object.entries(QUOTE_COMMAND_MESSAGES) as Array<[QuoteCommandKind, string]>).find(([, value]) => value === message);
  return found ? found[0] : null;
}

export const QUOTE_ADD_CAPTURE_KEY = 'QUOTE_COMPARISON_ADD_QUOTE';

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
