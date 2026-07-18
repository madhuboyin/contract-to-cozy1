// apps/backend/src/validators/adminReviewModeration.validators.ts
import { z } from 'zod';

export const ListReviewsQuerySchema = z.object({
  query: z.object({
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'FLAGGED']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const ModerateReviewBodySchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'FLAG', 'RESTORE']),
  reason: z.string().min(1, 'reason is required').max(2000),
  policyVersion: z.string().max(100).optional(),
});
