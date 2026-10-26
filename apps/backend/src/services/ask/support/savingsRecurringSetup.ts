// Setting up recurring costs inside Ask (parity with the desktop Savings and Benefits "Recurring costs" tab, which saves a current plan per category and
// compares it). Pure: the categories, the plan form per category and its validation, and the payload the account route takes (the desktop form's own
// `buildPayload`, mirrored). Declared-action only, and the home's primary owner only, as both services are.
//
// Not collected, deliberately: an account number. The route accepts a masked one, but a chat transcript is a poor place for account identifiers.
// Saving a plan makes the service re-run that category's comparison, so one confirmed step covers "set up and check".
import { z } from 'zod';

export const SAVINGS_RECURRING_CATEGORY_ENTITY_TYPE = 'HOME_SAVINGS_CATEGORY';
export const SAVINGS_RECURRING_PLAN_CAPTURE_KEY = 'SAVINGS_RECURRING_PLAN';
export const SAVINGS_RECURRING_CATEGORIES = ['HOME_INSURANCE', 'HOME_WARRANTY', 'INTERNET', 'ELECTRICITY_GAS'] as const;
export type SavingsRecurringCategory = (typeof SAVINGS_RECURRING_CATEGORIES)[number];
export const isSavingsRecurringCategory = (value: unknown): value is SavingsRecurringCategory => typeof value === 'string' && (SAVINGS_RECURRING_CATEGORIES as readonly string[]).includes(value);
/** "Check all" acts on every category rather than one. */
export const SAVINGS_RECURRING_ALL = 'ALL';

export const SAVINGS_RECURRING_LABELS: Record<SavingsRecurringCategory, string> = {
  HOME_INSURANCE: 'Home insurance', HOME_WARRANTY: 'Home warranty', INTERNET: 'Internet', ELECTRICITY_GAS: 'Electricity and gas',
};
/** What a linked account's facts come from, in the household's words. */
export const SAVINGS_SOURCE_LABELS = { INSURANCE_POLICY: 'insurance policy record', WARRANTY: 'warranty record' } as const;
export const SAVINGS_BILLING_CADENCES = ['MONTHLY', 'QUARTERLY', 'ANNUAL', 'OTHER'] as const;
export const SAVINGS_BILLING_CADENCE_LABELS: Record<string, string> = { MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', ANNUAL: 'Annual', OTHER: 'Other' };
export const SAVINGS_RATE_TYPES = ['FIXED', 'VARIABLE'] as const;

/** Which optional fields each category asks for (the desktop form's own). */
export const savingsPlanFields = (category: SavingsRecurringCategory) => ({
  renewalDate: category === 'HOME_INSURANCE' || category === 'HOME_WARRANTY',
  contractEndDate: category === 'HOME_WARRANTY' || category === 'INTERNET',
  speedTier: category === 'INTERNET',
  rateType: category === 'ELECTRICITY_GAS',
  usageKwh: category === 'ELECTRICITY_GAS',
});

const blank = (value: unknown) => (value === '' || value === undefined || value === null ? null : value);
const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((value) => value.value),
]);
const optionalDate = z.preprocess(blank, exactDate.nullable()).optional();
const optionalText = (max: number) => z.preprocess(blank, z.string().trim().max(max).nullable()).optional();
const amount = z.coerce.number().finite().min(0).max(1_000_000);

/** One form for every category; the fields a category does not ask for are rejected, so a stale or crafted answer cannot smuggle them in. */
export const SavingsPlanInputSchema = z.object({
  providerName: optionalText(200), planName: optionalText(200),
  billingCadence: z.enum(SAVINGS_BILLING_CADENCES),
  // What you pay is required: a comparison needs it, and the desktop form's blank amount leaves a plan nothing can be compared against.
  amount,
  renewalDate: optionalDate, contractEndDate: optionalDate,
  speedTier: optionalText(120), rateType: z.preprocess(blank, z.enum(SAVINGS_RATE_TYPES).nullable()).optional(),
  usageKwh: z.preprocess(blank, amount.nullable()).optional(),
}).strict();
export type SavingsPlanForm = z.infer<typeof SavingsPlanInputSchema>;

export function parseSavingsPlanAnswer(category: SavingsRecurringCategory, answer: unknown): { success: true; data: SavingsPlanForm } | { success: false } {
  const parsed = SavingsPlanInputSchema.safeParse(answer);
  if (!parsed.success) return { success: false };
  const allowed = savingsPlanFields(category);
  const v = parsed.data;
  if ((v.renewalDate && !allowed.renewalDate) || (v.contractEndDate && !allowed.contractEndDate) || (v.speedTier && !allowed.speedTier)
    || (v.rateType && !allowed.rateType) || (v.usageKwh != null && !allowed.usageKwh)) return { success: false };
  return { success: true, data: v };
}

/** A plan amount keeps its cents ($89.99), since the shared whole-dollar formatter would show it as $90. */
export const formatPlanAmount = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value);

const iso = (day: string) => new Date(`${day}T00:00:00.000Z`).toISOString();

/** The request the account route takes: the desktop form's own mapping (dates as ISO, speed in usage, rate type in plan details, monthly kWh in usage). */
export function savingsPlanPayload(category: SavingsRecurringCategory, form: SavingsPlanForm) {
  const allowed = savingsPlanFields(category);
  // A field left blank is sent as an explicit null: the service only changes a field that is present, so an omitted one would keep its old value while the
  // review said it was cleared. Dates are cleared only for the categories that ask for them.
  return {
    providerName: form.providerName ?? null,
    planName: form.planName ?? null,
    billingCadence: form.billingCadence,
    amount: form.amount,
    ...(allowed.renewalDate ? { renewalDate: form.renewalDate ? iso(form.renewalDate) : null } : {}),
    ...(allowed.contractEndDate ? { contractEndDate: form.contractEndDate ? iso(form.contractEndDate) : null } : {}),
    ...(category === 'INTERNET' ? { usageJson: { speedTier: form.speedTier || undefined } } : {}),
    ...(category === 'ELECTRICITY_GAS' ? { planDetailsJson: { rateType: form.rateType || undefined }, usageJson: { kwhMonthly: form.usageKwh ?? undefined } } : {}),
  };
}

/** What the setup row says about a category: the saved plan in a line, or that nothing is set up. */
export function savingsRecurringRow(
  category: SavingsRecurringCategory,
  summary: { status: string; account?: { providerName?: string | null; planName?: string | null; amount?: number | null; billingCadence?: string | null; renewalDate?: string | null; canonicalSource?: 'INSURANCE_POLICY' | 'WARRANTY' | null } | null; topOpportunity?: { headline?: string | null } | null } | null,
  helpers: { money: (value: number) => string; date: (value: string) => string | null },
) {
  const account = summary?.account ?? null;
  const plan = account ? [account.providerName, account.planName].filter(Boolean).join(' · ') : '';
  const cost = account?.amount != null ? `${helpers.money(account.amount)} ${(account.billingCadence ?? 'MONTHLY').toLowerCase()}` : null;
  const renews = account?.renewalDate ? helpers.date(account.renewalDate) : null;
  const source = account?.canonicalSource ?? null;
  return {
    id: `recurring-setup-${category}`, title: SAVINGS_RECURRING_LABELS[category],
    description: source
      ? `${plan || 'Plan'}. These details come from your ${SAVINGS_SOURCE_LABELS[source]}, so they are read from there and cannot be changed here.`
      : account ? (plan || 'Plan saved') : 'Not set up yet. Add what you pay now and Ask will compare it.',
    meta: [
      source ? `From your ${SAVINGS_SOURCE_LABELS[source]}` : account ? 'Plan saved' : 'Not set up',
      ...(cost ? [cost] : []), ...(renews ? [`Renews ${renews}`] : []),
      ...(summary?.status === 'FOUND_SAVINGS' ? ['Possible saving found'] : []),
    ],
    status: summary?.status ?? 'NOT_SET_UP', href: null, hasPlan: Boolean(account), fromRecord: Boolean(source),
  };
}
