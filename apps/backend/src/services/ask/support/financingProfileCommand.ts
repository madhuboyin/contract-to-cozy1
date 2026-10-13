// Editing the financing profile inside Ask (owner ruling 2026-10-13; FRD v1.333). Pure: the declared message, action id, the form and its validation, and the
// conversion from the form's units (dollars, percent, years) to the profile's (cents, basis points, months).
//
// The profile is owner-only as a whole and has one canonical writer (financingProfileWriter). A blank in the form keeps the recorded value. The form never
// takes a user id, and the change is bound to the version of the profile the person was shown.
import { z } from 'zod';
import type { FinancingProfileChanges } from '../../financingProfile/financingProfileWriter';

export const FINANCING_PROFILE_ENTITY_TYPE = 'FINANCING_PROFILE';
export const FINANCING_PROFILE_COMMAND_MESSAGE = 'Update my mortgage and purchase details.';
export const FINANCING_PROFILE_ACTION_ID = 'financing-profile-update';
export const FINANCING_PROFILE_CAPTURE_KEY = 'FINANCING_PROFILE_UPDATE';

export const MORTGAGE_STATUS_CHOICES = ['MORTGAGED', 'NO_MORTGAGE', 'UNKNOWN'] as const;
export const MORTGAGE_TYPE_CHOICES = ['FIXED_30', 'FIXED_15', 'FIXED_20', 'ARM_5', 'ARM_7', 'FHA_30', 'VA_30', 'JUMBO_30', 'OTHER'] as const;
export const FIELD_LABELS = {
  mortgageStatus: 'Mortgage', mortgageType: 'Mortgage type', purchasePriceCents: 'Purchase price', purchaseDate: 'Purchase date',
  originalMortgageBalanceCents: 'Original balance', currentMortgageBalanceCents: 'Current balance', mortgageBalanceAsOfDate: 'Balance as of',
  interestRateBps: 'Interest rate', remainingTermMonths: 'Remaining term', monthlyPaymentCents: 'Monthly payment',
  hasSecondMortgage: 'Second mortgage', secondMortgageBalanceCents: 'Second mortgage balance', hasPMI: 'PMI',
} as const;

const blank = (value: unknown) => (value === '' || value === undefined || value === null ? null : value);
const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((value) => value.value),
]);
const date = z.preprocess(blank, exactDate.nullable()).optional();
const dollars = z.preprocess(blank, z.coerce.number().finite().min(0).max(1_000_000_000).nullable()).optional();
const yesNo = z.preprocess(blank, z.enum(['YES', 'NO']).nullable()).optional();

export const FinancingProfileInputSchema = z.object({
  mortgageStatus: z.preprocess(blank, z.enum(MORTGAGE_STATUS_CHOICES).nullable()).optional(),
  mortgageType: z.preprocess(blank, z.enum(MORTGAGE_TYPE_CHOICES).nullable()).optional(),
  purchasePrice: dollars, purchaseDate: date,
  originalBalance: dollars, currentBalance: dollars, balanceAsOf: date,
  ratePct: z.preprocess(blank, z.coerce.number().finite().min(0).max(50).nullable()).optional(),
  remainingYears: z.preprocess(blank, z.coerce.number().finite().min(1 / 12).max(50).nullable()).optional(),
  monthlyPayment: dollars,
  hasSecondMortgage: yesNo, secondBalance: dollars, hasPMI: yesNo,
}).strict();
export type FinancingProfileForm = z.infer<typeof FinancingProfileInputSchema>;

export function parseFinancingProfileAnswer(answer: unknown): { success: true; data: FinancingProfileForm; changes: FinancingProfileChanges } | { success: false; reason: 'INVALID' | 'NOTHING' } {
  const parsed = FinancingProfileInputSchema.safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const v = parsed.data;
  const cents = (value: number | null | undefined) => (typeof value === 'number' ? Math.round(value * 100) : undefined);
  const day = (value: string | null | undefined) => (typeof value === 'string' ? new Date(`${value}T12:00:00.000Z`) : undefined);
  const changes: FinancingProfileChanges = {};
  const set = <K extends keyof FinancingProfileChanges>(key: K, value: FinancingProfileChanges[K] | undefined) => { if (value !== undefined) changes[key] = value; };
  set('mortgageStatus', v.mortgageStatus ?? undefined);
  set('mortgageType', (v.mortgageType ?? undefined) as FinancingProfileChanges['mortgageType']);
  set('purchasePriceCents', cents(v.purchasePrice));
  set('purchaseDate', day(v.purchaseDate));
  set('originalMortgageBalanceCents', cents(v.originalBalance));
  set('currentMortgageBalanceCents', cents(v.currentBalance));
  set('mortgageBalanceAsOfDate', day(v.balanceAsOf));
  set('interestRateBps', typeof v.ratePct === 'number' ? Math.round(v.ratePct * 100) : undefined);
  set('remainingTermMonths', typeof v.remainingYears === 'number' ? Math.max(1, Math.round(v.remainingYears * 12)) : undefined);
  set('monthlyPaymentCents', cents(v.monthlyPayment));
  set('hasSecondMortgage', v.hasSecondMortgage ? v.hasSecondMortgage === 'YES' : undefined);
  set('secondMortgageBalanceCents', cents(v.secondBalance));
  set('hasPMI', v.hasPMI ? v.hasPMI === 'YES' : undefined);
  if (!Object.keys(changes).length) return { success: false, reason: 'NOTHING' };
  return { success: true, data: v, changes };
}

export const MORTGAGE_TYPE_CHOICE_LABELS: Record<string, string> = {
  FIXED_30: '30-year fixed', FIXED_15: '15-year fixed', FIXED_20: '20-year fixed', ARM_5: '5-year adjustable', ARM_7: '7-year adjustable',
  FHA_30: '30-year FHA', VA_30: '30-year VA', JUMBO_30: '30-year jumbo', OTHER: 'Something else',
};
export const MORTGAGE_STATUS_CHOICE_LABELS: Record<string, string> = { MORTGAGED: 'I have a mortgage', NO_MORTGAGE: 'I have no mortgage', UNKNOWN: 'Not recorded' };
