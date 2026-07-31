// apps/backend/src/modules/gazette/validators/gazette.validators.ts
// Zod v4 schemas for the Home Gazette API endpoints.

import { z } from 'zod';

// Schema for raw share token param (64-char lowercase hex from randomBytes(32).toString('hex'))
export const shareTokenSchema = z.string().regex(
  /^[0-9a-f]{64}$/,
  'Invalid share token format',
);

export type ShareToken = z.infer<typeof shareTokenSchema>;
