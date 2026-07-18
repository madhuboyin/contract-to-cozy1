// apps/backend/src/validators/adminUserSupport.validators.ts
import { z } from 'zod';

export const SearchUsersQuerySchema = z.object({
  query: z.object({
    q: z.string().min(1).max(200),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }),
});

export const RevokeSessionsBodySchema = z.object({
  reason: z.string().min(1, 'reason is required').max(2000),
});

export const ChangeStatusBodySchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'INACTIVE']),
  reason: z.string().min(1, 'reason is required').max(2000),
});
