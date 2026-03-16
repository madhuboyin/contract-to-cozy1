// apps/backend/src/homeRenovationAdvisor/validators/homeRenovationAdvisor.validators.ts
//
// Zod v4 validation schemas for the Home Renovation Risk Advisor API.

import { z } from 'zod';
import {
  HomeRenovationType,
  RenovationAdvisorEntryPoint,
  RenovationAdvisorFlowType,
  RenovationAdvisorSessionStatus,
} from '@prisma/client';

// ============================================================================
// JURISDICTION OVERRIDE SUB-SCHEMA
// ============================================================================

export const jurisdictionOverrideSchema = z.object({
  state: z.string().length(2, 'State must be 2-letter abbreviation').toUpperCase().optional(),
  county: z.string().max(100).trim().optional(),
  city: z.string().max(100).trim().optional(),
  postalCode: z.string().regex(/^\d{5}$/, 'ZIP code must be 5 digits').optional(),
});

// ============================================================================
// CREATE SESSION
// ============================================================================

export const createSessionSchema = z.object({
  propertyId: z.string().uuid('propertyId must be a valid UUID'),
  renovationType: z.nativeEnum(HomeRenovationType),
  entryPoint: z.nativeEnum(RenovationAdvisorEntryPoint),
  flowType: z.nativeEnum(RenovationAdvisorFlowType).optional(),
  projectCostInput: z.number().positive('Project cost must be positive').max(50_000_000).optional(),
  jurisdictionOverride: jurisdictionOverrideSchema.optional(),
  completedModificationReported: z.boolean().optional(),
  isRetroactiveCheck: z.boolean().optional(),
  userConfirmedJurisdiction: z.boolean().optional(),
});

export type CreateSessionBody = z.infer<typeof createSessionSchema>;

// ============================================================================
// UPDATE SESSION
// ============================================================================

export const updateSessionSchema = z.object({
  projectCostInput: z.number().positive().max(50_000_000).optional().nullable(),
  jurisdictionOverride: jurisdictionOverrideSchema.optional().nullable(),
  completedModificationReported: z.boolean().optional(),
  userConfirmedJurisdiction: z.boolean().optional(),
}).refine(
  (v) => Object.keys(v).length > 0,
  { message: 'At least one field must be provided for update' }
);

export type UpdateSessionBody = z.infer<typeof updateSessionSchema>;

// ============================================================================
// EVALUATE SESSION
// ============================================================================

export const evaluateSessionSchema = z.object({
  forceRefresh: z.boolean().optional(),
  evaluationMode: z.enum(['FULL', 'PERMIT_ONLY', 'TAX_ONLY', 'LICENSING_ONLY']).optional(),
});

export type EvaluateSessionBody = z.infer<typeof evaluateSessionSchema>;

// ============================================================================
// LIST SESSIONS QUERY
// ============================================================================

export const listSessionsQuerySchema = z.object({
  status: z.nativeEnum(RenovationAdvisorSessionStatus).optional(),
  renovationType: z.nativeEnum(HomeRenovationType).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().uuid().optional(),
});

export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;

// ============================================================================
// UPDATE COMPLIANCE CHECKLIST
// ============================================================================

import { TriStateChecklistStatus } from '@prisma/client';

export const updateComplianceChecklistSchema = z.object({
  permitObtainedStatus: z.nativeEnum(TriStateChecklistStatus).optional(),
  licensedContractorUsedStatus: z.nativeEnum(TriStateChecklistStatus).optional(),
  reassessmentReceivedStatus: z.nativeEnum(TriStateChecklistStatus).optional(),
  notes: z.string().max(1000).trim().optional().nullable(),
});

export type UpdateComplianceChecklistBody = z.infer<typeof updateComplianceChecklistSchema>;
