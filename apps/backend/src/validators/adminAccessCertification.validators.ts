// apps/backend/src/validators/adminAccessCertification.validators.ts
import { z } from 'zod';

export const OpenCampaignBodySchema = z.object({
  name: z.string().min(1).max(200),
  dueAt: z.string().datetime().optional(),
});

export const AttestDecisionBodySchema = z.object({
  decision: z.enum(['KEEP', 'REVOKE']),
  reason: z.string().min(1, 'reason is required').max(2000),
});

export const CampaignActionBodySchema = z.object({
  reason: z.string().min(1, 'reason is required').max(2000),
});
