// apps/backend/src/validators/providerProfileSelf.validators.ts

import { z } from 'zod';
import { ServiceCategory } from '@prisma/client';

export const UpdateProviderProfileSchema = z.object({
  businessName: z.string().min(1).max(200).optional(),
  // Nullable: the client sends null (not undefined) to explicitly clear an
  // optional field, since Prisma treats `undefined` as "leave unchanged."
  businessType: z.string().max(100).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  website: z.string().max(300).nullable().optional(),
  yearsInBusiness: z.number().int().min(0).max(150).nullable().optional(),
  teamSize: z.number().int().min(0).max(10000).nullable().optional(),
  serviceRadius: z.number().int().min(1).max(500).optional(),
  serviceCategories: z.array(z.nativeEnum(ServiceCategory)).optional(),
});
