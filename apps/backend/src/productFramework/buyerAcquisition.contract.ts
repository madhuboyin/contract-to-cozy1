import { z } from 'zod';

export const BUYER_PLAN_PHASES = [
  'PRE_CLOSE',
  'FIRST_30_DAYS',
  'DAYS_31_TO_90',
  'RECURRING_HOME',
] as const;

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
export const BuyerPlanPrioritySchema = z.enum(BUYER_PLAN_PRIORITIES);
export const BuyerTaskSourceTypeSchema = z.enum(BUYER_TASK_SOURCE_TYPES);

export const BuyerTaskLineageSchema = z.object({
  sourceType: BuyerTaskSourceTypeSchema,
  sourceEntityType: z.string().trim().min(1).max(120).nullable(),
  sourceEntityId: z.string().trim().min(1).max(200).nullable(),
  guidanceJourneyId: z.string().trim().min(1).max(200).nullable(),
  homeActionKey: z.string().trim().min(1).max(240).nullable(),
});

export const BuyerPlanTaskInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).optional(),
  actionKey: z.string().trim().min(1).max(240).optional(),
  phase: BuyerPlanPhaseSchema.default('FIRST_30_DAYS'),
  priority: BuyerPlanPrioritySchema.default('PLAN'),
  dueAt: z.string().datetime().nullable().optional(),
  serviceCategory: z.string().trim().min(1).max(100).nullable().optional(),
  assignedToUserId: z.string().trim().min(1).nullable().optional(),
  lineage: BuyerTaskLineageSchema.partial().optional(),
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

export type BuyerPlanTaskInput = z.infer<typeof BuyerPlanTaskInputSchema>;
export type BuyerImportReadiness = z.infer<typeof BuyerImportReadinessSchema>;
