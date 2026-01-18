// apps/backend/src/routes/toolOverride.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import * as controller from '../controllers/toolOverride.controller';
import { z } from 'zod';

const router = Router({ mergeParams: true });

const schema = z.object({
  overrides: z.array(z.object({
    key: z.string().min(1),
    value: z.number(),
  })).default([]),
});

router.get(
  '/properties/:propertyId/tool-overrides',
  authenticate,
  propertyAuthMiddleware,
  controller.listOverrides
);

router.put(
  '/properties/:propertyId/tool-overrides',
  authenticate,
  propertyAuthMiddleware,
  validateBody(schema),
  controller.upsertOverrides
);

export default router;
