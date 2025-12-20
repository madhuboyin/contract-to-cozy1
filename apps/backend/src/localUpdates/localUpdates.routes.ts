// apps/backend/src/localUpdates/localUpdates.routes.ts

import { Router } from "express";
import { getLocalUpdates, dismissUpdate } from "../localUpdates/localUpdates.controller";
import { authenticate } from "../middleware/auth.middleware";
import { propertyAuthMiddleware } from "../middleware/propertyAuth.middleware";

const router = Router();

/**
 * GET /api/local-updates
 */
router.get(
  '/',
  authenticate,
  propertyAuthMiddleware,
  getLocalUpdates
);

/**
 * POST /api/local-updates/:id/dismiss
 */
router.post(
  '/:id/dismiss',
  authenticate,
  dismissUpdate
);

export default router;
