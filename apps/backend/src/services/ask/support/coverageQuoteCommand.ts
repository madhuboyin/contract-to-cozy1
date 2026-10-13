// Add a quote to a coverage comparison inside Ask (parity register "Coverage Intelligence"; FRD v1.366): the form, its validation and the facts it becomes.
// Pure. It mirrors the desktop panel's add-a-quote form: a source document on file, a label, an optional carrier, the amounts, two text terms and a
// comma-separated endorsements list, and one statement that the values were checked against the document. Unchecked values are stored as pending and
// never count toward equivalence, which the review says. Nothing here reads the document.
import { z } from 'zod';

export const COVERAGE_QUOTE_CAPTURE_KEY = 'COVERAGE_QUOTE';
export const COVERAGE_QUOTE_AMOUNT_FIELDS = [
  ['ALL_PERIL_DEDUCTIBLE', 'allPerilDeductible', 'All-peril deductible'],
  ['DWELLING_LIMIT', 'dwellingLimit', 'Dwelling limit'],
  ['PERSONAL_PROPERTY_LIMIT', 'personalPropertyLimit', 'Personal property limit'],
  ['LIABILITY_LIMIT', 'liabilityLimit', 'Liability limit'],
  ['ANNUAL_PREMIUM', 'annualPremium', 'Annual premium'],
] as const;
const MAX_ENDORSEMENTS = 25;

const blank = (value: unknown) => (value === '' || value === undefined || value === null ? null : value);
const amount = z.preprocess((value) => { const v = blank(value); return v === null ? null : Number(v); }, z.number().finite().nonnegative().max(1_000_000_000).nullable()).optional();
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max).nullable()).optional();

export const CoverageQuoteInputSchema = z.object({
  sourceRecordId: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(120),
  carrierName: text(160),
  allPerilDeductible: amount, dwellingLimit: amount, personalPropertyLimit: amount, liabilityLimit: amount, annualPremium: amount,
  policyForm: text(500), valuationBasis: text(500), endorsements: text(500),
  sourcePage: z.preprocess((value) => { const v = blank(value); return v === null ? null : Number(v); }, z.number().int().min(1).max(10_000).nullable()).optional(),
  checked: z.enum(['YES', 'NO']).optional(),
}).strict();

export interface CoverageQuoteFact {
  factKey: string; valueType: 'AMOUNT' | 'TEXT' | 'JSON'; amountValue?: number; currency?: string; textValue?: string; jsonValue?: string[];
  confirmationStatus: 'CONFIRMED' | 'PENDING'; sourcePage: number | null;
}
export interface CoverageQuoteInput {
  sourceRecordId: string; label: string; carrierName: string | null; facts: CoverageQuoteFact[]; checked: boolean; sourcePage: number | null;
}

/** Validates a submitted form (or a stored confirmation parameter). A quote with no value at all is refused: there would be nothing to compare. */
export function parseCoverageQuoteAnswer(answer: unknown): { success: true; data: CoverageQuoteInput } | { success: false; reason: 'INVALID' | 'NO_FACTS' } {
  const parsed = CoverageQuoteInputSchema.safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const value = parsed.data as Record<string, unknown>;
  const checked = parsed.data.checked === 'YES';
  const status = checked ? 'CONFIRMED' as const : 'PENDING' as const;
  const page = (parsed.data.sourcePage ?? null) as number | null;
  const facts: CoverageQuoteFact[] = [];
  for (const [factKey, field] of COVERAGE_QUOTE_AMOUNT_FIELDS) {
    const entered = value[field];
    if (typeof entered === 'number') facts.push({ factKey, valueType: 'AMOUNT', amountValue: entered, currency: 'USD', confirmationStatus: status, sourcePage: page });
  }
  for (const [factKey, field] of [['POLICY_FORM', 'policyForm'], ['VALUATION_BASIS', 'valuationBasis']] as const) {
    const entered = value[field];
    if (typeof entered === 'string' && entered) facts.push({ factKey, valueType: 'TEXT', textValue: entered, confirmationStatus: status, sourcePage: page });
  }
  if (typeof value.endorsements === 'string' && value.endorsements) {
    const list = value.endorsements.split(',').map((part) => part.trim()).filter(Boolean);
    if (list.length > MAX_ENDORSEMENTS || list.some((part) => part.length > 100)) return { success: false, reason: 'INVALID' };
    if (list.length) facts.push({ factKey: 'ENDORSEMENTS', valueType: 'JSON', jsonValue: list, confirmationStatus: status, sourcePage: page });
  }
  if (!facts.length) return { success: false, reason: 'NO_FACTS' };
  return { success: true, data: { sourceRecordId: parsed.data.sourceRecordId, label: parsed.data.label, carrierName: (parsed.data.carrierName ?? null) as string | null, facts, checked, sourcePage: page } };
}

const FACT_LABELS: Record<string, string> = Object.fromEntries([
  ...COVERAGE_QUOTE_AMOUNT_FIELDS.map(([key, , label]) => [key, label]), ['POLICY_FORM', 'Policy form'], ['VALUATION_BASIS', 'Valuation basis'], ['ENDORSEMENTS', 'Endorsements'],
]);
export const coverageQuoteFactLabel = (factKey: string) => FACT_LABELS[factKey] ?? factKey;
export function coverageQuoteFactValue(fact: CoverageQuoteFact): string {
  if (fact.valueType === 'AMOUNT') return `$${(fact.amountValue ?? 0).toLocaleString('en-US')}`;
  if (fact.valueType === 'JSON') return (fact.jsonValue ?? []).join(', ');
  return fact.textValue ?? '';
}
