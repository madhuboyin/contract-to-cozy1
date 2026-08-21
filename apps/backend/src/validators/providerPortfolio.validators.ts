// apps/backend/src/validators/providerPortfolio.validators.ts

import { z } from 'zod';
import { ServiceCategory } from '@prisma/client';

export const CreatePortfolioItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  category: z.nativeEnum(ServiceCategory),
});

export const UpdatePortfolioItemSchema = CreatePortfolioItemSchema.partial();
