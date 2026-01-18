// apps/backend/src/routes/propertyFinanceSnapshot.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import * as controller from '../controllers/propertyFinanceSnapshot.controller';
import { z } from 'zod';

const router = Router({ mergeParams: true });

const upsertSchema = z.object({
  mortgageBalance: z.number().nonnegative().optional().nullable(),
  interestRate: z.number().min(0).max(1).optional().nullable(),
  remainingTermMonths: z.number().int().positive().optional().nullable(),
  monthlyPayment: z.number().nonnegative().optional().nullable(),
  lastVerifiedAt: z.string().datetime().optional().nullable(),
});

router.get(
  '/properties/:propertyId/finance-snapshot',
  authenticate,
  propertyAuthMiddleware,
  controller.getSnapshot
);

router.put(
  '/properties/:propertyId/finance-snapshot',
  authenticate,
  propertyAuthMiddleware,
  validateBody(upsertSchema),
  controller.upsertSnapshot
);

export default router;
