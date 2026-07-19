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

export type NewHomePilotAssessmentInput = z.infer<typeof NewHomePilotAssessmentInputSchema>;
export type NewHomeLifecycleInput = z.infer<typeof NewHomeLifecycleInputSchema>;
export type NewHomeTaskUpdate = z.infer<typeof NewHomeTaskUpdateSchema>;
