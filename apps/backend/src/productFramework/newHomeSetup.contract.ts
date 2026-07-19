import { z } from 'zod';

export const NEW_HOME_PLAN_PHASES = [
  'WALKTHROUGH',
  'FIRST_30_DAYS',
  'DAYS_31_TO_90',
  'FIRST_YEAR',
  'RECURRING_HOME',
] as const;

export const NEW_HOME_RESPONSIBILITIES = ['BUILDER', 'HOMEOWNER', 'SHARED', 'UNKNOWN'] as const;

export const NewHomePilotAssessmentInputSchema = z.object({
  demandScore: z.number().int().min(1).max(5),
  documentAvailability: z.enum(['NONE', 'SOME', 'COMPLETE']),
  builderFollowupPainScore: z.number().int().min(1).max(5),
  engagementIntentScore: z.number().int().min(1).max(5),
  channelSource: z.string().trim().min(1).max(120).nullable().optional(),
  estimatedAcquisitionCents: z.number().int().nonnegative().max(10_000_000).nullable().optional(),
  notes: z.string().trim().max(2_000).nullable().optional(),
});

export const NewHomePilotAdmissionInputSchema = z.object({
  decision: z.enum(['ADMITTED', 'REJECTED']),
  cohortKey: z.string().trim().min(1).max(120).nullable().optional(),
  reasons: z.array(z.string().trim().min(1).max(240)).max(20).default([]),
}).superRefine((value, context) => {
  if (value.decision === 'ADMITTED' && !value.cohortKey) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cohortKey'],
      message: 'An admitted property must be assigned to a controlled pilot cohort.',
    });
  }
  if (value.decision === 'REJECTED' && value.reasons.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reasons'],
      message: 'A rejected admission requires at least one reason.',
    });
  }
});

export const NewHomeLifecycleInputSchema = z.object({
  targetMoveInDate: z.string().datetime().nullable().optional(),
  ownershipStartedAt: z.string().datetime().nullable().optional(),
  builderWarrantyEndsAt: z.string().datetime().nullable().optional(),
  oneYearInspectionDueAt: z.string().datetime().nullable().optional(),
}).refine((value) => Object.values(value).some((item) => item !== undefined), {
  message: 'At least one new-home lifecycle anchor must be provided.',
});

export const NewHomeTaskUpdateSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'NOT_NEEDED']),
  assignedToUserId: z.string().trim().min(1).nullable().optional(),
  completionEvidence: z.record(z.string(), z.unknown()).nullable().optional(),
}).superRefine((value, context) => {
  if (value.status === 'COMPLETED' && !value.completionEvidence) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['completionEvidence'],
      message: 'Completion evidence is required to complete a new-home task.',
    });
  }
});

export const NewHomePunchListInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  priority: z.enum(['NOW', 'SOON', 'PLAN', 'CONSIDER']).default('SOON'),
  builderContact: z.string().trim().max(300).nullable().optional(),
  promisedBy: z.string().datetime().nullable().optional(),
  evidenceDocumentIds: z.array(z.string().min(1)).max(20).default([]),
});

export const NewHomeBuilderResponseInputSchema = z.object({
  responseType: z.enum(['COMMENT', 'ACKNOWLEDGED', 'SCHEDULED', 'REJECTED', 'RESOLVED']),
  message: z.string().trim().max(2_000).nullable().optional(),
  promisedBy: z.string().datetime().nullable().optional(),
  verifyClosure: z.boolean().default(false),
}).superRefine((value, context) => {
  if (value.verifyClosure && value.responseType !== 'RESOLVED') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['verifyClosure'], message: 'Only a resolved builder response can be homeowner-verified.' });
  }
});

export const NewHomeWarrantyRightInputSchema = z.object({
  coverageTitle: z.string().trim().min(1).max(200),
  providerName: z.string().trim().max(200).nullable().optional(),
  coverageSummary: z.string().trim().min(1).max(4_000),
  noticeMethod: z.string().trim().max(500).nullable().optional(),
  noticeDestination: z.string().trim().max(500).nullable().optional(),
  coverageStartsAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime(),
  noticeDeadlineAt: z.string().datetime().nullable().optional(),
  sourceDocumentId: z.string().trim().min(1).nullable().optional(),
  sourceCitation: z.string().trim().min(1).max(1_000),
  extractionConfidence: z.number().min(0).max(1).nullable().optional(),
  verified: z.boolean().default(false),
});

export const NewHomeWarrantyDocumentPromotionSchema = z.object({
  documentId: z.string().min(1),
  sourceCitation: z.string().trim().min(1).max(1_000),
  noticeMethod: z.string().trim().max(500).nullable().optional(),
  noticeDestination: z.string().trim().max(500).nullable().optional(),
  noticeDeadlineAt: z.string().datetime().nullable().optional(),
});

export const NewHomeRegistrationInputSchema = z.object({
  inventoryItemId: z.string().min(1),
  manufacturer: z.string().trim().min(1).max(200),
  modelNumber: z.string().trim().min(1).max(200),
  serialNumber: z.string().trim().min(1).max(200),
  registrationUrl: z.string().url().nullable().optional(),
  status: z.enum(['NOT_STARTED', 'SUBMITTED', 'CONFIRMED', 'NOT_REQUIRED']).default('NOT_STARTED'),
  confirmationDocumentId: z.string().min(1).nullable().optional(),
  notes: z.string().trim().max(2_000).nullable().optional(),
});

export const NewHomeEvidenceInputSchema = z.object({
  evidenceType: z.enum(['PERMIT', 'FINAL_INSPECTION', 'COMMISSIONING', 'MANUAL', 'CERTIFICATE', 'PHOTO', 'OTHER']),
  label: z.string().trim().min(1).max(200),
  documentId: z.string().min(1).nullable().optional(),
  sourceCitation: z.string().trim().max(1_000).nullable().optional(),
  observedAt: z.string().datetime().nullable().optional(),
  verified: z.boolean().default(false),
  notes: z.string().trim().max(2_000).nullable().optional(),
});

export const NewHomeInspectionBundleUpdateSchema = z.object({
  status: z.enum(['PREPARING', 'READY', 'COMPLETED']),
  inspectionReportId: z.string().min(1).nullable().optional(),
}).superRefine((value, context) => {
  if (value.status === 'COMPLETED' && !value.inspectionReportId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['inspectionReportId'], message: 'A completed bundle requires an inspection report.' });
  }
});

export type NewHomePilotAssessmentInput = z.infer<typeof NewHomePilotAssessmentInputSchema>;
export type NewHomeLifecycleInput = z.infer<typeof NewHomeLifecycleInputSchema>;
export type NewHomeTaskUpdate = z.infer<typeof NewHomeTaskUpdateSchema>;
export type NewHomePunchListInput = z.infer<typeof NewHomePunchListInputSchema>;
export type NewHomeBuilderResponseInput = z.infer<typeof NewHomeBuilderResponseInputSchema>;
export type NewHomeWarrantyRightInput = z.infer<typeof NewHomeWarrantyRightInputSchema>;
export type NewHomeRegistrationInput = z.infer<typeof NewHomeRegistrationInputSchema>;
export type NewHomeEvidenceInput = z.infer<typeof NewHomeEvidenceInputSchema>;
