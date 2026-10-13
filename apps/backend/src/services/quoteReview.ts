// The Quote Comparison confirmation contract (design: docs/architecture/QUOTE_COMPARISON_HOME_RECORD_IMPORT_DESIGN.md §3.4).
//
// Confirming a quote affirms exactly the set of values the review step displayed. This module is the one place that set is defined: what a review
// shows, how it is fingerprinted, and how a confirm request is checked against what is stored now. Pure; the service reads and writes.
import { createHash } from 'node:crypto';
import { z } from 'zod';

export const QUOTE_REVIEW_FACT_KEYS = ['vendorName', 'quoteAmount', 'quoteDate', 'serviceCategory', 'scopeKind', 'scopeSummary'] as const;

type ValueState = 'EXTRACTED_UNCONFIRMED' | 'HOMEOWNER_CONFIRMED' | 'HOMEOWNER_CORRECTED' | 'NOT_APPLICABLE';

export interface QuoteReviewSource {
  vendorName: string; quoteAmount: unknown; currency?: string | null; quoteDate: Date | string | null; expirationDate: Date | string | null;
  serviceCategory: string | null; serviceLocation: string | null; scopeKind: string | null; scopeSummary: string | null;
  providerLicenseNumber: string | null; providerLicenseVerified: boolean | null; providerInsuranceVerified: boolean | null;
  lineItems: Array<{ id: string; kind: string; description: string; quantity: unknown; unit: string | null; unitPrice: unknown; total: unknown; confirmationStatus: string; sourceText?: string | null; sourcePage?: number | null }>;
  terms: Array<{ id: string; type: string; label: string | null; value: string; included: boolean | null; confirmationStatus: string; sourceText?: string | null; sourcePage?: number | null }>;
  factConfirmations?: Array<{ fieldKey: string; status: string; extractedValueJson: unknown; confirmedValueJson: unknown }>;
}

const day = (value: Date | string | null) => (value ? new Date(value).toISOString().slice(0, 10) : null);
const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export interface QuoteReview {
  fingerprint: string;
  headline: Array<{ key: string; label: string; value: string | number | boolean | null }>;
  facts: Array<{ fieldKey: string; state: ValueState; extractedValue: unknown; confirmedValue: unknown }>;
  lineItems: Array<{ id: string; kind: string; description: string; quantity: number | null; unit: string | null; unitPrice: number | null; total: number | null; state: ValueState; sourceText: string | null; sourcePage: number | null }>;
  terms: Array<{ id: string; type: string; label: string | null; value: string; included: boolean | null; state: ValueState; sourceText: string | null; sourcePage: number | null }>;
  counts: { facts: number; lineItems: number; terms: number; unconfirmed: number; corrected: number; confirmed: number };
}

/** Everything the review displays, in a stable order, with the state of each value. Hidden values do not exist: what is here is what a confirm covers. */
export function buildQuoteReview(quote: QuoteReviewSource): QuoteReview {
  const lineItems = [...quote.lineItems].sort((a, b) => a.id.localeCompare(b.id)).map((item) => ({
    id: item.id, kind: item.kind, description: item.description, quantity: num(item.quantity), unit: item.unit, unitPrice: num(item.unitPrice), total: num(item.total),
    state: item.confirmationStatus as ValueState, sourceText: item.sourceText ?? null, sourcePage: item.sourcePage ?? null,
  }));
  const terms = [...quote.terms].sort((a, b) => a.id.localeCompare(b.id)).map((term) => ({
    id: term.id, type: term.type, label: term.label, value: term.value, included: term.included, state: term.confirmationStatus as ValueState,
    sourceText: term.sourceText ?? null, sourcePage: term.sourcePage ?? null,
  }));
  const facts = [...(quote.factConfirmations ?? [])].sort((a, b) => a.fieldKey.localeCompare(b.fieldKey)).map((fact) => ({
    fieldKey: fact.fieldKey, state: fact.status as ValueState, extractedValue: fact.extractedValueJson ?? null, confirmedValue: fact.confirmedValueJson ?? null,
  }));
  const headline = [
    { key: 'vendorName', label: 'Provider', value: quote.vendorName },
    { key: 'quoteAmount', label: 'Total', value: num(quote.quoteAmount) },
    { key: 'currency', label: 'Currency', value: quote.currency ?? null },
    { key: 'quoteDate', label: 'Quote date', value: day(quote.quoteDate) },
    { key: 'expirationDate', label: 'Expires', value: day(quote.expirationDate) },
    { key: 'serviceCategory', label: 'Service', value: quote.serviceCategory },
    { key: 'serviceLocation', label: 'Location', value: quote.serviceLocation },
    { key: 'scopeKind', label: 'Kind of work', value: quote.scopeKind },
    { key: 'scopeSummary', label: 'Scope', value: quote.scopeSummary },
    { key: 'providerLicenseNumber', label: 'Licence number', value: quote.providerLicenseNumber },
    { key: 'providerLicenseVerified', label: 'Licence verified', value: quote.providerLicenseVerified },
    { key: 'providerInsuranceVerified', label: 'Insurance verified', value: quote.providerInsuranceVerified },
  ];
  const states = [...facts.map((f) => f.state), ...lineItems.map((i) => i.state), ...terms.map((t) => t.state)];
  const fingerprint = createHash('sha256').update(JSON.stringify({ headline, facts, lineItems, terms })).digest('hex');
  return {
    fingerprint, headline, facts, lineItems, terms,
    counts: {
      facts: facts.length, lineItems: lineItems.length, terms: terms.length,
      unconfirmed: states.filter((s) => s === 'EXTRACTED_UNCONFIRMED').length,
      corrected: states.filter((s) => s === 'HOMEOWNER_CORRECTED').length,
      confirmed: states.filter((s) => s === 'HOMEOWNER_CONFIRMED').length,
    },
  };
}

/**
 * The body of a confirm request: the fingerprint and the identifiers of every value the person was shown, plus the ones they removed. A confirm
 * covers the complete shown set; there is no request that confirms a subset and no request that confirms a value it does not name.
 */
export const confirmQuoteReviewSchema = z.object({
  reviewFingerprint: z.string().length(64),
  lineItemIds: z.array(z.string().min(1)).max(500),
  termIds: z.array(z.string().min(1)).max(500),
  factKeys: z.array(z.string().min(1)).max(50),
  rejectedLineItemIds: z.array(z.string().min(1)).max(500).default([]),
  rejectedTermIds: z.array(z.string().min(1)).max(500).default([]),
}).strict();
export type ConfirmQuoteReviewRequest = z.infer<typeof confirmQuoteReviewSchema>;

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === new Set(a).size && a.length === b.length && b.every((value) => a.includes(value));

/** Returns a reason when the request does not cover exactly what is stored now; null when it does. */
export function reviewRequestProblem(review: QuoteReview, request: ConfirmQuoteReviewRequest): string | null {
  if (request.reviewFingerprint !== review.fingerprint) return 'The proposal changed after it was shown.';
  if (!sameSet(request.lineItemIds, review.lineItems.map((item) => item.id))) return 'The line items are not the ones that were shown.';
  if (!sameSet(request.termIds, review.terms.map((term) => term.id))) return 'The terms are not the ones that were shown.';
  if (!sameSet(request.factKeys, review.facts.map((fact) => fact.fieldKey))) return 'The extracted facts are not the ones that were shown.';
  if (!request.rejectedLineItemIds.every((id) => request.lineItemIds.includes(id))) return 'A removed line item was not shown.';
  if (!request.rejectedTermIds.every((id) => request.termIds.includes(id))) return 'A removed term was not shown.';
  return null;
}

const itemKey = (kind: string | null | undefined, description: string) => `${kind ?? 'OTHER'}|${description.trim().toLowerCase()}`;
const sameNumber = (a: unknown, b: unknown) => (a === null || a === undefined ? null : Number(a)) === (b === null || b === undefined ? null : Number(b));

/**
 * When a person edits a proposal's line items, an item that is new or whose figures changed is the person's own correction, not an extracted value;
 * an unchanged item keeps its earlier state. Without this, an edit would erase the difference between extracted, corrected and confirmed.
 */
export function markLineItemCorrections<T extends { kind?: string | null; description: string; quantity?: unknown; unit?: string | null; unitPrice?: unknown; total?: unknown; confirmationStatus?: string }>(
  previous: Array<{ kind: string; description: string; quantity: unknown; unit: string | null; unitPrice: unknown; total: unknown; confirmationStatus: string }>,
  incoming: T[],
): Array<T & { confirmationStatus: string }> {
  const byKey = new Map(previous.map((item) => [itemKey(item.kind, item.description), item]));
  return incoming.map((item) => {
    const before = byKey.get(itemKey(item.kind, item.description));
    const unchanged = before && sameNumber(before.quantity, item.quantity) && (before.unit ?? null) === (item.unit ?? null)
      && sameNumber(before.unitPrice, item.unitPrice) && sameNumber(before.total, item.total);
    return { ...item, confirmationStatus: unchanged ? before.confirmationStatus : 'HOMEOWNER_CORRECTED' };
  });
}

/** Same rule for terms: new or changed (value or included) is a correction. */
export function markTermCorrections<T extends { type: string; label?: string | null; value: string; included?: boolean | null; confirmationStatus?: string }>(
  previous: Array<{ type: string; label: string | null; value: string; included: boolean | null; confirmationStatus: string }>,
  incoming: T[],
): Array<T & { confirmationStatus: string }> {
  const key = (type: string, label: string | null | undefined, value: string) => `${type}|${(label ?? '').trim().toLowerCase()}|${value.trim().toLowerCase()}`;
  const byKey = new Map(previous.map((term) => [key(term.type, term.label, term.value), term]));
  return incoming.map((term) => {
    const before = byKey.get(key(term.type, term.label, term.value));
    const unchanged = before && (before.included ?? null) === (term.included ?? null);
    return { ...term, confirmationStatus: unchanged ? before.confirmationStatus : 'HOMEOWNER_CORRECTED' };
  });
}

const normalizeFactValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))) return Number(value);
  return typeof value === 'string' ? value.trim() : value;
};

/**
 * After an edit, each extracted headline fact is compared with its current value: the same value goes back to unconfirmed (it still needs the
 * person's affirmation), a different value is the person's correction and is stored as such, with the extracted value kept beside it.
 */
export function factStatesAfterEdit(
  facts: Array<{ fieldKey: string; extractedValueJson: unknown }>,
  current: Record<string, unknown>,
): Array<{ fieldKey: string; status: 'EXTRACTED_UNCONFIRMED' | 'HOMEOWNER_CORRECTED'; confirmedValueJson: unknown }> {
  return facts.map((fact) => {
    const now = normalizeFactValue(current[fact.fieldKey]);
    const before = normalizeFactValue(fact.extractedValueJson);
    return JSON.stringify(now) === JSON.stringify(before)
      ? { fieldKey: fact.fieldKey, status: 'EXTRACTED_UNCONFIRMED' as const, confirmedValueJson: null }
      : { fieldKey: fact.fieldKey, status: 'HOMEOWNER_CORRECTED' as const, confirmedValueJson: now };
  });
}
