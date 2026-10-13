// A comparable sale for a property tax appeal inside Ask (register P2 "Property Tax"; FRD v1.355). Pure: the declared message, action id, form and
// validation, mirroring the comparable route's schema (adjustments, a source link and a source document are not here). A comparable is a sale the
// household found; Cozy does not verify it, and an appeal packet cites only what the household can support.
import { z } from 'zod';

export const COMPARABLE_MESSAGE = 'Add a comparable sale to my property tax appeal.';
export const COMPARABLE_ACTION_ID = 'property-tax-comparable-add';
export const COMPARABLE_CAPTURE_KEY = 'PROPERTY_TAX_COMPARABLE_ADD';
export const COMPARABLE_ENTITY_TYPE = 'PROPERTY_TAX_APPEAL_PROPERTY';

const blank = (v: unknown) => (v === '' || v === undefined || v === null ? undefined : v);
const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((v) => v.value),
]);
const num = (v: unknown) => (v === '' || v === null || v === undefined ? undefined : typeof v === 'string' ? Number(v.replace(/[$,\s]/g, '')) : v);
export const ComparableSchema = z.object({
  address: z.string().trim().min(5).max(300),
  saleDate: exactDate,
  salePrice: z.preprocess(num, z.number().finite().gt(0).max(1_000_000_000)),
  propertyClass: z.string().trim().min(1).max(120),
  livingAreaSqFt: z.preprocess(num, z.number().finite().gt(0).max(1_000_000).optional()),
  lotSizeSqFt: z.preprocess(num, z.number().finite().gt(0).max(10_000_000).optional()),
  condition: z.preprocess(blank, z.string().trim().max(300).optional()),
}).strict();
export type ComparableAnswer = z.infer<typeof ComparableSchema>;

export function parseComparableAnswer(answer: unknown): { success: true; data: ComparableAnswer } | { success: false; reason: 'INVALID' | 'FUTURE' } {
  const parsed = ComparableSchema.safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  // A comparable is a sale that already happened (the service refuses a future date).
  if (parsed.data.saleDate > new Date().toISOString().slice(0, 10)) return { success: false, reason: 'FUTURE' };
  return { success: true, data: parsed.data };
}
/** A stable key from the address and sale date: the service upserts on (property, key), so asking for the same sale again updates it rather than adding a copy. */
export const comparableKey = (address: string, saleDate: string, sha: (text: string) => string) =>
  `ask-${sha(`${address.trim().toLowerCase().replace(/\s+/g, ' ')}|${saleDate}`).slice(0, 24)}`;
