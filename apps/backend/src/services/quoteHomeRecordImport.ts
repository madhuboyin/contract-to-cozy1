// Turns the reviewed extraction candidates of one Home Record version into a quote proposal (design: QUOTE_COMPARISON_HOME_RECORD_IMPORT_DESIGN.md
// §3.4, §3.9). Pure. It never invents a value: a missing provider or price is reported as missing, not defaulted to a file name or zero.
import { QUOTE_REVIEW_FACT_KEYS } from './quoteReview';
import { SERVICE_QUOTE_LINE_ITEM_PREFIX, SERVICE_QUOTE_TERM_PREFIX } from './serviceQuoteExtraction';

export interface ImportCandidate {
  fieldKey: string;
  proposedValue: string | null;
  reviewStatus: 'PENDING' | 'CONFIRMED' | 'CORRECTED' | 'REJECTED';
  reviewedValue: string | null;
  confidence: number | null;
  sourceCitation: string | null;
}

export type ImportedState = 'EXTRACTED_UNCONFIRMED' | 'HOMEOWNER_CORRECTED';

export interface ImportedProposal {
  vendorName: string;
  quoteAmount: number;
  currency: string;
  quoteDate: string | null;
  expirationDate: string | null;
  serviceCategory: string | null;
  serviceLocation: string | null;
  scopeKind: string;
  scopeSummary: string | null;
  providerLicenseNumber: string | null;
  notes: string | null;
  lineItems: Array<{ kind: string; description: string; quantity: number | null; unit: string | null; unitPrice: number | null; total: number | null; confirmationStatus: ImportedState; confidence: number | null; sourceText: string | null; sourcePage: number | null }>;
  terms: Array<{ type: string; label: string | null; value: string; included: boolean | null; confirmationStatus: ImportedState; confidence: number | null; sourceText: string | null; sourcePage: number | null }>;
  /** One row per headline fact that has an extracted value: what was extracted, and the person's correction if they made one in Home Records. */
  facts: Array<{ fieldKey: string; extractedValue: string | number | null; status: ImportedState; confirmedValue: string | number | null; confidence: number | null; sourceText: string | null }>;
}

export type ImportAssembly =
  | { status: 'READY'; proposal: ImportedProposal; dropped: number }
  | { status: 'INCOMPLETE'; missing: string[] };

const citationParts = (citation: string | null) => {
  if (!citation) return { sourceText: null as string | null, sourcePage: null as number | null };
  const page = citation.match(/\bpage (\d+)/i);
  const text = citation.match(/"([^"]{1,200})"\s*$/);
  // The leading "AI extraction from "<file name>"" is provenance, not the source text; a quoted tail after a page marker is.
  const quotedAfterPage = citation.match(/page \d+: "([^"]*)"/i);
  return { sourcePage: page ? Number(page[1]) : null, sourceText: quotedAfterPage ? quotedAfterPage[1] : (page ? null : (text && !/^AI extraction from/.test(citation) ? text[1] : null)) };
};

/** The value to use for a candidate: the person's correction, else the extracted value; a rejected candidate has none. */
const effective = (c: ImportCandidate): string | null => {
  if (c.reviewStatus === 'REJECTED') return null;
  const value = c.reviewStatus === 'CORRECTED' ? c.reviewedValue : c.proposedValue;
  return value === null || value === '' ? null : value;
};
const stateOf = (c: ImportCandidate): ImportedState => (c.reviewStatus === 'CORRECTED' ? 'HOMEOWNER_CORRECTED' : 'EXTRACTED_UNCONFIRMED');

export function assembleImportedProposal(candidates: ImportCandidate[]): ImportAssembly {
  const byKey = new Map(candidates.map((c) => [c.fieldKey, c]));
  const text = (key: string) => { const c = byKey.get(key); return c ? effective(c) : null; };
  const num = (key: string) => { const v = text(key); const n = v === null ? null : Number(v); return n !== null && Number.isFinite(n) ? n : null; };

  let dropped = 0;
  const lineItems: ImportedProposal['lineItems'] = [];
  const terms: ImportedProposal['terms'] = [];
  const keyed = [...candidates].sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
  for (const c of keyed) {
    const value = effective(c);
    if (c.fieldKey.startsWith(SERVICE_QUOTE_LINE_ITEM_PREFIX)) {
      if (value === null) { if (c.reviewStatus === 'REJECTED') dropped += 1; continue; }
      try {
        const item = JSON.parse(value) as Record<string, unknown>;
        if (typeof item.description !== 'string' || !item.description.trim()) { dropped += 1; continue; }
        const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
        lineItems.push({
          kind: typeof item.kind === 'string' ? item.kind : 'OTHER', description: item.description.trim(), quantity: n(item.quantity),
          unit: typeof item.unit === 'string' ? item.unit : null, unitPrice: n(item.unitPrice), total: n(item.total),
          confirmationStatus: stateOf(c), confidence: c.confidence, ...citationParts(c.sourceCitation),
        });
      } catch { dropped += 1; }
    } else if (c.fieldKey.startsWith(SERVICE_QUOTE_TERM_PREFIX)) {
      if (value === null) { if (c.reviewStatus === 'REJECTED') dropped += 1; continue; }
      try {
        const term = JSON.parse(value) as Record<string, unknown>;
        if (typeof term.value !== 'string' || !term.value.trim()) { dropped += 1; continue; }
        terms.push({
          type: typeof term.type === 'string' ? term.type : 'OTHER', label: typeof term.label === 'string' ? term.label : null, value: term.value.trim(),
          included: typeof term.included === 'boolean' ? term.included : null, confirmationStatus: stateOf(c), confidence: c.confidence, ...citationParts(c.sourceCitation),
        });
      } catch { dropped += 1; }
    }
  }

  const missing: string[] = [];
  const vendorName = text('vendorName');
  if (!vendorName) missing.push('the provider name');
  let quoteAmount = num('quoteAmount');
  let notes: string | null = null;
  if (quoteAmount === null) {
    // A total can stand in only when every line item carries its own total; otherwise a missing total is missing.
    const allPriced = lineItems.length > 0 && lineItems.every((item) => item.total !== null);
    if (allPriced) {
      quoteAmount = Math.round(lineItems.reduce((sum, item) => sum + (item.total ?? 0), 0) * 100) / 100;
      notes = 'No total was printed on the quote; this total is the sum of its line items.';
    } else {
      missing.push(lineItems.some((item) => item.total !== null || item.unitPrice !== null) ? 'the quote total (some line items have no price)' : 'a total or a priced line item');
    }
  }
  if (missing.length || !vendorName || quoteAmount === null) return { status: 'INCOMPLETE', missing };

  const scopeKind = text('scopeKind');
  const facts: ImportedProposal['facts'] = [];
  for (const key of QUOTE_REVIEW_FACT_KEYS) {
    const c = byKey.get(key);
    if (!c || c.proposedValue === null || c.reviewStatus === 'REJECTED') continue;
    const asValue = (raw: string | null) => (key === 'quoteAmount' && raw !== null && Number.isFinite(Number(raw)) ? Number(raw) : raw);
    facts.push({
      fieldKey: key, extractedValue: asValue(c.proposedValue), status: stateOf(c), confirmedValue: c.reviewStatus === 'CORRECTED' ? asValue(c.reviewedValue) : null,
      confidence: c.confidence, sourceText: null,
    });
  }
  return {
    status: 'READY', dropped,
    proposal: {
      vendorName, quoteAmount, currency: text('currency')?.toUpperCase() ?? 'USD', quoteDate: text('quoteDate'), expirationDate: text('expirationDate'),
      serviceCategory: text('serviceCategory'), serviceLocation: text('serviceLocation'), scopeKind: scopeKind ?? 'UNKNOWN', scopeSummary: text('scopeSummary'),
      providerLicenseNumber: text('providerLicenseNumber'), notes, lineItems, terms, facts,
    },
  };
}
