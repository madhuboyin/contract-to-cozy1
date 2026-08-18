import { z } from 'zod';

export const BUYER_PLAN_PHASES = [
  'EXPLORING',
  'OFFER_CONTRACT',
  'DUE_DILIGENCE',
  'CLOSING_PREP',
  'MOVE_IN',
  'FIRST_30_DAYS',
  'DAYS_31_TO_90',
  'RECURRING_HOME',
] as const;

export const BUYER_JOURNEY_STATUSES = ['ACTIVE', 'PAUSED', 'CANCELLED', 'HANDED_OFF', 'ARCHIVED'] as const;
export const BUYER_JOURNEY_STAGES = [
  'EXPLORING',
  'OFFER_CONTRACT',
  'DUE_DILIGENCE',
  'CLOSING_PREP',
  'CLOSED',
  'MOVE_IN',
  'FIRST_30_DAYS',
  'DAYS_31_TO_90',
  'HANDED_OFF',
] as const;
export const BUYER_TASK_STATUSES = ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'NOT_NEEDED', 'CANCELLED'] as const;
export const BUYER_TASK_TYPES = ['ACTION', 'MILESTONE_SUPPORT', 'DECISION', 'DOCUMENT', 'SERVICE', 'MOVE', 'HOME_SETUP'] as const;
export const BUYER_CHECKLIST_SECTIONS = [
  'CONTRACT_CONTINGENCIES',
  'INSPECTION_DUE_DILIGENCE',
  'FINANCING_APPRAISAL',
  'TITLE_ESCROW_HOA',
  'INSURANCE',
  'FINAL_WALKTHROUGH',
  'CLOSING_DISCLOSURE_FUNDS',
  'CLOSING_DAY',
  'MOVE_POSSESSION',
  'POST_CLOSE_SAVED',
] as const;
export const BUYER_EVIDENCE_REQUIREMENTS = ['NONE', 'OPTIONAL', 'REQUIRED'] as const;
export const BUYER_TASK_APPLICABILITIES = ['UNKNOWN', 'APPLICABLE', 'NOT_APPLICABLE'] as const;
export const BUYER_COMPLETION_METHODS = [
  'USER_ATTESTATION',
  'DOCUMENT',
  'PHOTO',
  'BOOKING_COMPLETION',
  'INSPECTION_CONFIRMATION',
  'EXTERNAL_CONFIRMATION',
] as const;
export const BUYER_MILESTONE_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'WAIVED', 'MISSED', 'CANCELLED'] as const;
export const BUYER_MILESTONE_TYPES = [
  'OFFER_SUBMITTED',
  'CONTRACT_ACCEPTED',
  'EARNEST_MONEY_DUE',
  'INSPECTION',
  'INSPECTION_CONTINGENCY',
  'ATTORNEY_REVIEW',
  'FINANCING_CONTINGENCY',
  'APPRAISAL',
  'TITLE_SURVEY',
  'INSURANCE_EFFECTIVE',
  'CLOSING_DISCLOSURE',
  'FINAL_WALKTHROUGH',
  'CLOSING',
  'MOVE_IN',
  'DAY_30',
  'DAY_60',
  'DAY_90',
  'CUSTOM',
] as const;
export const BUYER_CONTACT_ROLES = ['BUYER_AGENT', 'LENDER', 'ATTORNEY', 'TITLE_ESCROW', 'INSPECTOR', 'INSURANCE', 'MOVER', 'OTHER'] as const;

export const BUYER_CHECKLIST_TEMPLATE_VERSION = 'buyer-closing-v1';
export const BUYER_ACTION_KEYS = {
  CONTRACT_REVISION_CONFIRM: 'buyer:contract:revision-confirm',
  CONTRACT_CONTINGENCIES_REVIEW: 'buyer:contract:contingencies-review',
  PURCHASE_PATH_CONFIRM: 'buyer:phase:purchase-path-confirm',
  LOAN_APPLICATION: 'buyer:financing:loan-application',
  LOAN_ESTIMATES: 'buyer:financing:loan-estimates',
  APPRAISAL_TRACKING: 'buyer:financing:appraisal',
  TITLE_CONTACT_CONFIRM: 'buyer:phase:title-closing-contact-confirm',
  TITLE_DOCUMENT_REVIEW: 'buyer:title:document-review',
  TITLE_ISSUE_RESOLUTION: 'buyer:title:issue-resolution',
  INSPECTION_PLAN_CONFIRM: 'buyer:phase:inspection-plan-confirm',
  INSPECTION_IMPORT: 'buyer:inspection:import',
  INSPECTION_VERIFY: 'buyer:inspection:verify',
  INSPECTION_REINSPECTION: 'buyer:inspection:reinspection',
  NEGOTIATION_SEPARATE: 'buyer:negotiation:separate',
  COVERAGE_BIND: 'buyer:coverage:bind',
  WALKTHROUGH_PREP: 'buyer:phase:walkthrough-prepare',
  WALKTHROUGH_ISSUES: 'buyer:walkthrough:issue-resolution',
  CLOSING_DISCLOSURE_REVIEW: 'buyer:closing:disclosure-review',
  FUNDS_READINESS_CONFIRM: 'buyer:phase:funds-readiness-confirm',
  CLOSING_DAY_CONFIRM: 'buyer:phase:closing-day-confirm',
  CLOSING_DOCUMENTS: 'buyer:closing:documents',
  SAFETY_ACCESS: 'buyer:safety:access',
  UTILITIES_SETUP: 'buyer:utilities:setup',
  INSPECTION_REPAIR_JOURNEYS: 'buyer:inspection:repair-journeys',
  HOUSEHOLD_RESPONSIBILITY: 'buyer:household:responsibility',
  SYSTEMS_BASELINE: 'buyer:systems:baseline',
  MAINTENANCE_FIRST_CYCLE: 'buyer:maintenance:first-cycle',
  RECURRING_HANDOFF: 'buyer:recurring:handoff',
} as const;
export const BUYER_MILESTONE_KEYS = Object.fromEntries(
  BUYER_MILESTONE_TYPES.map((type) => [type, `buyer:milestone:${type.toLowerCase().replace(/_/g, '-')}`]),
) as Record<(typeof BUYER_MILESTONE_TYPES)[number], string>;

export const BUYER_PLAN_PRIORITIES = ['NOW', 'SOON', 'PLAN', 'CONSIDER'] as const;
export const BUYER_TASK_SOURCE_TYPES = [
  'SYSTEM',
  'USER',
  'INSPECTION_FINDING',
  'DOCUMENT',
  'GUIDANCE_JOURNEY',
  'HOME_ACTION',
] as const;

export const BuyerPlanPhaseSchema = z.enum(BUYER_PLAN_PHASES);
export const BuyerJourneyStatusSchema = z.enum(BUYER_JOURNEY_STATUSES);
export const BuyerJourneyStageSchema = z.enum(BUYER_JOURNEY_STAGES);
export const HomeBuyerTaskStatusSchema = z.enum(BUYER_TASK_STATUSES);
export const BuyerTaskTypeSchema = z.enum(BUYER_TASK_TYPES);
export const BuyerChecklistSectionSchema = z.enum(BUYER_CHECKLIST_SECTIONS);
export const BuyerEvidenceRequirementSchema = z.enum(BUYER_EVIDENCE_REQUIREMENTS);
export const BuyerTaskApplicabilitySchema = z.enum(BUYER_TASK_APPLICABILITIES);
export const BuyerCompletionMethodSchema = z.enum(BUYER_COMPLETION_METHODS);
export const BuyerMilestoneStatusSchema = z.enum(BUYER_MILESTONE_STATUSES);
export const BuyerMilestoneTypeSchema = z.enum(BUYER_MILESTONE_TYPES);
export const BuyerContactRoleSchema = z.enum(BUYER_CONTACT_ROLES);
export const BuyerPlanPrioritySchema = z.enum(BUYER_PLAN_PRIORITIES);
export const BuyerTaskSourceTypeSchema = z.enum(BUYER_TASK_SOURCE_TYPES);
export const BUYER_FINDING_DISPOSITIONS = [
  'VERIFIED_FACT',
  'PRE_CLOSE_NEGOTIATION',
  'POST_CLOSE_ACTION',
  'DISMISSED',
] as const;
export const BuyerFindingDispositionSchema = z.enum(BUYER_FINDING_DISPOSITIONS);

export const BuyerTaskLineageSchema = z.strictObject({
  sourceType: BuyerTaskSourceTypeSchema,
  sourceEntityType: z.string().trim().min(1).max(120).nullable(),
  sourceEntityId: z.string().trim().min(1).max(200).nullable(),
  guidanceJourneyId: z.string().trim().min(1).max(200).nullable(),
  homeActionKey: z.string().trim().min(1).max(240).nullable(),
});

export const BuyerPlanTaskInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).optional(),
  actionKey: z.string().trim().min(1).max(240).optional(),
  phase: BuyerPlanPhaseSchema.default('FIRST_30_DAYS'),
  priority: BuyerPlanPrioritySchema.default('PLAN'),
  taskType: BuyerTaskTypeSchema.default('ACTION'),
  checklistSection: BuyerChecklistSectionSchema.nullable().optional(),
  status: HomeBuyerTaskStatusSchema.optional(),
  dueAt: z.string().datetime().nullable().optional(),
  serviceCategory: z.string().trim().min(1).max(100).nullable().optional(),
  assignedToUserId: z.string().trim().min(1).nullable().optional(),
  completionEvidence: z.record(z.string(), z.unknown()).nullable().optional(),
  evidenceRequirement: BuyerEvidenceRequirementSchema.default('NONE'),
  applicability: BuyerTaskApplicabilitySchema.default('UNKNOWN'),
  blocking: z.boolean().default(false),
  required: z.boolean().default(false),
  notes: z.string().trim().max(4_000).nullable().optional(),
  lineage: BuyerTaskLineageSchema.partial().optional(),
});

export const BuyerLifecycleUpdateSchema = z.strictObject({
  targetCloseDate: z.string().datetime().nullable().optional(),
  moveInDate: z.string().datetime().nullable().optional(),
}).refine((value) => Object.values(value).some((field) => field !== undefined), {
  message: 'At least one lifecycle anchor must be provided.',
});

export const BuyerJourneyCancelSchema = z.strictObject({
  confirmed: z.literal(true),
  reason: z.string().trim().min(5).max(500),
});

export const BuyerJourneyPauseSchema = z.strictObject({
  confirmed: z.literal(true),
});

export const BuyerJourneyResumeSchema = z.strictObject({
  confirmed: z.literal(true),
});

export const BUYER_CONTRACT_FIELD_KEYS = [
  'PROPERTY_ADDRESS', 'BUYER_NAMES', 'SELLER_NAMES', 'ACCEPTANCE_DATE',
  'TARGET_CLOSING_DATE', 'POSSESSION_DATE', 'POSSESSION_TERMS',
  'EARNEST_MONEY_AMOUNT', 'EARNEST_MONEY_RECIPIENT', 'EARNEST_MONEY_METHOD',
  'SELLER_CREDITS', 'INCLUDED_ITEMS', 'EXCLUDED_ITEMS', 'AGREED_REPAIRS',
  'SPECIAL_CONDITIONS',
] as const;
export const BUYER_CONTRACT_CONTINGENCY_TYPES = [
  'EARNEST_MONEY', 'INSPECTION', 'ATTORNEY_REVIEW', 'FINANCING', 'APPRAISAL',
  'TITLE', 'HOA_DOCUMENTS', 'SALE_OF_HOME', 'OTHER',
] as const;
export const BUYER_CONTRACT_CONTINGENCY_STATUSES = ['ACTIVE', 'SATISFIED', 'WAIVED', 'EXPIRED'] as const;
const BuyerContractDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
const BuyerContractContingencySchema = z.strictObject({
  contingencyKey: z.string().trim().min(1).max(120),
  type: z.enum(BUYER_CONTRACT_CONTINGENCY_TYPES),
  label: z.string().trim().min(1).max(200),
  status: z.enum(BUYER_CONTRACT_CONTINGENCY_STATUSES).default('ACTIVE'),
  dueAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(4_000).nullable().optional(),
  sourceDocumentId: z.string().uuid().nullable().optional(),
  sourcePage: z.number().int().min(1).max(10_000).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});
const BuyerContractRevisionFieldsSchema = z.strictObject({
  sourceType: z.enum(['MANUAL', 'DOCUMENT_EXTRACTION']).default('MANUAL'),
  sourceDocumentId: z.string().uuid().nullable().optional(),
  extractionMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
  propertyAddress: z.string().trim().min(1).max(500).nullable().optional(),
  buyerNames: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  sellerNames: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  acceptedAt: BuyerContractDateSchema,
  targetClosingDate: BuyerContractDateSchema,
  possessionAt: z.string().datetime().nullable().optional(),
  possessionTerms: z.string().trim().max(4_000).nullable().optional(),
  earnestMoneyAmountCents: z.number().int().min(0).nullable().optional(),
  earnestMoneyRecipient: z.string().trim().max(300).nullable().optional(),
  earnestMoneyMethod: z.string().trim().max(200).nullable().optional(),
  sellerCreditsCents: z.number().int().min(0).nullable().optional(),
  includedItems: z.array(z.string().trim().min(1).max(300)).max(100).default([]),
  excludedItems: z.array(z.string().trim().min(1).max(300)).max(100).default([]),
  agreedRepairs: z.array(z.string().trim().min(1).max(500)).max(100).default([]),
  specialConditions: z.string().trim().max(10_000).nullable().optional(),
  contingencies: z.array(BuyerContractContingencySchema).max(50).default([]),
});
export const BuyerContractRevisionCreateSchema = BuyerContractRevisionFieldsSchema;
export const BuyerContractRevisionUpdateSchema = z.preprocess(
  (value) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0 ? null : value,
  BuyerContractRevisionFieldsSchema.partial(),
);
export const BuyerContractRevisionConfirmSchema = z.strictObject({
  confirmed: z.literal(true),
  fieldConfirmations: z.array(z.strictObject({
    fieldKey: z.enum(BUYER_CONTRACT_FIELD_KEYS),
    sourceDocumentId: z.string().uuid().nullable().optional(),
    sourcePage: z.number().int().min(1).max(10_000).nullable().optional(),
    sourceLabel: z.string().trim().max(500).nullable().optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
  })).min(1).max(BUYER_CONTRACT_FIELD_KEYS.length),
});
export type BuyerContractRevisionCreateInput = z.infer<typeof BuyerContractRevisionCreateSchema>;
export type BuyerContractRevisionUpdateInput = z.infer<typeof BuyerContractRevisionUpdateSchema>;
export type BuyerContractRevisionConfirmInput = z.infer<typeof BuyerContractRevisionConfirmSchema>;

export const BUYER_PURCHASE_PATHS = ['CASH', 'FINANCED'] as const;
export const BuyerPurchaseFinancingInputSchema = z.strictObject({
  purchasePath: z.enum(BUYER_PURCHASE_PATHS),
});
export type BuyerPurchaseFinancingInput = z.infer<typeof BuyerPurchaseFinancingInputSchema>;

export const BUYER_PURCHASE_LOAN_TYPES = ['FIXED', 'ARM', 'OTHER'] as const;
export const BUYER_PURCHASE_CASH_DIRECTIONS = ['FROM_BORROWER', 'TO_BORROWER', 'UNKNOWN'] as const;
export const BUYER_PURCHASE_RATE_LOCK_STATUSES = ['LOCKED', 'NOT_LOCKED', 'UNKNOWN'] as const;
const BuyerPurchaseLoanEstimateFieldsSchema = z.strictObject({
  sourceType: z.enum(['MANUAL', 'DOCUMENT_EXTRACTION']).optional(),
  sourceDocumentId: z.string().uuid().nullable().optional(),
  extractionMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
  loanAmountCents: z.number().int().positive().nullable().optional(),
  loanTermMonths: z.number().int().min(1).max(600).nullable().optional(),
  loanType: z.enum(BUYER_PURCHASE_LOAN_TYPES).nullable().optional(),
  noteRateBps: z.number().int().min(0).max(5_000).nullable().optional(),
  aprBps: z.number().int().min(0).max(5_000).nullable().optional(),
  monthlyPrincipalAndInterestCents: z.number().int().min(0).nullable().optional(),
  monthlyMortgageInsuranceCents: z.number().int().min(0).nullable().optional(),
  estimatedTotalMonthlyPaymentCents: z.number().int().min(0).nullable().optional(),
  loanCostsCents: z.number().int().min(0).nullable().optional(),
  lenderCreditsCents: z.number().int().min(0).nullable().optional(),
  discountPointsBps: z.number().int().min(0).max(10_000).nullable().optional(),
  discountPointsCents: z.number().int().min(0).nullable().optional(),
  prepaidAndEscrowCents: z.number().int().min(0).nullable().optional(),
  cashToCloseCents: z.number().int().min(0).nullable().optional(),
  cashToCloseDirection: z.enum(BUYER_PURCHASE_CASH_DIRECTIONS).optional(),
  fiveYearTotalPaidCents: z.number().int().min(0).nullable().optional(),
  fiveYearPrincipalPaidCents: z.number().int().min(0).nullable().optional(),
  issuedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  rateLockStatus: z.enum(BUYER_PURCHASE_RATE_LOCK_STATUSES).optional(),
  rateLockExpirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
export const BuyerPurchaseLoanEstimateCreateSchema = BuyerPurchaseLoanEstimateFieldsSchema.extend({
  lenderName: z.string().trim().min(1).max(200),
});
export const BuyerPurchaseLoanEstimateRevisionCreateSchema = BuyerPurchaseLoanEstimateFieldsSchema;
export const BuyerPurchaseLoanEstimateUpdateSchema = BuyerPurchaseLoanEstimateFieldsSchema.refine(
  (value) => Object.values(value).some((field) => field !== undefined),
  { message: 'At least one Loan Estimate field must be provided.' },
);
export type BuyerPurchaseLoanEstimateCreateInput = z.infer<typeof BuyerPurchaseLoanEstimateCreateSchema>;
export type BuyerPurchaseLoanEstimateRevisionInput = z.infer<typeof BuyerPurchaseLoanEstimateRevisionCreateSchema>;
export type BuyerPurchaseLoanEstimateUpdateInput = z.infer<typeof BuyerPurchaseLoanEstimateUpdateSchema>;
export const BuyerPurchaseLoanSelectionSchema = z.strictObject({
  revisionId: z.string().uuid(),
  intentToProceed: z.boolean(),
});
export type BuyerPurchaseLoanSelectionInput = z.infer<typeof BuyerPurchaseLoanSelectionSchema>;

export const BUYER_CLOSING_FUNDS_METHODS = ['UNKNOWN', 'WIRE', 'CASHIERS_CHECK', 'OTHER'] as const;
export const BUYER_CLOSING_VERIFICATION_CHANNELS = ['UNKNOWN', 'KNOWN_PHONE', 'IN_PERSON', 'SECURE_PORTAL', 'OTHER'] as const;
const BuyerClosingDisclosureFieldsSchema = z.strictObject({
  sourceType: z.enum(['MANUAL', 'DOCUMENT_EXTRACTION']).optional(),
  sourceDocumentId: z.string().uuid().nullable().optional(),
  extractionMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
  issuedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  loanAmountCents: z.number().int().positive().nullable().optional(),
  noteRateBps: z.number().int().min(0).max(5_000).nullable().optional(),
  aprBps: z.number().int().min(0).max(5_000).nullable().optional(),
  estimatedTotalMonthlyPaymentCents: z.number().int().min(0).nullable().optional(),
  loanCostsCents: z.number().int().min(0).nullable().optional(),
  lenderCreditsCents: z.number().int().min(0).nullable().optional(),
  prepaidAndEscrowCents: z.number().int().min(0).nullable().optional(),
  sellerCreditsCents: z.number().int().min(0).nullable().optional(),
  cashToCloseCents: z.number().int().min(0).nullable().optional(),
  cashToCloseDirection: z.enum(BUYER_PURCHASE_CASH_DIRECTIONS).optional(),
  changeExplanation: z.string().trim().max(4_000).nullable().optional(),
});
export const BuyerClosingDisclosureCreateSchema = BuyerClosingDisclosureFieldsSchema;
export const BuyerClosingDisclosureUpdateSchema = BuyerClosingDisclosureFieldsSchema.refine(
  (value) => Object.values(value).some((field) => field !== undefined),
  { message: 'At least one Closing Disclosure field must be provided.' },
);
export const BuyerClosingFundsReadinessUpdateSchema = z.strictObject({
  fundsMethod: z.enum(BUYER_CLOSING_FUNDS_METHODS).optional(),
  fundsExpectedAt: z.string().datetime().nullable().optional(),
  fundsReady: z.boolean().optional(),
  instructionsVerified: z.boolean().optional(),
  verificationChannel: z.enum(BUYER_CLOSING_VERIFICATION_CHANNELS).optional(),
  questions: z.array(z.string().trim().min(1).max(500)).max(25).optional(),
  questionsResolved: z.boolean().optional(),
}).refine((value) => Object.values(value).some((field) => field !== undefined), {
  message: 'At least one funds-readiness field must be provided.',
});
export type BuyerClosingDisclosureInput = z.infer<typeof BuyerClosingDisclosureCreateSchema>;
export type BuyerClosingDisclosureUpdateInput = z.infer<typeof BuyerClosingDisclosureUpdateSchema>;
export type BuyerClosingFundsReadinessUpdateInput = z.infer<typeof BuyerClosingFundsReadinessUpdateSchema>;

export const BUYER_CLOSING_CHECKLIST_ITEM_STATUSES = ['UNKNOWN', 'CONFIRMED', 'NOT_APPLICABLE'] as const;
export const BuyerClosingDayUpdateSchema = z.strictObject({
  attendees: z.array(z.string().trim().min(1).max(160)).max(20).optional(),
  requiredDocuments: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  questions: z.array(z.string().trim().min(1).max(500)).max(30).optional(),
  identificationReady: z.boolean().optional(),
  requiredDocumentsReady: z.boolean().optional(),
  fundsReadinessReviewed: z.boolean().optional(),
  blockersReviewed: z.boolean().optional(),
  questionsResolved: z.boolean().optional(),
  signingCompleted: z.boolean().optional(),
  copiesReceived: z.boolean().optional(),
  signedClosingDocumentId: z.string().uuid().nullable().optional(),
  keysStatus: z.enum(BUYER_CLOSING_CHECKLIST_ITEM_STATUSES).optional(),
  remotesStatus: z.enum(BUYER_CLOSING_CHECKLIST_ITEM_STATUSES).optional(),
  accessCodesStatus: z.enum(BUYER_CLOSING_CHECKLIST_ITEM_STATUSES).optional(),
  mailboxAccessStatus: z.enum(BUYER_CLOSING_CHECKLIST_ITEM_STATUSES).optional(),
  warrantiesManualsStatus: z.enum(BUYER_CLOSING_CHECKLIST_ITEM_STATUSES).optional(),
  possessionConfirmed: z.boolean().optional(),
  preparationNotes: z.string().trim().max(4_000).nullable().optional(),
}).refine((value) => Object.values(value).some((field) => field !== undefined), {
  message: 'At least one Closing Day field must be provided.',
});
export const BuyerClosingDayConfirmSchema = z.strictObject({
  professionalClosingComplete: z.literal(true),
  closedAt: z.string().datetime(),
  confirmationNotes: z.string().trim().max(2_000).nullable().optional(),
}).refine((value) => new Date(value.closedAt).getTime() <= Date.now() + 5 * 60_000, {
  message: 'Professional closing completion cannot be recorded in the future.',
  path: ['closedAt'],
});
export type BuyerClosingDayUpdateInput = z.infer<typeof BuyerClosingDayUpdateSchema>;
export type BuyerClosingDayConfirmInput = z.infer<typeof BuyerClosingDayConfirmSchema>;

export const BUYER_PURCHASE_APPRAISAL_STATUSES = [
  'NOT_ORDERED', 'ORDERED', 'SCHEDULED', 'COMPLETED', 'ISSUE_REPORTED', 'RESOLVED',
] as const;
export const BUYER_PURCHASE_UNDERWRITING_STATUSES = [
  'NOT_STARTED', 'IN_REVIEW', 'CONDITIONAL', 'USER_RECORDED_CLEAR_TO_CLOSE',
] as const;
export const BUYER_LENDER_CONDITION_CATEGORIES = [
  'INCOME_ASSET', 'CREDIT', 'APPRAISAL', 'INSURANCE_PROOF', 'TITLE', 'FINAL_VERIFICATION', 'OTHER',
] as const;
export const BUYER_LENDER_CONDITION_STATUSES = ['OPEN', 'SUBMITTED', 'SATISFIED', 'WAIVED'] as const;

export const BuyerPurchaseLenderReadinessUpdateSchema = z.strictObject({
  appraisalStatus: z.enum(BUYER_PURCHASE_APPRAISAL_STATUSES).optional(),
  appraisalOrderedAt: z.string().datetime().nullable().optional(),
  appraisalScheduledAt: z.string().datetime().nullable().optional(),
  appraisalCompletedAt: z.string().datetime().nullable().optional(),
  appraisalIssueType: z.string().trim().max(160).nullable().optional(),
  appraisalIssueNotes: z.string().trim().max(4_000).nullable().optional(),
  appraisalIssueResolvedAt: z.string().datetime().nullable().optional(),
  underwritingStatus: z.enum(BUYER_PURCHASE_UNDERWRITING_STATUSES).optional(),
}).refine((value) => Object.values(value).some((field) => field !== undefined), {
  message: 'At least one appraisal or underwriting field must be provided.',
});

export const BuyerLenderConditionCreateSchema = z.strictObject({
  category: z.enum(BUYER_LENDER_CONDITION_CATEGORIES),
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(4_000).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  blocking: z.boolean().default(false),
});

export const BuyerLenderConditionUpdateSchema = z.strictObject({
  status: z.enum(BUYER_LENDER_CONDITION_STATUSES).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(4_000).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  blocking: z.boolean().optional(),
}).refine((value) => Object.values(value).some((field) => field !== undefined), {
  message: 'At least one lender-condition field must be provided.',
});

export type BuyerPurchaseLenderReadinessUpdateInput = z.infer<typeof BuyerPurchaseLenderReadinessUpdateSchema>;
export type BuyerLenderConditionCreateInput = z.infer<typeof BuyerLenderConditionCreateSchema>;
export type BuyerLenderConditionUpdateInput = z.infer<typeof BuyerLenderConditionUpdateSchema>;

export const BUYER_TITLE_REVIEW_STATUSES = ['NOT_RECEIVED', 'RECEIVED', 'QUESTIONS_OPEN', 'REVIEWED_WITH_PROFESSIONAL'] as const;
export const BUYER_TITLE_REQUIREMENT_STATUSES = ['UNKNOWN', 'REQUIRED', 'NOT_REQUIRED'] as const;
export const BUYER_CLOSING_APPOINTMENT_FORMATS = ['UNKNOWN', 'IN_PERSON', 'REMOTE', 'HYBRID'] as const;
export const BUYER_TITLE_ISSUE_CATEGORIES = [
  'TITLE_EXCEPTION', 'LIEN_JUDGMENT', 'EASEMENT', 'VESTING_DEED_NAME', 'LEGAL_DESCRIPTION',
  'SURVEY', 'ASSOCIATION', 'MUNICIPAL_PERMIT_COO', 'SEPTIC_WELL', 'OTHER',
] as const;
export const BUYER_TITLE_ISSUE_STATUSES = ['OPEN', 'PROFESSIONAL_REVIEW', 'RESOLVED', 'WAIVED'] as const;

const BuyerTitleEscrowContactSchema = z.strictObject({
  role: z.enum(['ATTORNEY', 'TITLE_ESCROW']),
  name: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200).nullable().optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(2_000).nullable().optional(),
});

export const BuyerTitleEscrowWorkspaceUpdateSchema = z.strictObject({
  contact: BuyerTitleEscrowContactSchema.nullable().optional(),
  earnestMoneyConfirmed: z.boolean().optional(),
  titleCommitmentDocumentId: z.string().uuid().nullable().optional(),
  titleReviewStatus: z.enum(BUYER_TITLE_REVIEW_STATUSES).optional(),
  surveyRequirement: z.enum(BUYER_TITLE_REQUIREMENT_STATUSES).optional(),
  surveyDocumentId: z.string().uuid().nullable().optional(),
  associationRequirement: z.enum(BUYER_TITLE_REQUIREMENT_STATUSES).optional(),
  associationDocumentId: z.string().uuid().nullable().optional(),
  associationReviewed: z.boolean().optional(),
  localRequirementsNotes: z.string().trim().max(4_000).nullable().optional(),
  closingAppointmentAt: z.string().datetime().nullable().optional(),
  closingAppointmentFormat: z.enum(BUYER_CLOSING_APPOINTMENT_FORMATS).optional(),
  closingLocation: z.string().trim().max(500).nullable().optional(),
  possessionAt: z.string().datetime().nullable().optional(),
}).refine((value) => Object.values(value).some((field) => field !== undefined), {
  message: 'At least one title or escrow field must be provided.',
});

export const BuyerTitleEscrowIssueCreateSchema = z.strictObject({
  category: z.enum(BUYER_TITLE_ISSUE_CATEGORIES),
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(4_000).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  blocking: z.boolean().default(false),
});

export const BuyerTitleEscrowIssueUpdateSchema = z.strictObject({
  status: z.enum(BUYER_TITLE_ISSUE_STATUSES).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(4_000).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  blocking: z.boolean().optional(),
}).refine((value) => Object.values(value).some((field) => field !== undefined), {
  message: 'At least one title-issue field must be provided.',
});

export type BuyerTitleEscrowWorkspaceUpdateInput = z.infer<typeof BuyerTitleEscrowWorkspaceUpdateSchema>;
export type BuyerTitleEscrowIssueCreateInput = z.infer<typeof BuyerTitleEscrowIssueCreateSchema>;
export type BuyerTitleEscrowIssueUpdateInput = z.infer<typeof BuyerTitleEscrowIssueUpdateSchema>;

export const BUYER_INSURANCE_QUOTE_STATUSES = ['DRAFT', 'REVIEWED', 'SELECTED', 'DECLINED'] as const;
export const BUYER_INSURANCE_PROOF_STATUSES = ['NOT_REQUIRED', 'PENDING', 'DELIVERED'] as const;
export const BUYER_INSURANCE_REQUIREMENT_CATEGORIES = [
  'PROPERTY_CONDITION', 'ROOF', 'ELECTRICAL', 'PLUMBING', 'PRIOR_LOSS', 'LENDER', 'OTHER',
] as const;
export const BUYER_INSURANCE_REQUIREMENT_STATUSES = ['OPEN', 'SUBMITTED', 'RESOLVED', 'WAIVED'] as const;

const BuyerInsuranceContactSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200).nullable().optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(2_000).nullable().optional(),
});

export const BuyerInsuranceWorkspaceUpdateSchema = z.strictObject({
  contact: BuyerInsuranceContactSchema.nullable().optional(),
  requiredEffectiveAt: z.string().datetime().nullable().optional(),
  binderDocumentId: z.string().uuid().nullable().optional(),
  lenderProofStatus: z.enum(BUYER_INSURANCE_PROOF_STATUSES).optional(),
  closingProofStatus: z.enum(BUYER_INSURANCE_PROOF_STATUSES).optional(),
  riskAndEligibilityNotes: z.string().trim().max(4_000).nullable().optional(),
}).refine((value) => Object.values(value).some((field) => field !== undefined), {
  message: 'At least one buyer-insurance field must be provided.',
});

const BuyerInsuranceQuoteFieldsSchema = z.strictObject({
  carrierName: z.string().trim().min(1).max(200),
  annualPremiumCents: z.number().int().min(0).nullable().optional(),
  deductibleCents: z.number().int().min(0).nullable().optional(),
  dwellingLimitCents: z.number().int().min(0).nullable().optional(),
  personalPropertyLimitCents: z.number().int().min(0).nullable().optional(),
  liabilityLimitCents: z.number().int().min(0).nullable().optional(),
  lossOfUseLimitCents: z.number().int().min(0).nullable().optional(),
  replacementCostBasis: z.boolean().nullable().optional(),
  exclusionsNotes: z.string().trim().max(4_000).nullable().optional(),
  endorsementsNotes: z.string().trim().max(4_000).nullable().optional(),
  catastropheOptionsNotes: z.string().trim().max(4_000).nullable().optional(),
  sourceDocumentId: z.string().uuid().nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
});
export const BuyerInsuranceQuoteCreateSchema = BuyerInsuranceQuoteFieldsSchema;
export const BuyerInsuranceQuoteUpdateSchema = BuyerInsuranceQuoteFieldsSchema.partial().extend({
  status: z.enum(BUYER_INSURANCE_QUOTE_STATUSES).optional(),
}).refine((value) => Object.values(value).some((field) => field !== undefined), {
  message: 'At least one quote field must be provided.',
}).refine((value) => value.status !== 'SELECTED', {
  message: 'Use the dedicated buyer-selection action to select a quote.',
  path: ['status'],
});

export const BuyerInsuranceBindSchema = z.strictObject({
  quoteId: z.string().uuid(),
  policyNumber: z.string().trim().min(1).max(160),
  effectiveAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
}).refine((value) => new Date(value.expiresAt) > new Date(value.effectiveAt), {
  message: 'Policy expiration must be after its effective date.',
  path: ['expiresAt'],
});

export const BuyerInsuranceRequirementCreateSchema = z.strictObject({
  category: z.enum(BUYER_INSURANCE_REQUIREMENT_CATEGORIES),
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(4_000).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  blocking: z.boolean().default(false),
});
export const BuyerInsuranceRequirementUpdateSchema = z.strictObject({
  status: z.enum(BUYER_INSURANCE_REQUIREMENT_STATUSES).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(4_000).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  blocking: z.boolean().optional(),
}).refine((value) => Object.values(value).some((field) => field !== undefined), {
  message: 'At least one insurance-requirement field must be provided.',
});

export type BuyerInsuranceWorkspaceUpdateInput = z.infer<typeof BuyerInsuranceWorkspaceUpdateSchema>;
export type BuyerInsuranceQuoteCreateInput = z.infer<typeof BuyerInsuranceQuoteCreateSchema>;
export type BuyerInsuranceQuoteUpdateInput = z.infer<typeof BuyerInsuranceQuoteUpdateSchema>;
export type BuyerInsuranceBindInput = z.infer<typeof BuyerInsuranceBindSchema>;
export type BuyerInsuranceRequirementCreateInput = z.infer<typeof BuyerInsuranceRequirementCreateSchema>;
export type BuyerInsuranceRequirementUpdateInput = z.infer<typeof BuyerInsuranceRequirementUpdateSchema>;

export const BUYER_WALKTHROUGH_OBSERVATION_CATEGORIES = [
  'OVERALL_CONDITION', 'INCLUDED_ITEMS', 'AGREED_REPAIRS', 'NEW_DAMAGE', 'LIGHTING_ELECTRICAL',
  'PLUMBING', 'HVAC_APPLIANCES', 'DOORS_WINDOWS', 'GARAGE_ACCESS', 'SMOKE_CO', 'OTHER',
] as const;
export const BUYER_WALKTHROUGH_OBSERVATION_STATUSES = ['NOT_REVIEWED', 'ACCEPTABLE', 'ISSUE', 'NOT_APPLICABLE'] as const;
export const BUYER_WALKTHROUGH_ISSUE_CATEGORIES = [
  'REPAIR_COMMITMENT', 'INCLUDED_ITEM', 'NEW_DAMAGE', 'ACCESS_UTILITY', 'SYSTEM_SAFETY', 'CLEANLINESS', 'OTHER',
] as const;
export const BUYER_WALKTHROUGH_ISSUE_STATUSES = ['OPEN', 'ROUTED_TO_PROFESSIONAL', 'RESOLVED', 'ACCEPTED_AS_IS'] as const;

export const BuyerWalkthroughWorkspaceUpdateSchema = z.strictObject({
  scheduledAt: z.string().datetime().nullable().optional(),
  attendees: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
  accessConfirmed: z.boolean().optional(),
  utilitiesConfirmed: z.boolean().optional(),
  started: z.boolean().optional(),
  generalNotes: z.string().trim().max(4_000).nullable().optional(),
}).refine((value) => Object.values(value).some((field) => field !== undefined), {
  message: 'At least one walkthrough field must be provided.',
});

export const BuyerWalkthroughObservationCreateSchema = z.strictObject({
  area: z.string().trim().min(1).max(160),
  category: z.enum(BUYER_WALKTHROUGH_OBSERVATION_CATEGORIES),
  status: z.enum(BUYER_WALKTHROUGH_OBSERVATION_STATUSES).default('NOT_REVIEWED'),
  notes: z.string().trim().max(4_000).nullable().optional(),
  evidenceDocumentId: z.string().uuid().nullable().optional(),
});
export const BuyerWalkthroughObservationUpdateSchema = z.strictObject({
  area: z.string().trim().min(1).max(160).optional(),
  category: z.enum(BUYER_WALKTHROUGH_OBSERVATION_CATEGORIES).optional(),
  status: z.enum(BUYER_WALKTHROUGH_OBSERVATION_STATUSES).optional(),
  notes: z.string().trim().max(4_000).nullable().optional(),
  evidenceDocumentId: z.string().uuid().nullable().optional(),
}).refine((value) => Object.values(value).some((field) => field !== undefined), {
  message: 'At least one walkthrough observation field must be provided.',
});

export const BuyerWalkthroughIssueCreateSchema = z.strictObject({
  sourceObservationId: z.string().uuid().nullable().optional(),
  inspectionFindingId: z.string().uuid().nullable().optional(),
  negotiationFindingId: z.string().uuid().nullable().optional(),
  category: z.enum(BUYER_WALKTHROUGH_ISSUE_CATEGORIES),
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(4_000).nullable().optional(),
  evidenceDocumentId: z.string().uuid().nullable().optional(),
  blocking: z.boolean().default(false),
});
export const BuyerWalkthroughIssueUpdateSchema = z.strictObject({
  status: z.enum(BUYER_WALKTHROUGH_ISSUE_STATUSES).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().max(4_000).nullable().optional(),
  evidenceDocumentId: z.string().uuid().nullable().optional(),
  blocking: z.boolean().optional(),
  routedToRole: z.enum(['BUYER_AGENT', 'ATTORNEY', 'TITLE_ESCROW', 'OTHER']).nullable().optional(),
}).refine((value) => Object.values(value).some((field) => field !== undefined), {
  message: 'At least one walkthrough issue field must be provided.',
}).refine((value) => value.status !== 'ROUTED_TO_PROFESSIONAL' || Boolean(value.routedToRole), {
  message: 'Choose the professional role receiving the issue.',
  path: ['routedToRole'],
});

export type BuyerWalkthroughWorkspaceUpdateInput = z.infer<typeof BuyerWalkthroughWorkspaceUpdateSchema>;
export type BuyerWalkthroughObservationCreateInput = z.infer<typeof BuyerWalkthroughObservationCreateSchema>;
export type BuyerWalkthroughObservationUpdateInput = z.infer<typeof BuyerWalkthroughObservationUpdateSchema>;
export type BuyerWalkthroughIssueCreateInput = z.infer<typeof BuyerWalkthroughIssueCreateSchema>;
export type BuyerWalkthroughIssueUpdateInput = z.infer<typeof BuyerWalkthroughIssueUpdateSchema>;

export const BUYER_INSPECTION_SPECIALIST_SCOPES = [
  'RADON',
  'SEWER_SEPTIC',
  'WELL_WATER',
  'PEST',
  'CHIMNEY',
  'ROOF',
  'STRUCTURAL',
  'ELECTRICAL',
  'HVAC',
  'POOL_SPA',
  'OIL_TANK',
  'MOLD',
  'ENVIRONMENTAL',
  'OTHER',
] as const;

export const BuyerInspectionPlanInputSchema = z.strictObject({
  scheduledAt: z.string().datetime().nullable().optional(),
  appointmentCompletedAt: z.string().datetime().nullable().optional(),
  accessNotes: z.string().trim().max(4_000).nullable().optional(),
  attendees: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
  reportDueAt: z.string().datetime().nullable().optional(),
  contingencyDueAt: z.string().datetime().nullable().optional(),
  scopeNotes: z.string().trim().max(4_000).nullable().optional(),
  specialistScopes: z.array(z.enum(BUYER_INSPECTION_SPECIALIST_SCOPES)).max(20).optional(),
  propertyQuestions: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
  reinspectionRequired: z.boolean().optional(),
  reinspectionScheduledAt: z.string().datetime().nullable().optional(),
  reinspectionCompletedAt: z.string().datetime().nullable().optional(),
  reinspectionProofDocumentId: z.string().uuid().nullable().optional(),
  reinspectionNotes: z.string().trim().max(4_000).nullable().optional(),
}).refine((value) => Object.values(value).some((field) => field !== undefined), {
  message: 'At least one inspection-plan field must be provided.',
});
export type BuyerInspectionPlanInput = z.infer<typeof BuyerInspectionPlanInputSchema>;

export const BuyerMilestoneInputSchema = z.strictObject({
  milestoneKey: z.string().trim().min(1).max(200).regex(/^buyer:milestone:[a-z0-9][a-z0-9:-]*$/),
  type: BuyerMilestoneTypeSchema,
  customLabel: z.string().trim().min(1).max(160).nullable().optional(),
  status: BuyerMilestoneStatusSchema.default('NOT_STARTED'),
  dueAt: z.string().datetime().nullable().optional(),
  responsibleUserId: z.string().trim().min(1).nullable().optional(),
  sourceType: z.string().trim().min(1).max(120).nullable().optional(),
  sourceEntityId: z.string().trim().min(1).max(200).nullable().optional(),
  sourceDocumentId: z.string().trim().min(1).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  notes: z.string().trim().max(4_000).nullable().optional(),
}).superRefine((value, context) => {
  if (value.type === 'CUSTOM' && !value.customLabel) {
    context.addIssue({ code: 'custom', message: 'customLabel is required for custom milestones.', path: ['customLabel'] });
  }
});

export const BuyerContactInputSchema = z.strictObject({
  role: BuyerContactRoleSchema,
  name: z.string().trim().min(1).max(160),
  company: z.string().trim().max(160).nullable().optional(),
  email: z.email().max(320).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(4_000).nullable().optional(),
});

export const BuyerTaskCompletionInputSchema = z.strictObject({
  method: BuyerCompletionMethodSchema,
  documentId: z.string().trim().min(1).nullable().optional(),
  evidence: z.record(z.string(), z.unknown()).nullable().optional(),
  notes: z.string().trim().max(4_000).nullable().optional(),
}).superRefine((value, context) => {
  if (value.method === 'DOCUMENT' && !value.documentId) {
    context.addIssue({ code: 'custom', message: 'documentId is required for document completion.', path: ['documentId'] });
  }
});

export const BuyerTaskBatchUpdateSchema = z.strictObject({
  taskIds: z.array(z.string().trim().min(1)).min(1).max(100),
  status: HomeBuyerTaskStatusSchema.optional(),
  assignedToUserId: z.string().trim().min(1).nullable().optional(),
}).refine((value) => value.status !== undefined || value.assignedToUserId !== undefined, {
  message: 'At least one batch update field must be provided.',
});

export const BuyerChecklistApplicabilitySchema = z.strictObject({
  ruleKey: z.string().trim().min(1).max(160),
  result: BuyerTaskApplicabilitySchema,
  reasonCodes: z.array(z.string().trim().min(1).max(120)).max(40),
  usedFactKeys: z.array(z.string().trim().min(1).max(160)).max(100),
  missingFactKeys: z.array(z.string().trim().min(1).max(160)).max(100),
  conflictedFactKeys: z.array(z.string().trim().min(1).max(160)).max(100),
  basisHash: z.string().trim().min(1).max(128),
  evaluatedAt: z.string().datetime(),
});

export const BuyerFindingDispositionInputSchema = z.object({
  disposition: BuyerFindingDispositionSchema,
  notes: z.string().trim().max(2_000).nullable().optional(),
  assignedToUserId: z.string().trim().min(1).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

export const BuyerDocumentVerificationInputSchema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED']),
  notes: z.string().trim().max(1_000).nullable().optional(),
});

export const BuyerImportReadinessSchema = z.object({
  propertyId: z.string().min(1),
  inspectionReports: z.object({
    total: z.number().int().nonnegative(),
    reviewPending: z.number().int().nonnegative(),
    confirmed: z.number().int().nonnegative(),
    openMaterialFindings: z.number().int().nonnegative(),
  }),
  documents: z.object({
    total: z.number().int().nonnegative(),
    verified: z.number().int().nonnegative(),
    unverified: z.number().int().nonnegative(),
  }),
  nextRecommendedStep: z.enum([
    'IMPORT_INSPECTION',
    'REVIEW_EXTRACTION',
    'VERIFY_MATERIAL_FINDINGS',
    'VERIFY_DOCUMENTS',
    'BUILD_90_DAY_PLAN',
  ]),
});

export const BuyerDashboardPresentationModeSchema = z.enum([
  'BUYER_CLOSING',
  'RECENT_OWNER',
  'HOMEOWNER',
  'NEW_HOME',
  'CANDIDATE',
]);

const BuyerClosingHomeTaskSummarySchema = z.strictObject({
  id: z.string().min(1),
  actionKey: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable(),
  status: HomeBuyerTaskStatusSchema,
  phase: BuyerPlanPhaseSchema,
  priority: BuyerPlanPrioritySchema,
  checklistSection: BuyerChecklistSectionSchema.nullable(),
  dueAt: z.string().datetime().nullable(),
  assignedToUserId: z.string().nullable(),
});

export const BuyerPlanOverviewTaskSchema = BuyerClosingHomeTaskSummarySchema.extend({
  taskType: BuyerTaskTypeSchema,
  checklistSection: BuyerChecklistSectionSchema.nullable(),
  templateKey: z.string().nullable(),
  evidenceRequirement: BuyerEvidenceRequirementSchema,
  applicability: BuyerTaskApplicabilitySchema,
  blocking: z.boolean(),
  required: z.boolean(),
  statusReason: z.string().nullable(),
  notes: z.string().nullable(),
  assignedContactId: z.string().nullable(),
  sourceType: BuyerTaskSourceTypeSchema,
  estimatedCostCents: z.number().int().nonnegative().nullable(),
  bookingId: z.string().nullable(),
  sortOrder: z.number().int().nonnegative(),
  completedAt: z.string().datetime().nullable(),
  completionMethod: BuyerCompletionMethodSchema.nullable(),
  completionDocumentId: z.string().nullable(),
  canonicalWorkItemId: z.string().nullable(),
  handedOffMaintenanceTaskId: z.string().nullable(),
  updatedAt: z.string().datetime(),
});

const BuyerClosingHomeMilestoneSchema = z.strictObject({
  id: z.string().min(1),
  milestoneKey: z.string().min(1),
  type: BuyerMilestoneTypeSchema,
  label: z.string().min(1),
  status: BuyerMilestoneStatusSchema,
  dueAt: z.string().datetime().nullable(),
});

const BuyerClosingHomeDeadlineSchema = z.strictObject({
  id: z.string().min(1),
  source: z.enum(['TASK', 'MILESTONE']),
  sourceId: z.string().min(1),
  label: z.string().min(1),
  dueAt: z.string().datetime(),
});

const BuyerClosingHomeReadinessLaneSchema = z.strictObject({
  key: z.enum(['CONTRACT', 'DUE_DILIGENCE', 'CLOSING', 'MOVE']),
  label: z.string().min(1),
  completed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
});

export const BuyerNextActionGuidanceSchema = z.strictObject({
  actionId: z.string().min(1),
  rationale: z.string().min(1),
  consequenceOfDelay: z.string().min(1),
  responsibleParty: z.string().min(1),
  suggestedQuestion: z.string().min(1),
  ctaLabel: z.string().min(1),
  ctaHref: z.string().startsWith('/dashboard/properties/'),
});

export const BUYER_PERSONALIZATION_SETUP_STATUSES = ['PERSONALIZED', 'NEEDS_INPUT'] as const;
export const BuyerPersonalizationStatusSchema = z.strictObject({
  setupStatus: z.enum(BUYER_PERSONALIZATION_SETUP_STATUSES),
  questionsRemaining: z.number().int().nonnegative(),
});

export const BuyerClosingHomeOverviewSchema = z.strictObject({
  property: z.strictObject({
    id: z.string().min(1),
    address: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    zipCode: z.string().min(1),
  }),
  journey: z.strictObject({
    status: BuyerJourneyStatusSchema,
    stage: BuyerJourneyStageSchema,
    targetCloseDate: z.string().datetime().nullable(),
    moveInDate: z.string().datetime().nullable(),
    progress: z.strictObject({
      completed: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
      percent: z.number().min(0).max(100),
    }),
  }),
  personalization: BuyerPersonalizationStatusSchema,
  nextAction: BuyerClosingHomeTaskSummarySchema.nullable(),
  nextActionGuidance: BuyerNextActionGuidanceSchema.nullable(),
  blockers: z.array(BuyerClosingHomeTaskSummarySchema),
  milestones: z.array(BuyerClosingHomeMilestoneSchema),
  upcomingDeadlines: z.array(BuyerClosingHomeDeadlineSchema).default([]),
  readinessLanes: z.array(BuyerClosingHomeReadinessLaneSchema),
  evidence: z.strictObject({
    inspectionState: z.enum(['NOT_STARTED', 'PROCESSING', 'REVIEW_PENDING', 'CONFIRMED']),
    inspectionReportCount: z.number().int().nonnegative(),
    openMaterialFindingCount: z.number().int().nonnegative(),
    documentCount: z.number().int().nonnegative(),
    verifiedDocumentCount: z.number().int().nonnegative(),
    documentsNeedingReviewCount: z.number().int().nonnegative(),
  }),
  people: z.strictObject({
    contactCount: z.number().int().nonnegative(),
    assignedTaskCount: z.number().int().nonnegative(),
  }),
  routes: z.strictObject({
    plan: z.string().startsWith('/dashboard/properties/'),
    documents: z.string().startsWith('/dashboard/properties/'),
    inspection: z.string().startsWith('/dashboard/'),
    ask: z.string().startsWith('/dashboard/ask'),
  }),
});

const BuyerRecentOwnerAdvocacySchema = z.strictObject({
  eligible: z.boolean(),
  successMoment: z.enum(['FIRST_90_DAY_PROGRESS', 'VERIFIED_HOME_RECORD']).nullable(),
  inviteAvailable: z.boolean(),
}).superRefine((value, context) => {
  if (value.eligible && !value.successMoment) {
    context.addIssue({
      code: 'custom',
      message: 'Eligible advocacy requires a meaningful success moment.',
      path: ['successMoment'],
    });
  }
});

export const BuyerRecentOwnerTransitionSchema = z.strictObject({
  property: z.strictObject({
    id: z.string().min(1),
    address: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    zipCode: z.string().min(1),
  }),
  journey: z.strictObject({
    stage: z.enum(['CLOSED', 'MOVE_IN', 'FIRST_30_DAYS', 'DAYS_31_TO_90']),
    ownershipStartedAt: z.string().datetime(),
    daysSinceOwnershipStart: z.number().int().nonnegative().max(90),
    progress: z.strictObject({
      resolved: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
      percent: z.number().min(0).max(100),
      active: z.number().int().nonnegative(),
    }),
  }),
  evidence: z.strictObject({
    documentCount: z.number().int().nonnegative(),
    verifiedDocumentCount: z.number().int().nonnegative(),
    inspectionReportCount: z.number().int().nonnegative(),
    openMaterialFindingCount: z.number().int().nonnegative(),
  }),
  advocacy: BuyerRecentOwnerAdvocacySchema,
  routes: z.strictObject({
    plan: z.string().startsWith('/dashboard/properties/'),
    timeline: z.string().startsWith('/dashboard/properties/'),
    homeRecords: z.string().startsWith('/dashboard/properties/'),
    homeOperations: z.string().startsWith('/dashboard/properties/'),
    household: z.string().startsWith('/dashboard/properties/'),
    ask: z.string().startsWith('/dashboard/ask'),
  }),
});

export const BuyerClosingHomeResponseSchema = z.strictObject({
  presentationMode: BuyerDashboardPresentationModeSchema,
  overview: BuyerClosingHomeOverviewSchema.nullable(),
  recentOwner: BuyerRecentOwnerTransitionSchema.nullable().default(null),
}).superRefine((value, context) => {
  if (value.presentationMode === 'BUYER_CLOSING' && !value.overview) {
    context.addIssue({
      code: 'custom',
      message: 'Buyer Closing Home mode requires an overview.',
      path: ['overview'],
    });
  }
  if (value.presentationMode !== 'BUYER_CLOSING' && value.overview) {
    context.addIssue({
      code: 'custom',
      message: 'Non-buyer presentation modes must not include buyer overview data.',
      path: ['overview'],
    });
  }
  if (value.presentationMode === 'RECENT_OWNER' && !value.recentOwner) {
    context.addIssue({
      code: 'custom',
      message: 'Recent Owner mode requires transition data.',
      path: ['recentOwner'],
    });
  }
  if (value.presentationMode !== 'RECENT_OWNER' && value.recentOwner) {
    context.addIssue({
      code: 'custom',
      message: 'Non-recent-owner presentation modes must not include transition data.',
      path: ['recentOwner'],
    });
  }
});

export const BuyerPlanOverviewSchema = z.strictObject({
  property: z.strictObject({
    id: z.string().min(1),
    address: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    zipCode: z.string().min(1),
  }),
  accessRole: z.enum(['OWNER', 'CONTRIBUTOR', 'VIEWER']),
  plan: z.strictObject({
    id: z.string().min(1),
    propertyId: z.string().min(1),
    status: BuyerJourneyStatusSchema,
    stage: BuyerJourneyStageSchema,
    planStartDate: z.string().datetime(),
    targetCloseDate: z.string().datetime().nullable(),
    moveInDate: z.string().datetime().nullable(),
    ownershipStartedAt: z.string().datetime().nullable(),
    pausedAt: z.string().datetime().nullable(),
    cancelledAt: z.string().datetime().nullable(),
    cancellationReason: z.string().nullable(),
    generationVersion: z.string().nullable(),
    handoffCompletedAt: z.string().datetime().nullable(),
  }),
  tasks: z.array(BuyerPlanOverviewTaskSchema),
  milestones: z.array(BuyerClosingHomeMilestoneSchema),
  contacts: z.array(z.strictObject({
    id: z.string().min(1),
    role: BuyerContactRoleSchema,
    name: z.string().min(1),
    company: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    notes: z.string().nullable(),
  })),
  summary: z.strictObject({
    total: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    inProgress: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    notNeeded: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(),
    progressPercent: z.number().min(0).max(100),
  }),
  nextAction: BuyerPlanOverviewTaskSchema.nullable(),
  nextActionGuidance: BuyerNextActionGuidanceSchema.nullable(),
  workload: z.array(z.strictObject({
    userId: z.string().min(1),
    displayName: z.string().nullable(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    role: z.enum(['OWNER', 'CONTRIBUTOR', 'VIEWER']),
    assignedTaskCount: z.number().int().nonnegative(),
  })),
  history: z.array(z.strictObject({
    id: z.string().min(1),
    kind: z.enum(['TASK', 'MILESTONE']),
    label: z.string().min(1),
    status: z.string().min(1),
    occurredAt: z.string().datetime(),
  })),
});

export type BuyerPlanTaskInput = z.infer<typeof BuyerPlanTaskInputSchema>;
export type BuyerImportReadiness = z.infer<typeof BuyerImportReadinessSchema>;
export type BuyerLifecycleUpdate = z.infer<typeof BuyerLifecycleUpdateSchema>;
export type BuyerJourneyCancelInput = z.infer<typeof BuyerJourneyCancelSchema>;
export type BuyerJourneyPauseInput = z.infer<typeof BuyerJourneyPauseSchema>;
export type BuyerJourneyResumeInput = z.infer<typeof BuyerJourneyResumeSchema>;
export type BuyerFindingDispositionInput = z.infer<typeof BuyerFindingDispositionInputSchema>;
export type BuyerMilestoneInput = z.infer<typeof BuyerMilestoneInputSchema>;
export type BuyerContactInput = z.infer<typeof BuyerContactInputSchema>;
export type BuyerTaskCompletionInput = z.infer<typeof BuyerTaskCompletionInputSchema>;
export type BuyerTaskBatchUpdate = z.infer<typeof BuyerTaskBatchUpdateSchema>;
export type BuyerChecklistApplicability = z.infer<typeof BuyerChecklistApplicabilitySchema>;
export type BuyerDashboardPresentationMode = z.infer<typeof BuyerDashboardPresentationModeSchema>;
export type BuyerClosingHomeOverview = z.infer<typeof BuyerClosingHomeOverviewSchema>;
export type BuyerPersonalizationStatus = z.infer<typeof BuyerPersonalizationStatusSchema>;
export type BuyerRecentOwnerTransition = z.infer<typeof BuyerRecentOwnerTransitionSchema>;
export type BuyerClosingHomeResponse = z.infer<typeof BuyerClosingHomeResponseSchema>;
export type BuyerPlanOverview = z.infer<typeof BuyerPlanOverviewSchema>;
