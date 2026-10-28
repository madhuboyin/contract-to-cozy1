// Insurance policies inside Ask (register "Insurance policies"; FRD v1.475). Desktop's Insurance page lists, adds, edits and deletes the policies a homeowner
// records for a home; Ask had no policy list at all. Pure: the routing pattern, the declared messages, the form and its validation, and the review text.
//
// The list lives on the existing COVERAGE_GAPS answer and the writes are extra declared messages of the existing COVERAGE_COMMAND (no new operation). A policy
// belongs to the homeowner profile that recorded it, as on Desktop, so Ask lists, edits and deletes only the caller's own policies for the home.
import { z } from 'zod';

export const INSURANCE_POLICY_MESSAGES = {
  ADD: 'Add an insurance policy.',
  EDIT: 'Edit this insurance policy.',
  DELETE: 'Delete this insurance policy.',
} as const;
export type InsurancePolicyKind = keyof typeof INSURANCE_POLICY_MESSAGES;
export const INSURANCE_POLICY_ACTION_IDS = { ADD: 'insurance-policy-add', EDIT: 'insurance-policy-edit', DELETE: 'insurance-policy-delete' } as const;
export const insurancePolicyKindFromMessage = (message: string): InsurancePolicyKind | null =>
  ((Object.entries(INSURANCE_POLICY_MESSAGES) as Array<[InsurancePolicyKind, string]>).find(([, value]) => value === message.trim())?.[0]) ?? null;
export const INSURANCE_POLICY_CAPTURE_KEY = 'INSURANCE_POLICY_INPUTS';
export const INSURANCE_POLICY_ENTITY_TYPE = 'INSURANCE_POLICY';

/**
 * A question about the homeowner's own insurance policies (as records), not about comparing, claiming, reminding or saving on them. The coverage
 * comparison, review, deadline-monitor, claim and savings patterns are matched earlier in the router; this only has to stay narrow.
 */
export const insurancePoliciesPattern = /\b(?:(?:show|list|view|see|manage|review|open|add|record|enter|save|edit|update|change|delete|remove)\b.{0,40}\b(?:my |our |an? |the |another |new )?(?:home(?:owners?)?|house|property|renters?|flood|insurance) (?:insurance )?polic(?:y|ies)|(?:what|which|do i have|how many)\b.{0,30}\b(?:insurance|homeowners?) polic(?:y|ies)|(?:my|our) (?:home(?:owners?)? )?insurance polic(?:y|ies)\b(?! (?:expires?|renew|quote|claim|cover|saves?|cost)))/i;
export const insurancePoliciesOtherIntentPattern = /\b(?:compar(?:e|ison)|switch|shop|quote|claims?|remind|monitor|notify|alert|savings?|save money|cheaper|lower|renewal|expir(?:e|es|ing|ation)|deductible|cover(?:s|age)? (?:gap|for)|gaps?)\b/i;

const exactDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dateAnswer = z.union([exactDate, z.object({ precision: z.literal('EXACT_DATE'), value: exactDate }).strict().transform((value) => value.value)]);
export const InsurancePolicyFormSchema = z.object({
  carrierName: z.string().trim().min(1).max(120),
  policyNumber: z.string().trim().min(1).max(60),
  coverageType: z.string().trim().max(60).optional().default('Homeowner'),
  premiumAmount: z.coerce.number().positive().max(10_000_000),
  startDate: dateAnswer,
  expiryDate: dateAnswer,
});
export type InsurancePolicyForm = { carrierName: string; policyNumber: string; coverageType: string; premiumAmount: number; startDate: string; expiryDate: string };

const validDay = (day: string) => { const date = new Date(`${day}T00:00:00.000Z`); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day; };

export function parseInsurancePolicyAnswer(answer: unknown): { success: true; data: InsurancePolicyForm } | { success: false; reason: 'INVALID' | 'DATE_ORDER' } {
  const parsed = InsurancePolicyFormSchema.safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const { startDate, expiryDate } = parsed.data as { startDate: string; expiryDate: string };
  if (!validDay(startDate) || !validDay(expiryDate)) return { success: false, reason: 'INVALID' };
  if (expiryDate <= startDate) return { success: false, reason: 'DATE_ORDER' };
  return { success: true, data: { carrierName: parsed.data.carrierName, policyNumber: parsed.data.policyNumber, coverageType: parsed.data.coverageType || 'Homeowner', premiumAmount: Math.round(parsed.data.premiumAmount * 100) / 100, startDate, expiryDate } };
}

/** The policy number as the answer shows it: enough to recognise, never the whole number. */
export const maskedPolicyNumber = (value: string): string => (value.length <= 4 ? '••••' : `ending ${value.slice(-4)}`);
export const money = (value: number): string => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface InsurancePolicyChange { field: keyof InsurancePolicyForm; label: string; before: string; after: string }
/** What an edit changes, for the review. Empty when the form matches what is recorded. The policy number is shown masked on both sides. */
export function insurancePolicyChanges(before: InsurancePolicyForm, after: InsurancePolicyForm): InsurancePolicyChange[] {
  const changes: InsurancePolicyChange[] = [];
  if (before.carrierName !== after.carrierName) changes.push({ field: 'carrierName', label: 'Insurance company', before: before.carrierName, after: after.carrierName });
  if (before.policyNumber !== after.policyNumber) changes.push({ field: 'policyNumber', label: 'Policy number', before: maskedPolicyNumber(before.policyNumber), after: maskedPolicyNumber(after.policyNumber) });
  if (before.coverageType !== after.coverageType) changes.push({ field: 'coverageType', label: 'Coverage type', before: before.coverageType, after: after.coverageType });
  if (before.premiumAmount !== after.premiumAmount) changes.push({ field: 'premiumAmount', label: 'Annual premium', before: money(before.premiumAmount), after: money(after.premiumAmount) });
  if (before.startDate !== after.startDate) changes.push({ field: 'startDate', label: 'Starts', before: before.startDate, after: after.startDate });
  if (before.expiryDate !== after.expiryDate) changes.push({ field: 'expiryDate', label: 'Expires', before: before.expiryDate, after: after.expiryDate });
  return changes;
}
