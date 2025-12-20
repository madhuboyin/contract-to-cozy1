// apps/backend/src/localUpdates/localUpdates.routes.ts
import { Router } from "express";
import { getLocalUpdates, dismissUpdate } from "../localUpdates/localUpdates.controller";
import { authenticate } from "../middleware/auth.middleware";
import { propertyAuthMiddleware } from "../middleware/propertyAuth.middleware";

const router = Router();

router.get(
  "/local-updates",
  authenticate,
  propertyAuthMiddleware,
  getLocalUpdates
);

router.post(
  "/local-updates/:id/dismiss",
  authenticate,
  dismissUpdate
);

export default router;
