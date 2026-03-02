import { z } from 'zod';

export const patchNarrativeRunBodySchema = z.object({
  action: z.enum(['VIEWED', 'CTA_CLICKED', 'NUDGE_CLICKED', 'COMPLETED', 'DISMISSED']),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type PatchNarrativeRunBody = z.infer<typeof patchNarrativeRunBodySchema>;
