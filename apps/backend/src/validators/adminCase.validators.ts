// apps/backend/src/validators/adminCase.validators.ts
import { z } from 'zod';

export const ListCasesQuerySchema = z.object({
  query: z.object({
    type: z.enum(['SAFETY', 'ABUSE', 'REVIEW_INVESTIGATION', 'SUPPORT', 'DISPUTE']).optional(),
    status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    entityType: z.string().max(100).optional(),
    entityId: z.string().max(200).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const CreateCaseBodySchema = z.object({
  type: z.enum(['SAFETY', 'ABUSE', 'REVIEW_INVESTIGATION', 'SUPPORT', 'DISPUTE']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(10000),
  entityType: z.string().max(100).optional(),
  entityId: z.string().max(200).optional(),
});

export const ChangeCaseStatusBodySchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
  reason: z.string().min(1, 'reason is required').max(2000),
  resolution: z.string().max(10000).optional(),
});

export const AssignCaseBodySchema = z.object({
  assignedToId: z.string().min(1).max(200).nullable(),
  reason: z.string().min(1, 'reason is required').max(2000),
});

export const AddCaseNoteBodySchema = z.object({
  body: z.string().min(1).max(10000),
});

export const RequestInvestigationBodySchema = z.object({
  reason: z.string().min(1, 'reason is required').max(2000),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
});
