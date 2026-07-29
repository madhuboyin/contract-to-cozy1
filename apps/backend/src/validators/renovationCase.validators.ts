import { z } from 'zod';

export const RenovationCaseLifecycleSchema = z.enum([
  'IDEA',
  'FEASIBILITY',
  'SCOPE_DEFINITION',
  'REQUIREMENTS_RESEARCH',
  'APPROVALS_IN_PROGRESS',
  'PREPARING_TO_START',
  'READY_TO_START',
  'IN_EXECUTION',
  'INSPECTION_AND_CLOSEOUT',
  'VERIFIED_COMPLETE',
  'ON_HOLD',
  'CANCELLED',
  'COMPLETED_WITH_OPEN_ITEMS',
  'HISTORICAL_RESEARCH',
]);

const CaseTypeSchema = z.enum([
  'REMODEL',
  'ADDITION',
  'CONVERSION',
  'REPAIR',
  'REPLACEMENT',
  'ENERGY_UPGRADE',
  'ACCESSIBILITY',
  'LANDSCAPING',
  'HISTORICAL_RESEARCH',
  'OTHER',
]);

const GovernanceTierSchema = z.enum([
  'LOW_CONSEQUENCE',
  'MATERIAL_FINANCIAL',
  'COMPLIANCE_SENSITIVE',
  'SAFETY_SENSITIVE',
  'EMERGENCY',
]);

const ResponsibilitySchema = z.enum([
  'UNKNOWN',
  'HOMEOWNER',
  'ASSOCIATION',
  'SHARED',
  'LANDLORD',
  'OTHER',
]);

const ScopeApprovalSchema = z.enum(['DRAFT', 'PROPOSED', 'APPROVED', 'SUPERSEDED', 'REJECTED']);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const stringList = z.array(z.string().trim().min(1).max(160)).max(100);

export const RenovationScopeInputSchema = z.object({
  summary: z.string().trim().min(1).max(5000).optional(),
  workItems: z.array(z.record(z.string(), z.unknown())).max(250).default([]),
  spacesAffected: stringList.default([]),
  systemsAffected: stringList.default([]),
  intendedUse: z.string().trim().min(1).max(1000).optional(),
  dimensions: z.record(z.string(), z.unknown()).optional(),
  structuralEffects: z.boolean().default(false),
  exteriorEffects: z.boolean().default(false),
  drawingDocumentIds: z.array(z.string().min(1)).max(100).default([]),
  specificationDocumentIds: z.array(z.string().min(1)).max(100).default([]),
  estimatedCostCents: z.number().int().min(0).optional(),
  contractCostCents: z.number().int().min(0).optional(),
  approvalStatus: ScopeApprovalSchema.default('DRAFT'),
});

export const CreateRenovationCaseSchema = z.object({
  name: z.string().trim().min(1).max(240),
  objective: z.string().trim().min(1).max(5000).optional(),
  caseType: CaseTypeSchema,
  governanceTier: GovernanceTierSchema.default('LOW_CONSEQUENCE'),
  responsibilityContext: ResponsibilitySchema.default('UNKNOWN'),
  spacesAffected: stringList.default([]),
  systemsAffected: stringList.default([]),
  targetBudgetCents: z.number().int().min(0).optional(),
  targetStartDate: dateOnly.optional(),
  targetEndDate: dateOnly.optional(),
  entryPoint: z.string().trim().min(1).max(160).optional(),
  sourceType: z.string().trim().min(1).max(160).optional(),
  sourceId: z.string().trim().min(1).max(240).optional(),
  idempotencyKey: z.string().trim().min(1).max(240).optional(),
  initialScope: RenovationScopeInputSchema.optional(),
}).refine(
  (value) => !value.targetStartDate || !value.targetEndDate || value.targetEndDate >= value.targetStartDate,
  { path: ['targetEndDate'], message: 'Target end date must be on or after target start date.' },
);

export const UpdateRenovationCaseSchema = z.object({
  name: z.string().trim().min(1).max(240).optional(),
  objective: z.string().trim().min(1).max(5000).nullable().optional(),
  caseType: CaseTypeSchema.optional(),
  governanceTier: GovernanceTierSchema.optional(),
  responsibilityContext: ResponsibilitySchema.optional(),
  spacesAffected: stringList.optional(),
  systemsAffected: stringList.optional(),
  targetBudgetCents: z.number().int().min(0).nullable().optional(),
  targetStartDate: dateOnly.nullable().optional(),
  targetEndDate: dateOnly.nullable().optional(),
  readinessSummary: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const TransitionRenovationCaseSchema = z.object({
  lifecycle: RenovationCaseLifecycleSchema,
  reason: z.string().trim().min(1).max(2000),
  resumeLifecycle: RenovationCaseLifecycleSchema.optional(),
  idempotencyKey: z.string().trim().min(1).max(240).optional(),
});

export const ArchiveRenovationCaseSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

export const CreateRenovationScopeVersionSchema = RenovationScopeInputSchema.extend({
  changeReason: z.string().trim().min(1).max(2000),
  effectiveAt: z.string().datetime().optional(),
  idempotencyKey: z.string().trim().min(1).max(240).optional(),
});

export const CreateRenovationCaseLinkSchema = z.object({
  linkType: z.enum([
    'PROJECT',
    'ADVISOR_SESSION',
    'PERMIT',
    'HOA_APPROVAL',
    'MATERIAL_SPEC',
    'DOCUMENT',
    'INSPECTION_FINDING',
    'QUOTE_WORKSPACE',
    'CAPITAL_SCENARIO',
  ]),
  targetId: z.string().trim().min(1).max(240),
  scopeVersionId: z.string().trim().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const AddRenovationCaseParticipantSchema = z.object({
  userId: z.string().trim().min(1),
  role: z.enum([
    'OWNER',
    'COORDINATOR',
    'CONTRIBUTOR',
    'CONTRACTOR',
    'DESIGNER',
    'ARCHITECT',
    'ENGINEER',
    'OTHER',
  ]),
  displayName: z.string().trim().min(1).max(240).optional(),
  organizationName: z.string().trim().min(1).max(240).optional(),
});
