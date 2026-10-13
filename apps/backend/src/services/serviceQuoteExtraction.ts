// Quote extraction for Home Records (design: docs/architecture/QUOTE_COMPARISON_HOME_RECORD_IMPORT_DESIGN.md §3.2, slice 3).
//
// The general document analyzer returns warranty, receipt and insurance fields; it has no line items, terms, scope or dates (design §1.2). This
// module is the quote-specific contract: the prompt, a typed response schema, validation of the model's reply, the minimum evidence a file must
// carry to count as a quote, and the mapping into reviewable candidates. Pure; the model call lives in documentIntelligence.service.ts and
// nothing here creates a quote.
import { z } from 'zod';
import type { ExtractionCandidateField, ExtractionEnvelope } from './intelligence/extractionEnvelope.contract';

export const SERVICE_QUOTE_EXTRACTOR_ID = 'document-intelligence-service-quote';
export const SERVICE_QUOTE_EXTRACTOR_VERSION = 'v1';
export const SERVICE_QUOTE_SCHEMA_VERSION = 'quote-proposal-v1';
/** The model's classification must be at least this sure for a file to be treated as a quote. */
export const SERVICE_QUOTE_MIN_CLASSIFICATION_CONFIDENCE = 0.5;
export const SERVICE_QUOTE_MAX_LINE_ITEMS = 100;
export const SERVICE_QUOTE_MAX_TERMS = 50;

export const SERVICE_QUOTE_ANALYSIS_PROMPT = `You are reading a document a homeowner received from a contractor or service provider. Decide what kind of document it is and extract the facts of a quote.

Document kinds:
- QUOTE: a proposal, estimate or bid for work NOT yet done, with a price the homeowner may accept.
- INVOICE: a bill for work already done or goods already delivered.
- CONTRACT: an agreement already signed or to be signed, which is not itself a priced proposal.
- RECEIPT: proof of payment.
- OTHER: anything else.

Extract ONLY what is printed on the document. If a value is not printed, return null. Do not guess a provider, a price, a date or a scope. Copy dollar amounts as plain numbers with no symbols. Dates as YYYY-MM-DD.
For every line item and term, include the exact short text it came from in "sourceText" and the page number in "sourcePage" when the document has pages.

Return ONLY valid JSON with this EXACT structure (no markdown, no code blocks):
{
  "documentKind": "QUOTE|INVOICE|CONTRACT|RECEIPT|OTHER",
  "confidence": 0.0-1.0,
  "provider": { "name": "string or null", "licenseNumber": "string or null" },
  "totalAmount": number or null,
  "currency": "USD or other 3-letter code, or null",
  "quoteDate": "YYYY-MM-DD or null",
  "expirationDate": "YYYY-MM-DD or null",
  "serviceCategory": "one of HVAC, PLUMBING, ELECTRICAL, ROOFING, WATER_HEATER, FOUNDATION, WINDOWS_DOORS, INSULATION, LANDSCAPING, GUTTERS, SOLAR, FLOORING, PAINTING, SIDING, APPLIANCE_REPAIR, APPLIANCE_REPLACEMENT, PEST_CONTROL, CLEANING, HANDYMAN, OTHER, or null",
  "serviceLocation": "where the work is done, or null",
  "scopeKind": "REPAIR|REPLACEMENT|INSTALLATION|MAINTENANCE|INSPECTION|OTHER|UNKNOWN",
  "scopeSummary": "one or two sentences describing the work, or null",
  "lineItems": [
    { "kind": "LABOR|MATERIAL|EQUIPMENT|PERMIT|DISPOSAL|TAX|ALLOWANCE|OTHER", "description": "string", "quantity": number or null, "unit": "string or null", "unitPrice": number or null, "total": number or null, "sourceText": "string or null", "sourcePage": number or null }
  ],
  "terms": [
    { "type": "INCLUSION|EXCLUSION|ALLOWANCE|PERMIT|DISPOSAL|CLEANUP|WARRANTY|PAYMENT|SCHEDULE|EXPIRATION|LICENSE|INSURANCE|CHANGE_ORDER|OTHER", "label": "string or null", "value": "string", "included": true or false or null, "sourceText": "string or null", "sourcePage": number or null }
  ]
}`;

const SERVICE_CATEGORY_VALUES = new Set([
  'HVAC', 'PLUMBING', 'ELECTRICAL', 'ROOFING', 'WATER_HEATER', 'FOUNDATION', 'WINDOWS_DOORS', 'INSULATION', 'LANDSCAPING', 'GUTTERS', 'SOLAR', 'FLOORING', 'PAINTING',
  'SIDING', 'APPLIANCE_REPAIR', 'APPLIANCE_REPLACEMENT', 'PEST_CONTROL', 'CLEANING', 'HANDYMAN', 'OTHER',
]);
const LINE_KINDS = ['LABOR', 'MATERIAL', 'EQUIPMENT', 'PERMIT', 'DISPOSAL', 'TAX', 'ALLOWANCE', 'OTHER'] as const;
const TERM_TYPES = ['INCLUSION', 'EXCLUSION', 'ALLOWANCE', 'PERMIT', 'DISPOSAL', 'CLEANUP', 'WARRANTY', 'PAYMENT', 'SCHEDULE', 'EXPIRATION', 'LICENSE', 'INSURANCE', 'CHANGE_ORDER', 'OTHER'] as const;
const SCOPE_KINDS = ['REPAIR', 'REPLACEMENT', 'INSTALLATION', 'MAINTENANCE', 'INSPECTION', 'OTHER', 'UNKNOWN'] as const;

const nullableString = z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(2000).nullable()).default(null);
const nullableNumber = z.preprocess((v) => (v === '' || v === undefined ? null : v), z.number().finite().nullable()).default(null);
const nullableDate = z.preprocess((v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null), z.string().nullable()).default(null);
const page = z.preprocess((v) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null), z.number().int().nullable()).default(null);
const lenientEnum = <T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) =>
  z.preprocess((v) => (typeof v === 'string' && (values as readonly string[]).includes(v.trim().toUpperCase()) ? v.trim().toUpperCase() : fallback), z.enum(values));

const LineItemSchema = z.object({
  kind: lenientEnum(LINE_KINDS, 'OTHER'),
  description: z.string().trim().min(1).max(1000),
  quantity: nullableNumber, unit: nullableString, unitPrice: nullableNumber, total: nullableNumber,
  sourceText: nullableString, sourcePage: page,
});
const TermSchema = z.object({
  type: lenientEnum(TERM_TYPES, 'OTHER'),
  label: nullableString,
  value: z.string().trim().min(1).max(2000),
  included: z.preprocess((v) => (typeof v === 'boolean' ? v : null), z.boolean().nullable()).default(null),
  sourceText: nullableString, sourcePage: page,
});

export const ServiceQuoteResponseSchema = z.object({
  documentKind: lenientEnum(['QUOTE', 'INVOICE', 'CONTRACT', 'RECEIPT', 'OTHER'] as const, 'OTHER'),
  confidence: z.preprocess((v) => (typeof v === 'number' ? Math.min(1, Math.max(0, v)) : 0), z.number()),
  provider: z.object({ name: nullableString, licenseNumber: nullableString }).default({ name: null, licenseNumber: null }),
  totalAmount: nullableNumber,
  currency: nullableString,
  quoteDate: nullableDate,
  expirationDate: nullableDate,
  serviceCategory: z.preprocess((v) => (typeof v === 'string' && SERVICE_CATEGORY_VALUES.has(v.trim().toUpperCase()) ? v.trim().toUpperCase() : null), z.string().nullable()).default(null),
  serviceLocation: nullableString,
  scopeKind: lenientEnum(SCOPE_KINDS, 'UNKNOWN'),
  scopeSummary: nullableString,
  lineItems: z.array(z.unknown()).default([]),
  terms: z.array(z.unknown()).default([]),
});

export type ServiceQuoteLineItem = z.infer<typeof LineItemSchema>;
export type ServiceQuoteTerm = z.infer<typeof TermSchema>;
export interface ServiceQuoteExtraction {
  documentKind: 'QUOTE' | 'INVOICE' | 'CONTRACT' | 'RECEIPT' | 'OTHER';
  confidence: number;
  provider: { name: string | null; licenseNumber: string | null };
  totalAmount: number | null;
  currency: string | null;
  quoteDate: string | null;
  expirationDate: string | null;
  serviceCategory: string | null;
  serviceLocation: string | null;
  scopeKind: (typeof SCOPE_KINDS)[number];
  scopeSummary: string | null;
  lineItems: ServiceQuoteLineItem[];
  terms: ServiceQuoteTerm[];
  /** Entries the model returned that did not validate, counted rather than silently kept. */
  droppedLineItems: number;
  droppedTerms: number;
}

export type ServiceQuoteParse =
  | { status: 'PARSED'; extraction: ServiceQuoteExtraction }
  | { status: 'FAILED'; reason: string };

/** Validates the model's reply. Anything that is not an object of the expected shape fails; individual bad entries are dropped and counted. */
export function parseServiceQuoteResponse(text: string | null | undefined): ServiceQuoteParse {
  if (!text || !text.trim()) return { status: 'FAILED', reason: 'The model returned nothing.' };
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  let raw: unknown;
  try { raw = JSON.parse(cleaned); } catch { return { status: 'FAILED', reason: 'The model reply was not valid JSON.' }; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { status: 'FAILED', reason: 'The model reply was not an object.' };
  const top = ServiceQuoteResponseSchema.safeParse(raw);
  if (!top.success) return { status: 'FAILED', reason: 'The model reply did not match the quote schema.' };
  const lineItems: ServiceQuoteLineItem[] = [];
  let droppedLineItems = 0;
  for (const entry of top.data.lineItems.slice(0, SERVICE_QUOTE_MAX_LINE_ITEMS)) {
    const parsed = LineItemSchema.safeParse(entry);
    if (parsed.success) lineItems.push(parsed.data); else droppedLineItems += 1;
  }
  droppedLineItems += Math.max(0, top.data.lineItems.length - SERVICE_QUOTE_MAX_LINE_ITEMS);
  const terms: ServiceQuoteTerm[] = [];
  let droppedTerms = 0;
  for (const entry of top.data.terms.slice(0, SERVICE_QUOTE_MAX_TERMS)) {
    const parsed = TermSchema.safeParse(entry);
    if (parsed.success) terms.push(parsed.data); else droppedTerms += 1;
  }
  droppedTerms += Math.max(0, top.data.terms.length - SERVICE_QUOTE_MAX_TERMS);
  return {
    status: 'PARSED',
    extraction: {
      documentKind: top.data.documentKind as ServiceQuoteExtraction['documentKind'], confidence: top.data.confidence,
      provider: top.data.provider, totalAmount: top.data.totalAmount, currency: top.data.currency?.toUpperCase() ?? null,
      quoteDate: top.data.quoteDate, expirationDate: top.data.expirationDate, serviceCategory: top.data.serviceCategory,
      serviceLocation: top.data.serviceLocation, scopeKind: top.data.scopeKind as ServiceQuoteExtraction['scopeKind'], scopeSummary: top.data.scopeSummary,
      lineItems, terms, droppedLineItems, droppedTerms,
    },
  };
}

/**
 * Whether the file counts as a quote at all: the model must classify it as a quote with enough confidence, and the extraction must carry the
 * minimum a quote has, a provider with either a total or at least one priced line item. A model-generated label alone is never enough.
 */
export function quoteMinimumEvidence(extraction: ServiceQuoteExtraction): { sufficient: boolean; classifiedAsQuote: boolean; missing: string[] } {
  const classifiedAsQuote = extraction.documentKind === 'QUOTE' && extraction.confidence >= SERVICE_QUOTE_MIN_CLASSIFICATION_CONFIDENCE;
  const missing: string[] = [];
  if (!extraction.provider.name) missing.push('provider name');
  const priced = extraction.totalAmount !== null || extraction.lineItems.some((item) => item.total !== null || item.unitPrice !== null);
  if (!priced) missing.push('a total or a priced line item');
  return { sufficient: classifiedAsQuote && missing.length === 0, classifiedAsQuote, missing };
}

const pad = (index: number) => String(index + 1).padStart(3, '0');
export const SERVICE_QUOTE_LINE_ITEM_PREFIX = 'lineItem:';
export const SERVICE_QUOTE_TERM_PREFIX = 'term:';

export interface ServiceQuoteCandidate { fieldKey: string; proposedValue: string; sourceCitation?: string }

/** Reviewable candidates: one per headline fact, one per line item and one per term (a JSON value), each carrying the page it came from. */
export function serviceQuoteCandidates(extraction: ServiceQuoteExtraction): ServiceQuoteCandidate[] {
  const out: ServiceQuoteCandidate[] = [];
  const add = (fieldKey: string, value: string | number | null) => { if (value !== null && value !== '') out.push({ fieldKey, proposedValue: String(value) }); };
  add('vendorName', extraction.provider.name);
  add('providerLicenseNumber', extraction.provider.licenseNumber);
  add('quoteAmount', extraction.totalAmount);
  add('currency', extraction.currency);
  add('quoteDate', extraction.quoteDate);
  add('expirationDate', extraction.expirationDate);
  add('serviceCategory', extraction.serviceCategory);
  add('serviceLocation', extraction.serviceLocation);
  if (extraction.scopeKind !== 'UNKNOWN') add('scopeKind', extraction.scopeKind);
  add('scopeSummary', extraction.scopeSummary);
  extraction.lineItems.forEach((item, index) => {
    out.push({
      fieldKey: `${SERVICE_QUOTE_LINE_ITEM_PREFIX}${pad(index)}`,
      proposedValue: JSON.stringify({ kind: item.kind, description: item.description, quantity: item.quantity, unit: item.unit, unitPrice: item.unitPrice, total: item.total }),
      sourceCitation: item.sourcePage ? `page ${item.sourcePage}${item.sourceText ? `: "${item.sourceText.slice(0, 200)}"` : ''}` : item.sourceText ? `"${item.sourceText.slice(0, 200)}"` : undefined,
    });
  });
  extraction.terms.forEach((term, index) => {
    out.push({
      fieldKey: `${SERVICE_QUOTE_TERM_PREFIX}${pad(index)}`,
      proposedValue: JSON.stringify({ type: term.type, label: term.label, value: term.value, included: term.included }),
      sourceCitation: term.sourcePage ? `page ${term.sourcePage}${term.sourceText ? `: "${term.sourceText.slice(0, 200)}"` : ''}` : term.sourceText ? `"${term.sourceText.slice(0, 200)}"` : undefined,
    });
  });
  return out;
}

/** The common envelope (HI-DOC-001) for a parsed quote. A failed parse carries no fields, as the envelope contract requires. */
export function serviceQuoteToExtractionEnvelope(
  parse: ServiceQuoteParse,
  meta: { documentVersionId?: string | null; modelId?: string | null; extractedAt?: Date } = {},
): ExtractionEnvelope {
  const base = {
    documentId: null, documentVersionId: meta.documentVersionId ?? null, extractorId: SERVICE_QUOTE_EXTRACTOR_ID, extractorVersion: SERVICE_QUOTE_EXTRACTOR_VERSION,
    modelId: meta.modelId ?? null, extractedAt: (meta.extractedAt ?? new Date()).toISOString(), isBatch: false,
  };
  if (parse.status === 'FAILED') {
    return { ...base, candidateEntityType: 'UNKNOWN', fields: [], overallConfidence: 0, parseStatus: 'FAILED', warnings: [parse.reason] };
  }
  const { extraction } = parse;
  const evidence = quoteMinimumEvidence(extraction);
  const warnings: string[] = [];
  if (!evidence.classifiedAsQuote) warnings.push(`The document was classified as ${extraction.documentKind.toLowerCase()}, not as a quote.`);
  if (evidence.missing.length) warnings.push(`Missing: ${evidence.missing.join(' and ')}.`);
  if (extraction.droppedLineItems) warnings.push(`${extraction.droppedLineItems} line item(s) could not be read and were left out.`);
  if (extraction.droppedTerms) warnings.push(`${extraction.droppedTerms} term(s) could not be read and were left out.`);
  const fields: ExtractionCandidateField[] = serviceQuoteCandidates(extraction).map((candidate) => ({
    fieldKey: candidate.fieldKey, value: candidate.proposedValue, confidence: extraction.confidence,
    ...(candidate.sourceCitation ? { evidence: { excerpt: candidate.sourceCitation } } : {}),
  }));
  return {
    ...base, candidateEntityType: extraction.documentKind === 'QUOTE' ? 'SERVICE_QUOTE' : extraction.documentKind,
    fields, overallConfidence: extraction.confidence, parseStatus: fields.length ? 'PARSED' : 'FALLBACK_UNSTRUCTURED', warnings,
  };
}
