// The Property Tax exemption and correction steps inside Ask (register "Property Tax"; FRD v1.485). Desktop's Property Tax page lists up to three reviewed
// steps for the home's jurisdiction (an exemption review, a parcel-and-assessment fact review, an informal review), refreshes them, and records the
// homeowner's decision on each: ready for external action, completed (with the confirmation reference), or not applicable. Ask had none of it.
// Pure: the declared action ids, the decision form and its validation.
//
// These are extra actions of the existing PROPERTY_TAX_APPEAL_COMMAND (no new operation or registry entry). The service serves the home's primary owner
// only (its lookup is by homeowner profile), and Ask says so instead of erroring. Cozy records the decision; it never applies or files with the authority.
import { z } from 'zod';

export const PROPERTY_TAX_ACTION_IDS = {
  DECIDE: 'property-tax-action-decide',
  REFRESH: 'property-tax-actions-refresh',
  RECORD: 'property-tax-record-save',
} as const;
export type PropertyTaxActionId = typeof PROPERTY_TAX_ACTION_IDS[keyof typeof PROPERTY_TAX_ACTION_IDS];
export const isPropertyTaxActionId = (value: string | null | undefined): value is PropertyTaxActionId =>
  Object.values(PROPERTY_TAX_ACTION_IDS).includes(value as PropertyTaxActionId);
export const PROPERTY_TAX_ACTION_MESSAGES: Record<PropertyTaxActionId, string> = {
  'property-tax-action-decide': 'Record my decision on this property tax step.',
  'property-tax-actions-refresh': 'Check for property tax exemption and correction steps.',
  'property-tax-record-save': 'Enter my property tax figures.',
};
export const PROPERTY_TAX_ACTION_ENTITY_TYPE = 'PROPERTY_TAX_HOMEOWNER_ACTION';
export const PROPERTY_TAX_ACTION_CAPTURE_KEY = 'PROPERTY_TAX_ACTION_DECISION';

/** The three decisions Desktop's page offers, in its words. */
export const PROPERTY_TAX_ACTION_DECISIONS = ['READY_FOR_EXTERNAL_ACTION', 'COMPLETED', 'NOT_APPLICABLE'] as const;
export const PROPERTY_TAX_ACTION_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Not started', ELIGIBILITY_REVIEW: 'Reviewing eligibility', READY_FOR_EXTERNAL_ACTION: 'Ready for external action', COMPLETED: 'Completed', NOT_APPLICABLE: 'Not applicable', DISMISSED: 'Dismissed',
};
export const PROPERTY_TAX_ACTION_DECISION_LABELS: Record<string, string> = {
  READY_FOR_EXTERNAL_ACTION: 'Ready for external action (I will apply or file on the official site)', COMPLETED: 'Completed (I already did it)', NOT_APPLICABLE: 'Not applicable to this home',
};

const blank = (value: unknown) => (value === '' || value === null ? undefined : value);
const DecisionSchema = z.object({
  status: z.enum(PROPERTY_TAX_ACTION_DECISIONS),
  note: z.string().trim().min(3).max(1000),
  externalReference: z.preprocess(blank, z.string().trim().max(500).optional()),
}).strict();
export type PropertyTaxActionDecisionForm = z.infer<typeof DecisionSchema>;

export function parsePropertyTaxActionDecision(answer: unknown): { success: true; data: PropertyTaxActionDecisionForm } | { success: false; reason: 'INVALID' | 'REFERENCE_REQUIRED' } {
  const parsed = DecisionSchema.safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  if (parsed.data.status === 'COMPLETED' && !parsed.data.externalReference) return { success: false, reason: 'REFERENCE_REQUIRED' };
  return { success: true, data: parsed.data };
}

const RecordSchema = z.object({
  taxYear: z.coerce.number().int().min(1900).max(new Date().getFullYear() + 2),
  parcelId: z.preprocess(blank, z.string().trim().max(120).optional()),
  totalAssessedValue: z.preprocess(blank, z.coerce.number().finite().min(0).max(1_000_000_000).optional()),
  taxRatePercent: z.preprocess(blank, z.coerce.number().finite().min(0).max(100).optional()),
  billAmount: z.preprocess(blank, z.coerce.number().finite().min(0).max(1_000_000_000).optional()),
}).strict();
export type PropertyTaxRecordForm = z.infer<typeof RecordSchema>;

/** The figures a homeowner types in by hand; at least one of the four besides the year is needed, as the service requires. */
export function parsePropertyTaxRecordForm(answer: unknown): { success: true; data: PropertyTaxRecordForm } | { success: false; reason: 'INVALID' | 'NOTHING_ENTERED' } {
  const parsed = RecordSchema.safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const d = parsed.data;
  if (!d.parcelId && d.totalAssessedValue === undefined && d.taxRatePercent === undefined && d.billAmount === undefined) return { success: false, reason: 'NOTHING_ENTERED' };
  return { success: true, data: d };
}
