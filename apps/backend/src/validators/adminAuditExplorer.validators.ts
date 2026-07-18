// apps/backend/src/validators/adminAuditExplorer.validators.ts
import { z } from 'zod';

export const AuditExplorerQuerySchema = z.object({
  query: z.object({
    actorId: z.string().optional(),
    entityType: z.string().optional(),
    entityId: z.string().optional(),
    action: z.string().optional(),
    requestId: z.string().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    before: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  }),
});
