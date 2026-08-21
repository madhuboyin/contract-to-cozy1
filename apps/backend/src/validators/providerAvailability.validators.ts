// apps/backend/src/validators/providerAvailability.validators.ts

import { z } from 'zod';

export const CreateAvailabilityWindowSchema = z
  .object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    isAvailable: z.boolean().default(true),
    reason: z.string().max(200).optional(),
  })
  .refine((data) => new Date(data.endDate) > new Date(data.startDate), {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  });

export const UpdateAvailabilityWindowSchema = z
  .object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    isAvailable: z.boolean().optional(),
    reason: z.string().max(200).optional(),
  })
  .refine(
    (data) =>
      !data.startDate || !data.endDate || new Date(data.endDate) > new Date(data.startDate),
    { message: 'endDate must be after startDate', path: ['endDate'] }
  );
