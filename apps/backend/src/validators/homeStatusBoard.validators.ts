import { z } from 'zod';

export const listBoardQuerySchema = z.object({
  q: z.string().optional(),
  groupBy: z.enum(['condition', 'category', 'room']).optional(),
  condition: z.enum(['GOOD', 'MONITOR', 'ACTION_NEEDED']).optional(),
  categoryKey: z.string().optional(),
  pinnedOnly: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  includeHidden: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(parseInt(v, 10), 100) : 50)),
});

export type ListBoardQuery = z.infer<typeof listBoardQuerySchema>;

export const patchItemStatusBodySchema = z.object({
  overrideCondition: z.enum(['GOOD', 'MONITOR', 'ACTION_NEEDED']).nullish(),
  overrideRecommendation: z.enum(['OK', 'REPAIR', 'REPLACE_SOON']).nullish(),
  overridePurchaseDate: z.string().datetime().nullish(),
  overrideInstalledAt: z.string().datetime().nullish(),
  overrideNotes: z.string().max(2000).nullish(),
  isPinned: z.boolean().optional(),
  isHidden: z.boolean().optional(),
});

export type PatchItemStatusBody = z.infer<typeof patchItemStatusBodySchema>;
