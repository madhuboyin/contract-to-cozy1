// apps/backend/src/modules/gazette/validators/gazette.validators.ts
// Zod v4 schemas for the Home Gazette API endpoints.

import { z } from 'zod';

// Schema for triggering edition generation (admin/internal)
export const generateEditionSchema = z.object({
  propertyId: z.string().uuid('propertyId must be a valid UUID'),
  weekStart: z.string().optional(),
  weekEnd: z.string().optional(),
  dryRun: z.boolean().optional().default(false),
});

export type GenerateEditionBody = z.infer<typeof generateEditionSchema>;

// Schema for share creation — no body required (editionId is in params)
export const shareEditionSchema = z.object({});

export type ShareEditionBody = z.infer<typeof shareEditionSchema>;

// Schema for revoking a share link — no body required (token is in params)
export const revokeShareSchema = z.object({});

export type RevokeShareBody = z.infer<typeof revokeShareSchema>;

// Schema for listing editions (query params)
export const editionListQuerySchema = z.object({
  propertyId: z.string().min(1, 'propertyId is required'),
  page: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? Number(v) : 1))
    .pipe(z.number().min(1, 'page must be >= 1')),
  pageSize: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? Number(v) : 10))
    .pipe(z.number().min(1).max(50)),
});

export type EditionListQuery = z.infer<typeof editionListQuerySchema>;

// Schema for fetching current edition (query param)
export const currentEditionQuerySchema = z.object({
  propertyId: z.string().uuid('propertyId must be a valid UUID'),
});

export type CurrentEditionQuery = z.infer<typeof currentEditionQuerySchema>;

// Schema for querying gazette generation jobs
export const gazetteJobsQuerySchema = z.object({
  propertyId: z.string().optional(),
  stage: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? Number(v) : undefined))
    .pipe(z.number().min(1).max(200).optional()),
});

export type GazetteJobsQuery = z.infer<typeof gazetteJobsQuerySchema>;
