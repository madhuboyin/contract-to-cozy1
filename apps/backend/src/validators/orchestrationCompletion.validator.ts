import { z } from 'zod';

export const completionCreateSchema = z.object({
  completedAt: z.string().datetime(),
  cost: z.number().min(0).max(999999.99).nullable().optional(),
  didItMyself: z.boolean().optional(),
  serviceProviderName: z.string().max(200).nullable().optional(),
  serviceProviderRating: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  photoIds: z.array(z.string().uuid()).max(5).optional(),
});

export const completionUpdateSchema = completionCreateSchema.partial();

export const photoUploadSchema = z.object({
  file: z.unknown(), // Validated in controller
  propertyId: z.string().uuid(),
  actionKey: z.string().trim().min(1).max(120),
});
