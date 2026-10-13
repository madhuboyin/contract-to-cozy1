// Confirmed tax facts from a tax notice or bill that is already a Home Record, inside Ask (FRD v1.370; design
// docs/architecture/PROPERTY_TAX_EVIDENCE_AND_INTAKE_IN_ASK_DESIGN.md slice 4, owner rulings D-T3, D-T4, D-T6). Pure: the declared message, action id,
// the form and its validation, mirroring the stage route's field rules. Ask does not read the document: the values are the person's own reading of it,
// reviewed in full and confirmed once. Only a TAX_DOCUMENT record is offered (D-T3); retyping a record happens in Home Records.
import { z } from 'zod';

export const DOCUMENT_FACTS_MESSAGE = 'Confirm the tax facts from a tax notice or bill in my home records.';
export const DOCUMENT_FACTS_ACTION_ID = 'property-tax-document-facts';
export const DOCUMENT_FACTS_CAPTURE_KEY = 'PROPERTY_TAX_DOCUMENT_FACTS';
/** Owner ruling D-T4: the affirmation the person gives, in the wording the review shows. */
export const DOCUMENT_FACTS_AFFIRMATION =
  'Use this Home Record for manual Property Tax review, create the confirmed tax facts shown below, and mark the record verified. ContractToCozy has not automatically read or verified the document.';

export const DOCUMENT_KINDS = ['ASSESSMENT_NOTICE', 'TAX_BILL', 'EXEMPTION_NOTICE', 'CORRECTION_NOTICE', 'OTHER'] as const;
export const DOCUMENT_KIND_LABELS: Record<(typeof DOCUMENT_KINDS)[number], string> = {
  ASSESSMENT_NOTICE: 'Assessment notice', TAX_BILL: 'Tax bill', EXEMPTION_NOTICE: 'Exemption notice', CORRECTION_NOTICE: 'Correction notice', OTHER: 'Other tax document',
};

const blank = (v: unknown) => (v === '' || v === undefined || v === null ? undefined : v);
const num = (v: unknown) => (v === '' || v === null || v === undefined ? undefined : typeof v === 'string' ? Number(v.replace(/[$,\s]/g, '')) : v);
const money = z.preprocess(num, z.number().finite().min(0).max(1_000_000_000).optional());
const ratio = z.preprocess(num, z.number().finite().min(0).max(1).optional());
const exactDate = z.preprocess(blank, z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((v) => v.value),
]).optional());
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());

export const DocumentFactsSchema = z.object({
  sourceRecordId: z.string().trim().min(1).max(160),
  kind: z.enum(DOCUMENT_KINDS),
  taxYear: z.preprocess(num, z.number().int().min(1900).max(new Date().getFullYear() + 2)),
  parcelId: text(120), valuationDate: exactDate, classification: text(200),
  totalAssessedValue: money, taxableValue: money, assessmentRatio: ratio, billAmount: money, effectiveTaxRate: ratio,
  exemptions: text(500),
  affirmed: z.literal('YES'),
}).strict();

export interface DocumentFactsDraft {
  sourceRecordId: string; kind: (typeof DOCUMENT_KINDS)[number];
  fields: Array<{ fieldKey: string; value: unknown }>;
  summary: Array<{ label: string; value: string }>;
}
export type DocumentFactsParse = { success: true; data: DocumentFactsDraft } | { success: false; reason: 'INVALID' | 'AFFIRMATION' | 'NO_FACTS' | 'FUTURE_DATE' };

const LABELS: Array<[string, string]> = [
  ['parcelId', 'Parcel ID'], ['valuationDate', 'Valuation date'], ['classification', 'Classification'], ['totalAssessedValue', 'Assessed value'],
  ['taxableValue', 'Taxable value'], ['assessmentRatio', 'Assessment ratio'], ['billAmount', 'Bill amount'], ['effectiveTaxRate', 'Effective tax rate'], ['exemptions', 'Exemptions'],
];
const MONEY_KEYS = new Set(['totalAssessedValue', 'taxableValue', 'billAmount']);

/** Validates a submitted form (or a stored confirmation parameter). A document with no parcel, assessment or bill value is refused, as the service does. */
export function parseDocumentFactsAnswer(answer: unknown, today = new Date().toISOString().slice(0, 10)): DocumentFactsParse {
  if (answer && typeof answer === 'object' && (answer as Record<string, unknown>).affirmed !== 'YES' && 'affirmed' in (answer as object)) return { success: false, reason: 'AFFIRMATION' };
  const parsed = DocumentFactsSchema.safeParse(answer);
  if (!parsed.success) {
    const missing = parsed.error.issues.some((issue) => issue.path[0] === 'affirmed');
    return { success: false, reason: missing ? 'AFFIRMATION' : 'INVALID' };
  }
  const d = parsed.data as Record<string, unknown>;
  if (typeof d.valuationDate === 'string' && d.valuationDate > today) return { success: false, reason: 'FUTURE_DATE' };
  const fields: Array<{ fieldKey: string; value: unknown }> = [{ fieldKey: 'taxYear', value: d.taxYear }];
  const summary: Array<{ label: string; value: string }> = [{ label: 'Tax year', value: String(d.taxYear) }];
  let any = false;
  for (const [key, label] of LABELS) {
    const entered = d[key];
    if (entered === undefined) continue;
    any = true;
    if (key === 'exemptions') {
      const list = String(entered).split(',').map((part) => part.trim()).filter(Boolean);
      if (!list.length) { any = fields.length > 1; continue; }
      fields.push({ fieldKey: key, value: list });
      summary.push({ label, value: list.join(', ') });
    } else {
      fields.push({ fieldKey: key, value: entered });
      summary.push({ label, value: MONEY_KEYS.has(key) ? `$${(entered as number).toLocaleString('en-US')}` : String(entered) });
    }
  }
  if (!any || fields.length === 1) return { success: false, reason: 'NO_FACTS' };
  return { success: true, data: { sourceRecordId: d.sourceRecordId as string, kind: d.kind as DocumentFactsDraft['kind'], fields, summary } };
}
