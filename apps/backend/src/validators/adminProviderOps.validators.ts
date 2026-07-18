// apps/backend/src/validators/adminProviderOps.validators.ts
import { z } from 'zod';

export const ListProvidersQuerySchema = z.object({
  query: z.object({
    q: z.string().max(200).optional(),
    status: z.enum(['PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const ChangeProviderStatusBodySchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'INACTIVE']),
  reason: z.string().min(1, 'reason is required').max(2000),
});
