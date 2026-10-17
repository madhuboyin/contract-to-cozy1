// apps/backend/src/routes/toolOverride.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { propertyAuthMiddleware } from '../middleware/propertyAuth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import * as controller from '../controllers/toolOverride.controller';
import { z } from 'zod';

const router = Router({ mergeParams: true });

// Shape only. Which keys exist and which values are valid is the tool's contract (services/toolOverrideContract.ts), checked in the controller.
const schema = z.object({
  toolKey: z.string().min(1).optional(),
  overrides: z.array(z.object({
    key: z.string().min(1),
    // null clears a saved override.
    value: z.number().nullable(),
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
