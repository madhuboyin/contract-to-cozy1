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
  PURCHASE_PATH_CONFIRM: 'buyer:phase:purchase-path-confirm',
  LOAN_APPLICATION: 'buyer:financing:loan-application',
  LOAN_ESTIMATES: 'buyer:financing:loan-estimates',
  APPRAISAL_TRACKING: 'buyer:financing:appraisal',
  INSPECTION_PLAN_CONFIRM: 'buyer:phase:inspection-plan-confirm',
  INSPECTION_IMPORT: 'buyer:inspection:import',
  INSPECTION_VERIFY: 'buyer:inspection:verify',
  INSPECTION_REINSPECTION: 'buyer:inspection:reinspection',
  NEGOTIATION_SEPARATE: 'buyer:negotiation:separate',
  COVERAGE_BIND: 'buyer:coverage:bind',
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
  ownershipStartedAt: z.string().datetime().nullable().optional(),
  stage: BuyerJourneyStageSchema.optional(),
}).refine((value) => Object.values(value).some((field) => field !== undefined), {
  message: 'At least one lifecycle anchor must be provided.',
});

export const BUYER_PURCHASE_PATHS = ['CASH', 'FINANCED'] as const;
export const BuyerPurchaseFinancingInputSchema = z.strictObject({
  purchasePath: z.enum(BUYER_PURCHASE_PATHS),
});
export type BuyerPurchaseFinancingInput = z.infer<typeof BuyerPurchaseFinancingInputSchema>;

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

const BuyerClosingHomeReadinessLaneSchema = z.strictObject({
  key: z.enum(['CONTRACT', 'DUE_DILIGENCE', 'CLOSING', 'MOVE']),
  label: z.string().min(1),
  completed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
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
  nextAction: BuyerClosingHomeTaskSummarySchema.nullable(),
  blockers: z.array(BuyerClosingHomeTaskSummarySchema),
  milestones: z.array(BuyerClosingHomeMilestoneSchema),
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

export const BuyerClosingHomeResponseSchema = z.strictObject({
  presentationMode: BuyerDashboardPresentationModeSchema,
  overview: BuyerClosingHomeOverviewSchema.nullable(),
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
export type BuyerFindingDispositionInput = z.infer<typeof BuyerFindingDispositionInputSchema>;
export type BuyerMilestoneInput = z.infer<typeof BuyerMilestoneInputSchema>;
export type BuyerContactInput = z.infer<typeof BuyerContactInputSchema>;
export type BuyerTaskCompletionInput = z.infer<typeof BuyerTaskCompletionInputSchema>;
export type BuyerTaskBatchUpdate = z.infer<typeof BuyerTaskBatchUpdateSchema>;
export type BuyerChecklistApplicability = z.infer<typeof BuyerChecklistApplicabilitySchema>;
export type BuyerDashboardPresentationMode = z.infer<typeof BuyerDashboardPresentationModeSchema>;
export type BuyerClosingHomeOverview = z.infer<typeof BuyerClosingHomeOverviewSchema>;
export type BuyerClosingHomeResponse = z.infer<typeof BuyerClosingHomeResponseSchema>;
export type BuyerPlanOverview = z.infer<typeof BuyerPlanOverviewSchema>;
