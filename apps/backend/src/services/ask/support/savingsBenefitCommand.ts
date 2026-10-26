// Saving, dismissing and following up a savings or benefit opportunity inside Ask (register P1 "Savings & Benefits"; FRD v1.323). Pure: declared messages,
// action ids, row-id parsing, the outcome form and its validation (the service's own stage rules, mirrored so a mistake shows before the review).
//
// Declared-action only. What is deliberately NOT here: recording a sensitive eligibility fact (income, disability, immigration status and the like) and any
// partner handoff, quote request or complaint. Those share personal information and need their own product decision; they stay on the page.
import { z } from 'zod';

export const SAVINGS_AVAILABLE_ENTITY_TYPE = 'SAVINGS_BENEFIT_AVAILABLE';
export const SAVINGS_IN_PROGRESS_ENTITY_TYPE = 'SAVINGS_BENEFIT_IN_PROGRESS';
export const SAVINGS_COMMAND_MESSAGES = {
  SAVE: 'Save this savings opportunity for later.',
  DISMISS: 'Dismiss this savings opportunity.',
  STOP: 'Stop pursuing this savings opportunity.',
  OUTCOME: 'Record the outcome of this savings opportunity.',
  PLAN: 'Set up my current plan for this recurring cost.',
  CHECK: 'Check my recurring costs for savings.',
  APPLIED: 'Record that I applied for this savings opportunity myself.',
  SWITCHED: 'Record that I switched to this savings opportunity myself.',
  SCAN: 'Scan this home for benefits and rebates.',
} as const;
export type SavingsCommandKind = keyof typeof SAVINGS_COMMAND_MESSAGES;
export const SAVINGS_COMMAND_ACTION_IDS = { SAVE: 'savings-benefit-save', DISMISS: 'savings-benefit-dismiss', STOP: 'savings-benefit-stop', OUTCOME: 'savings-benefit-outcome', PLAN: 'savings-recurring-plan', CHECK: 'savings-recurring-check', APPLIED: 'savings-benefit-applied', SWITCHED: 'savings-benefit-switched', SCAN: 'savings-benefits-scan' } as const;
export const savingsCommandKindFromMessage = (message: string): SavingsCommandKind | null =>
  ((Object.entries(SAVINGS_COMMAND_MESSAGES) as Array<[SavingsCommandKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
/** The recurring-cost setup acts on a category (or all of them), not on one opportunity. */
export const isRecurringSetupKind = (kind: SavingsCommandKind): kind is 'PLAN' | 'CHECK' => kind === 'PLAN' || kind === 'CHECK';
/** The benefits scan acts on the whole home, not on one opportunity or category. */
export const SAVINGS_BENEFITS_SCAN_ENTITY_TYPE = 'SAVINGS_BENEFITS_SCAN';
export const SAVINGS_BENEFITS_SCAN_ENTITY_ID = 'BENEFITS';
export const savingsCommandEntityType = (kind: SavingsCommandKind) => kind === 'SCAN' ? SAVINGS_BENEFITS_SCAN_ENTITY_TYPE : isRecurringSetupKind(kind) ? 'HOME_SAVINGS_CATEGORY' :
  kind === 'SAVE' || kind === 'DISMISS' || kind === 'APPLIED' || kind === 'SWITCHED' ? SAVINGS_AVAILABLE_ENTITY_TYPE : SAVINGS_IN_PROGRESS_ENTITY_TYPE;
export const SAVINGS_OUTCOME_CAPTURE_KEY = 'SAVINGS_BENEFIT_OUTCOME';

export type SavingsFamily = 'BENEFIT' | 'RECURRING_COST';
export interface SavingsTarget { family: SavingsFamily; opportunityId: string }
/** The ids the Ask answer gives its cards: `recurring-<id>` and `benefit-<id>` for what is available, `progress-<FAMILY>-<id>` for what is under way. */
export function parseSavingsRowId(raw: string): SavingsTarget | null {
  const recurring = /^recurring-(.+)$/.exec(raw);
  if (recurring) return { family: 'RECURRING_COST', opportunityId: recurring[1] };
  const benefit = /^benefit-(.+)$/.exec(raw);
  if (benefit) return { family: 'BENEFIT', opportunityId: benefit[1] };
  const progress = /^progress-(BENEFIT|RECURRING_COST)-(.+)$/.exec(raw);
  if (progress) return { family: progress[1] as SavingsFamily, opportunityId: progress[2] };
  return null;
}

export const SAVINGS_OUTCOME_STAGES = ['SUBMITTED', 'APPROVED', 'DENIED', 'RECEIVED', 'WITHDRAWN', 'EXPIRED', 'NO_ACTION'] as const;
export const SAVINGS_OUTCOME_STAGE_LABELS: Record<string, string> = {
  SUBMITTED: 'I submitted it', APPROVED: 'It was approved', DENIED: 'It was denied', RECEIVED: 'I received the savings', WITHDRAWN: 'I withdrew', EXPIRED: 'It expired', NO_ACTION: 'I decided not to act',
};

const blank = (value: unknown) => (value === '' || value === undefined || value === null ? null : value);
const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((value) => value.value),
]);
const optionalDate = z.preprocess(blank, exactDate.nullable()).optional();
const optionalText = (max: number) => z.preprocess(blank, z.string().trim().max(max).nullable()).optional();
const money = z.preprocess(blank, z.coerce.number().finite().min(0).max(1_000_000_000).nullable()).optional();

export const SavingsOutcomeInputSchema = z.object({
  stage: z.enum(SAVINGS_OUTCOME_STAGES),
  amountReceived: money, observedMonthlyValue: money, observedAnnualValue: money,
  evidenceNote: optionalText(2000), denialReason: optionalText(2000), closureReason: optionalText(2000),
  observationStartedOn: optionalDate, observationEndedOn: optionalDate,
}).strict();

export type SavingsOutcomeForm = z.infer<typeof SavingsOutcomeInputSchema>;
export type SavingsOutcomeInvalid = 'INVALID' | 'MISSING_VALUE' | 'MISSING_EVIDENCE' | 'MISSING_DENIAL_REASON' | 'MISSING_CLOSURE_REASON' | 'MISSING_OBSERVATION_WINDOW' | 'OBSERVATION_WINDOW_TOO_SHORT' | 'FUTURE_WINDOW';

/** The service's own stage rules (savingsOutcome.service), checked before the review so the household is told what is missing. */
export function parseSavingsOutcomeAnswer(family: SavingsFamily, answer: unknown, today = new Date().toISOString().slice(0, 10)):
  { success: true; data: SavingsOutcomeForm } | { success: false; reason: SavingsOutcomeInvalid } {
  const parsed = SavingsOutcomeInputSchema.safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const v = parsed.data;
  const note = (v.evidenceNote ?? '').trim();
  if (v.stage === 'RECEIVED') {
    const hasValue = family === 'BENEFIT' ? v.amountReceived != null : v.observedMonthlyValue != null || v.observedAnnualValue != null;
    if (!hasValue) return { success: false, reason: 'MISSING_VALUE' };
    if (!note) return { success: false, reason: 'MISSING_EVIDENCE' };
    if (family === 'RECURRING_COST') {
      if (!v.observationStartedOn || !v.observationEndedOn) return { success: false, reason: 'MISSING_OBSERVATION_WINDOW' };
      if (v.observationEndedOn > today || v.observationStartedOn > today) return { success: false, reason: 'FUTURE_WINDOW' };
      const days = (Date.parse(`${v.observationEndedOn}T00:00:00Z`) - Date.parse(`${v.observationStartedOn}T00:00:00Z`)) / 86_400_000;
      if (!(days >= 28)) return { success: false, reason: 'OBSERVATION_WINDOW_TOO_SHORT' };
    }
  }
  if (v.stage === 'DENIED' && !(v.denialReason ?? '').trim()) return { success: false, reason: 'MISSING_DENIAL_REASON' };
  if (['WITHDRAWN', 'EXPIRED', 'NO_ACTION'].includes(v.stage) && !(v.closureReason ?? '').trim()) return { success: false, reason: 'MISSING_CLOSURE_REASON' };
  return { success: true, data: v };
}
export const SAVINGS_OUTCOME_INVALID_MESSAGES: Record<SavingsOutcomeInvalid, string> = {
  INVALID: 'Check the form and try again.',
  MISSING_VALUE: 'Say how much you received.',
  MISSING_EVIDENCE: 'Say what backs it, such as an award letter or a bill.',
  MISSING_DENIAL_REASON: 'Say why it was denied.',
  MISSING_CLOSURE_REASON: 'Say why you are closing it.',
  MISSING_OBSERVATION_WINDOW: 'A recurring saving needs the start and end of the billing period you observed.',
  OBSERVATION_WINDOW_TOO_SHORT: 'A recurring saving must be observed for at least 28 days before it counts as received.',
  FUTURE_WINDOW: 'The observed period cannot be in the future.',
};

/**
 * "I applied" and "I switched" (the desktop's Applied and Switched, recurring-cost opportunities only): the household records that it did this itself, with
 * the provider. They are available while the opportunity is still undecided or saved, so the answer's row action and the confirmation agree.
 */
export const RECURRING_APPLY_STATUSES: readonly string[] = ['NEW', 'VIEWED', 'SAVED'];
export const recurringStatusAllowsApply = (status: string) => RECURRING_APPLY_STATUSES.includes(status);
export const isApplyKind = (kind: SavingsCommandKind): kind is 'APPLIED' | 'SWITCHED' => kind === 'APPLIED' || kind === 'SWITCHED';
/** The canonical action types behind them (the desktop's own mapping): applying is an externally submitted application. */
export const applyActionType = (kind: 'APPLIED' | 'SWITCHED') => (kind === 'SWITCHED' ? 'SWITCHED' : 'EXTERNALLY_SUBMITTED') as 'SWITCHED' | 'EXTERNALLY_SUBMITTED';

/** The steps a recurring-cost saving offers, in the order they are shown, from its status (the row and the confirmation share the gates above). */
export function recurringRowActionKinds(status: string): Array<'SAVE' | 'SWITCHED' | 'APPLIED' | 'DISMISS'> {
  return [
    ...(['NEW', 'VIEWED'].includes(status) ? ['SAVE' as const] : []),
    ...(recurringStatusAllowsApply(status) ? ['SWITCHED' as const, 'APPLIED' as const] : []),
    ...(['NEW', 'VIEWED', 'SAVED'].includes(status) ? ['DISMISS' as const] : []),
  ];
}
export const RECURRING_ROW_ACTION_LABELS = { SAVE: 'Save for later', SWITCHED: 'I switched', APPLIED: 'I applied', DISMISS: 'Dismiss' } as const;
