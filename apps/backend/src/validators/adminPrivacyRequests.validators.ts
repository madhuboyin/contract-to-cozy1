// apps/backend/src/validators/adminPrivacyRequests.validators.ts
import { z } from 'zod';

export const ListPrivacyRequestsQuerySchema = z.object({
  query: z.object({
    status: z
      .enum(['RECEIVED', 'VERIFYING', 'VERIFIED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED'])
      .optional(),
    type: z.enum(['ACCESS_EXPORT', 'CORRECTION', 'DELETION', 'RESTRICTION']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const CreatePrivacyRequestBodySchema = z.object({
  userEmail: z.string().email().max(320),
  type: z.enum(['ACCESS_EXPORT', 'CORRECTION', 'DELETION', 'RESTRICTION']),
  jurisdiction: z.string().max(100).optional(),
  dueAt: z.string().datetime().optional(),
});

export const ChangePrivacyRequestStatusBodySchema = z.object({
  status: z.enum(['VERIFYING', 'VERIFIED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED']),
  reason: z.string().min(1, 'reason is required').max(2000),
  resolutionSummary: z.string().max(10000).optional(),
});

export const SetLegalHoldBodySchema = z.object({
  legalHold: z.boolean(),
  reason: z.string().min(1, 'reason is required').max(2000),
});
