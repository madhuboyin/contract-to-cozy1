// apps/backend/src/validators/adminBookingOps.validators.ts
import { z } from 'zod';

export const ListBookingsQuerySchema = z.object({
  query: z.object({
    q: z.string().max(200).optional(),
    status: z.enum(['DRAFT', 'PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DISPUTED']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});
