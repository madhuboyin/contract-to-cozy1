// apps/backend/src/validators/adminPaymentOps.validators.ts
import { z } from 'zod';

export const ListPaymentsQuerySchema = z.object({
  query: z.object({
    q: z.string().max(200).optional(),
    status: z.enum(['PENDING', 'AUTHORIZED', 'CAPTURED', 'REFUNDED', 'FAILED', 'CANCELLED']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const CreateRefundRequestBodySchema = z.object({
  amount: z.number().positive().max(1_000_000),
  reason: z.string().min(1, 'reason is required').max(2000),
  policyBasis: z.string().max(300).optional(),
});

export const DecideRefundRequestBodySchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().min(1, 'reason is required').max(2000),
});

export const ListRefundRequestsQuerySchema = z.object({
  query: z.object({
    status: z.enum(['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});
