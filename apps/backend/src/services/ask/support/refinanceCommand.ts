import { z } from 'zod';

export const REFINANCE_COMMAND_ACTIONS = {
  SAVE_SCENARIO: 'refinance-save-scenario',
  ALERT_SETTINGS: 'refinance-alert-settings',
  ADD_COMPARISON: 'refinance-add-comparison',
  DELETE_COMPARISON: 'refinance-delete-comparison',
  RECORD_DECISION: 'refinance-record-decision-inline',
} as const;

export type RefinanceCommandKind = keyof typeof REFINANCE_COMMAND_ACTIONS;
export type RefinanceFormKind = 'ALERT_SETTINGS' | 'ADD_COMPARISON' | 'RECORD_DECISION';

export const REFINANCE_CAPTURE_KEYS: Record<RefinanceFormKind, string> = {
  ALERT_SETTINGS: 'REFINANCE_ALERT_SETTINGS_INPUTS',
  ADD_COMPARISON: 'REFINANCE_LOAN_ESTIMATE_COMPARISON_INPUTS',
  RECORD_DECISION: 'REFINANCE_DECISION_INPUTS',
};

export function refinanceKindFromAction(actionId: string | null | undefined): RefinanceCommandKind | null {
  return (Object.entries(REFINANCE_COMMAND_ACTIONS).find(([, id]) => id === actionId)?.[0] as RefinanceCommandKind | undefined) ?? null;
}

export function refinanceFormKindFromCaptureKey(key: string): RefinanceFormKind | null {
  return (Object.entries(REFINANCE_CAPTURE_KEYS).find(([, value]) => value === key)?.[0] as RefinanceFormKind | undefined) ?? null;
}

const blankIsAbsent = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (value === '' || value === null ? undefined : value), schema.optional());
const optionalMoney = z.coerce.number().min(0).max(100_000_000).optional();
const offer = (prefix: 'a' | 'b') => ({
  [`${prefix}Lender`]: z.string().trim().min(1).max(200),
  [`${prefix}Amount`]: z.coerce.number().min(1_000).max(100_000_000),
  [`${prefix}TermYears`]: z.coerce.number().int().min(1).max(50),
  [`${prefix}LoanType`]: z.enum(['FIXED', 'ARM', 'OTHER']),
  [`${prefix}Rate`]: z.coerce.number().min(0.01).max(30),
  [`${prefix}Apr`]: z.coerce.number().min(0.01).max(30),
  [`${prefix}MonthlyPI`]: z.coerce.number().min(1).max(1_000_000),
  [`${prefix}LoanCosts`]: z.coerce.number().min(0).max(10_000_000),
  [`${prefix}LenderCredits`]: z.coerce.number().min(0).max(10_000_000),
  [`${prefix}CashToClose`]: z.coerce.number().min(0).max(100_000_000),
  [`${prefix}CashDirection`]: z.enum(['FROM_BORROWER', 'TO_BORROWER', 'UNKNOWN']),
  [`${prefix}MonthlyMI`]: optionalMoney,
  [`${prefix}TotalPayment`]: optionalMoney,
  // The figures Desktop's form and the Loan Estimate reader also carry; the five-year pair and the date rules are the canonical schema's, applied at review.
  // Blank means "not on the form", never 0: a zero five-year total would be saved as a figure.
  [`${prefix}DiscountPointsPct`]: blankIsAbsent(z.coerce.number().min(0).max(10)),
  [`${prefix}DiscountPointsUsd`]: blankIsAbsent(z.coerce.number().min(0).max(100_000_000)),
  [`${prefix}FiveYearTotalPaid`]: blankIsAbsent(z.coerce.number().min(0).max(100_000_000)),
  [`${prefix}FiveYearPrincipalPaid`]: blankIsAbsent(z.coerce.number().min(0).max(100_000_000)),
  [`${prefix}IssuedDate`]: z.preprocess((value) => (value === '' ? undefined : value), z.string().trim().max(10).optional()),
});

export const refinanceAlertAnswerSchema = z.object({
  emailEnabled: z.boolean(), pushEnabled: z.boolean(),
  cadence: z.enum(['IMMEDIATE', 'DAILY_DIGEST', 'WEEKLY_BRIEF', 'MUTED']),
  sensitivity: z.enum(['EARLY', 'CONSERVATIVE', 'BALANCED']),
  quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().trim().min(1).max(100),
});

export const refinanceComparisonAnswerSchema = z.object({
  label: z.string().trim().max(120).optional(), ...offer('a'), ...offer('b'),
});

/** The "no link" choice in the decision form: it removes a saved link, where leaving the field blank keeps it. */
export const REFINANCE_NO_LINK = 'NONE';
/** blank keeps the saved link, an id links that record, REFINANCE_NO_LINK removes the link (null). */
const optionalLinkId = z.preprocess((value) => (value === '' || value === undefined ? undefined : value === REFINANCE_NO_LINK || value === null ? null : value), z.string().trim().min(1).max(100).nullable().optional());

export const refinanceDecisionAnswerSchema = z.object({
  /** Optional links to what the decision rests on; each is checked against this home's saved records before anything is written. */
  scenarioSnapshotId: optionalLinkId,
  loanEstimateComparisonId: optionalLinkId,
  selectedOfferId: optionalLinkId,
  status: z.enum(['EXPLORING', 'DEFERRED', 'KEEP_CURRENT_LOAN', 'PROCEEDING', 'OFFER_SELECTED', 'APPLICATION_IN_PROGRESS', 'DECLINED', 'ABANDONED', 'CLOSED']),
  rationale: z.string().trim().max(2000).optional(),
  nextReviewAt: z.string().optional(),
  currentMortgageBalanceUsd: optionalMoney,
  interestRatePct: z.coerce.number().min(0.01).max(30).optional(),
  remainingTermMonths: z.coerce.number().int().min(1).max(600).optional(),
  monthlyPaymentUsd: optionalMoney,
  closingCostUsd: optionalMoney,
}).superRefine((value, ctx) => {
  if (value.status === 'OFFER_SELECTED' && (!value.loanEstimateComparisonId || !value.selectedOfferId)) ctx.addIssue({ code: 'custom', path: ['selectedOfferId'], message: 'Selecting an offer needs the saved comparison and the offer from it.' });
  if (value.selectedOfferId && !value.loanEstimateComparisonId) ctx.addIssue({ code: 'custom', path: ['loanEstimateComparisonId'], message: 'Choose the saved comparison the offer belongs to.' });
  if (value.status === 'DEFERRED' && !value.nextReviewAt) ctx.addIssue({ code: 'custom', path: ['nextReviewAt'], message: 'Choose a future review date.' });
  if (value.status === 'CLOSED' && (value.currentMortgageBalanceUsd == null || value.interestRatePct == null || value.remainingTermMonths == null)) {
    ctx.addIssue({ code: 'custom', path: ['currentMortgageBalanceUsd'], message: 'A verified closing requires the new balance, rate, and term.' });
  }
});

/** The lender-discussion brief is a read on the refinance answer (not a command), so viewers can use it. Desktop's three acknowledgements before it; each is its own required answer and none can be collapsed into a generic confirmation. */
export const REFINANCE_LENDER_BRIEF_ACTION_ID = 'refinance-lender-brief';
export const REFINANCE_LENDER_BRIEF_CAPTURE_KEY = 'REFINANCE_LENDER_BRIEF_INPUTS';
export const REFINANCE_BRIEF_ACKNOWLEDGEMENTS = [
  { key: 'figuresVerified', label: 'I checked the selected figures against the latest official Loan Estimate.' },
  { key: 'sameLoanRequestConfirmed', label: 'The offers reflect my intended loan request, or I understand the visible differences.' },
  { key: 'manualSharingUnderstood', label: 'I understand this only shows a brief here; ContractToCozy will not send it or contact a lender.' },
] as const;

export const refinanceLenderBriefAnswerSchema = z.object({
  selectedOfferId: z.string().trim().min(1).max(100),
  figuresVerified: z.literal(true), sameLoanRequestConfirmed: z.literal(true), manualSharingUnderstood: z.literal(true),
});

/** One offer of the comparison answer in the canonical Loan Estimate input shape (the shape Desktop saves and its schema validates). */
export function refinanceOfferFromAnswer(d: Record<string, unknown>, p: 'a' | 'b', id: string) {
  const has = (key: string) => d[key] != null && d[key] !== '';
  const num = (key: string) => Number(d[key]);
  return {
    id, lenderName: String(d[`${p}Lender`]), loanAmountUsd: num(`${p}Amount`), loanTermYears: num(`${p}TermYears`), loanType: d[`${p}LoanType`] as 'FIXED' | 'ARM' | 'OTHER',
    noteRatePct: num(`${p}Rate`), aprPct: num(`${p}Apr`), monthlyPrincipalAndInterestUsd: num(`${p}MonthlyPI`),
    ...(has(`${p}MonthlyMI`) ? { monthlyMortgageInsuranceUsd: num(`${p}MonthlyMI`) } : {}),
    ...(has(`${p}TotalPayment`) ? { estimatedTotalMonthlyPaymentUsd: num(`${p}TotalPayment`) } : {}),
    loanCostsUsd: num(`${p}LoanCosts`), lenderCreditsUsd: num(`${p}LenderCredits`),
    ...(has(`${p}DiscountPointsPct`) ? { discountPointsPct: num(`${p}DiscountPointsPct`) } : {}),
    ...(has(`${p}DiscountPointsUsd`) ? { discountPointsUsd: num(`${p}DiscountPointsUsd`) } : {}),
    cashToCloseUsd: num(`${p}CashToClose`), cashToCloseDirection: d[`${p}CashDirection`] as 'FROM_BORROWER' | 'TO_BORROWER' | 'UNKNOWN',
    ...(has(`${p}FiveYearTotalPaid`) ? { fiveYearTotalPaidUsd: num(`${p}FiveYearTotalPaid`) } : {}),
    ...(has(`${p}FiveYearPrincipalPaid`) ? { fiveYearPrincipalPaidUsd: num(`${p}FiveYearPrincipalPaid`) } : {}),
    ...(has(`${p}IssuedDate`) ? { issuedDate: String(d[`${p}IssuedDate`]) } : {}),
  };
}

export function parseRefinanceCommandAnswer(kind: RefinanceFormKind, value: unknown) {
  return kind === 'ALERT_SETTINGS' ? refinanceAlertAnswerSchema.safeParse(value)
    : kind === 'ADD_COMPARISON' ? refinanceComparisonAnswerSchema.safeParse(value)
      : refinanceDecisionAnswerSchema.safeParse(value);
}
